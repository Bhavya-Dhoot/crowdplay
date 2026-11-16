// BALLOT / CANON receipts (TECH_SPEC §10): one DB row per (user, round, type, option), delivered in-app.
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { liveOptions } from "./engine/publish";
import { newId } from "./ids";
import { log } from "./log";
import { getRealtimeServer } from "./realtime/index";
import type { ReceiptPayload, ReceiptType } from "./realtime/types";

const SEND_TIMEOUT_MS = 3000;
const SEND_CONCURRENCY = 16;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("sendReceipt timed out")), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/**
 * Write receipts for a round and deliver the ones not yet delivered to non-bot users.
 * BALLOT: contributors of every live option. CANON: contributors of the winner.
 * Safe to run twice: the unique index keeps one row per (user, round, type, option).
 */
export async function sendReceipts(args: {
  showId: string;
  roundNo: number;
  kind: ReceiptType;
  /** Restrict BALLOT to specific options (a veto replacement). */
  onlyOptionIds?: string[];
}): Promise<{ created: number; delivered: number }> {
  const db = await getDb();
  const [round] = await db
    .select()
    .from(schema.rounds)
    .where(and(eq(schema.rounds.showId, args.showId), eq(schema.rounds.roundNo, args.roundNo)));
  if (!round) return { created: 0, delivered: 0 };

  let targets: (typeof schema.options.$inferSelect)[];
  if (args.kind === "BALLOT") {
    targets = await liveOptions(db, round.id);
    if (args.onlyOptionIds) targets = targets.filter((o) => args.onlyOptionIds?.includes(o.id));
  } else {
    targets = round.winnerOptionId
      ? await db.select().from(schema.options).where(and(eq(schema.options.id, round.winnerOptionId), eq(schema.options.roundId, round.id)))
      : [];
  }
  if (targets.length === 0) return { created: 0, delivered: 0 };

  const rows: (typeof schema.receipts.$inferInsert)[] = [];
  for (const opt of targets) {
    const ids = opt.sourceIdeaIds as string[];
    if (ids.length === 0) continue;
    const ideaRows = await db
      .select({ id: schema.ideas.id, userId: schema.ideas.userId })
      .from(schema.ideas)
      .where(and(inArray(schema.ideas.id, ids), eq(schema.ideas.status, "ok")))
      .orderBy(asc(schema.ideas.createdAt), asc(schema.ideas.id));
    const seen = new Set<string>();
    for (const idea of ideaRows) {
      if (seen.has(idea.userId)) continue; // one receipt per person per option: their earliest idea
      seen.add(idea.userId);
      rows.push({
        id: newId("rc"),
        userId: idea.userId,
        showId: args.showId,
        roundId: round.id,
        type: args.kind,
        optionId: opt.id,
        ideaId: idea.id,
      });
    }
  }
  const inserted = rows.length
    ? await db.insert(schema.receipts).values(rows).onConflictDoNothing().returning({ id: schema.receipts.id })
    : [];

  const pending = await db
    .select({
      id: schema.receipts.id,
      userId: schema.receipts.userId,
      optionId: schema.receipts.optionId,
      optionLabel: schema.options.label,
      ideaText: schema.ideas.text,
    })
    .from(schema.receipts)
    .innerJoin(schema.users, eq(schema.users.id, schema.receipts.userId))
    .innerJoin(schema.options, eq(schema.options.id, schema.receipts.optionId))
    .innerJoin(schema.ideas, eq(schema.ideas.id, schema.receipts.ideaId))
    .where(
      and(
        eq(schema.receipts.roundId, round.id),
        eq(schema.receipts.type, args.kind),
        inArray(
          schema.receipts.optionId,
          targets.map((o) => o.id),
        ),
        eq(schema.receipts.deliveredNexconn, false),
        eq(schema.users.isBot, false),
      ),
    );

  let delivered = 0;
  const rt = getRealtimeServer();
  await mapLimit(pending, SEND_CONCURRENCY, async (r) => {
    const payload: ReceiptPayload = {
      t: "receipt",
      type: args.kind,
      showId: args.showId,
      roundNo: args.roundNo,
      optionId: r.optionId,
      optionLabel: r.optionLabel,
      ideaText: r.ideaText,
    };
    try {
      if (!(await timeout(rt.sendReceipt(r.userId, payload), SEND_TIMEOUT_MS))) return;
      await db.update(schema.receipts).set({ deliveredNexconn: true }).where(eq(schema.receipts.id, r.id));
      delivered++;
    } catch (err) {
      log.warn({ err, userId: r.userId, kind: args.kind }, "receipt delivery failed; the row is kept for /me");
    }
  });
  return { created: inserted.length, delivered };
}
