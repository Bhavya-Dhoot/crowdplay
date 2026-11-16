// Assembles the single PublicState shape from the database and pushes it through the realtime transport.
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "../db/client";
import { log } from "../log";
import { getRealtimeServer } from "../realtime/index";
import type {
  Credit,
  OptionSlot,
  Phase,
  PresetId,
  PublicFinale,
  PublicOption,
  PublicOutcome,
  PublicState,
} from "../realtime/types";
import { bumpVersion, bumpVersionIfPhase, engineNow } from "./advance";
import { loadTally } from "./tally";

const TALLY_GAP_MS = 500; // FR-19: ≤ 2 tally publishes per second
const STATS_GAP_MS = 2000;
const PUBLISH_TIMEOUT_MS = 4000;

type Contributor = { userId: string; name: string; bot: boolean };

export type LiveOptionRow = typeof schema.options.$inferSelect;

/** Live ballot options of a round (slot set, not vetoed), in slot order. */
export async function liveOptions(db: Db, roundId: string): Promise<LiveOptionRow[]> {
  return db
    .select()
    .from(schema.options)
    .where(and(eq(schema.options.roundId, roundId), isNotNull(schema.options.slot), eq(schema.options.vetoed, false)))
    .orderBy(asc(schema.options.slot));
}

/** Distinct contributors per option, earliest idea first. Names come from the users table only. */
export async function contributorsByOption(
  db: Db,
  opts: { id: string; sourceIdeaIds: string[] }[],
): Promise<Map<string, { people: Contributor[]; ideas: number }>> {
  const out = new Map<string, { people: Contributor[]; ideas: number }>();
  const ids = [...new Set(opts.flatMap((o) => o.sourceIdeaIds))];
  const rows = ids.length
    ? await db
        .select({
          id: schema.ideas.id,
          userId: schema.ideas.userId,
          createdAt: schema.ideas.createdAt,
          name: schema.users.displayName,
          bot: schema.users.isBot,
        })
        .from(schema.ideas)
        .innerJoin(schema.users, eq(schema.users.id, schema.ideas.userId))
        .where(and(inArray(schema.ideas.id, ids), eq(schema.ideas.status, "ok")))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const o of opts) {
    const mine = o.sourceIdeaIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
    const seen = new Set<string>();
    const people: Contributor[] = [];
    for (const r of mine) {
      if (seen.has(r.userId)) continue;
      seen.add(r.userId);
      people.push({ userId: r.userId, name: r.name, bot: r.bot });
    }
    out.set(o.id, { people, ideas: mine.length });
  }
  return out;
}

const toCredit = (people: Contributor[]): { credit: Credit[]; more: number } => ({
  credit: people.slice(0, 3).map((p) => ({ name: p.name, bot: p.bot })),
  more: Math.max(0, people.length - 3),
});

/** Build the PublicState for a room from the database. */
export async function buildPublicState(roomId: string): Promise<PublicState> {
  const db = await getDb();
  const [base] = await db
    .select({ eng: schema.engineState, room: schema.rooms, show: schema.shows })
    .from(schema.engineState)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.engineState.roomId))
    .innerJoin(schema.shows, eq(schema.shows.id, schema.engineState.showId))
    .where(eq(schema.engineState.roomId, roomId));
  if (!base) throw new Error(`room ${roomId} has no engine state`);
  const { eng, room, show } = base;
  const phase = eng.phase as Phase;

  const [round] =
    eng.roundNo >= 1
      ? await db
          .select()
          .from(schema.rounds)
          .where(and(eq(schema.rounds.showId, show.id), eq(schema.rounds.roundNo, eng.roundNo)))
      : [];

  const withOptions = phase === "VOTE" || phase === "REVEAL" || phase === "FINALE" || phase === "ENDED";
  const optionRows = round && withOptions ? await liveOptions(db, round.id) : [];
  const contributors = await contributorsByOption(
    db,
    optionRows.map((o) => ({ id: o.id, sourceIdeaIds: o.sourceIdeaIds as string[] })),
  );

  const options: PublicOption[] = optionRows.map((o) => {
    const c = contributors.get(o.id) ?? { people: [], ideas: 0 };
    return {
      id: o.id,
      slot: o.slot as OptionSlot,
      kind: o.kind as PublicOption["kind"],
      label: o.label,
      supporters: c.ideas,
      ...toCredit(c.people),
      ...(o.boosted ? { boosted: true } : {}),
    };
  });

  const state: PublicState = {
    v: eng.version,
    roomCode: room.code,
    showId: show.id,
    phase,
    roundNo: eng.roundNo,
    roundsTotal: show.roundsTotal,
    phaseStartedAt: eng.phaseStartedAt.getTime(),
    phaseEndsAt: eng.phaseEndsAt ? eng.phaseEndsAt.getTime() : null,
    serverNow: engineNow(),
    paused: eng.pausedRemainingMs !== null,
    title: room.title,
    premise: show.premise,
    preset: show.preset as PresetId,
    isDemo: room.isDemo,
    stats: await loadStats(db, roomId, show.id, round?.id ?? null),
    storySoFar: await loadBeats(db, show.id),
  };
  if (round) state.prompt = { title: round.promptTitle, text: round.promptText };
  if (options.length) state.options = options;

  if (round && (phase === "VOTE" || phase === "REVEAL") && optionRows.length) {
    const { tally, total } = await loadTally(
      db,
      round.id,
      optionRows.map((o) => o.id),
    );
    state.tally = tally;
    state.votesTotal = total;
  }

  if (round && round.winnerOptionId && (phase === "REVEAL" || phase === "FINALE" || phase === "ENDED")) {
    const winner = options.find((o) => o.id === round.winnerOptionId);
    if (winner) {
      const outcome: PublicOutcome = {
        optionId: winner.id,
        narration: round.narration,
        credit: winner.credit,
        more: winner.more,
      };
      if (round.ttsUrl) outcome.ttsUrl = round.ttsUrl;
      state.outcome = outcome;
    }
  }

  if (phase === "FINALE" || phase === "ENDED") {
    state.finale = {
      storyTitle: show.storyTitle ?? room.title,
      recap: show.storyRecap ?? "",
      tagline: show.storyTagline ?? "",
      canonMakers: await topCanonMakers(db, show.id, 5),
    } satisfies PublicFinale;
  }
  return state;
}

async function loadStats(db: Db, roomId: string, showId: string, roundId: string | null): Promise<PublicState["stats"]> {
  const [players, thisRound, total, canon] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.participants).where(eq(schema.participants.roomId, roomId)),
    roundId
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.ideas)
          .where(and(eq(schema.ideas.roundId, roundId), eq(schema.ideas.status, "ok")))
      : Promise.resolve([{ n: 0 }]),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.ideas)
      .innerJoin(schema.rounds, eq(schema.rounds.id, schema.ideas.roundId))
      .where(and(eq(schema.rounds.showId, showId), eq(schema.ideas.status, "ok"))),
    db
      .select({ n: sql<number>`count(distinct ${schema.receipts.userId})::int` })
      .from(schema.receipts)
      .where(and(eq(schema.receipts.showId, showId), eq(schema.receipts.type, "CANON"))),
  ]);
  return {
    players: players[0]?.n ?? 0,
    ideasThisRound: thisRound[0]?.n ?? 0,
    ideasTotal: total[0]?.n ?? 0,
    canonMakers: canon[0]?.n ?? 0,
  };
}

async function loadBeats(db: Db, showId: string): Promise<string[]> {
  const rows = await db
    .select({ beat: schema.rounds.beat })
    .from(schema.rounds)
    .where(and(eq(schema.rounds.showId, showId), isNotNull(schema.rounds.beat)))
    .orderBy(desc(schema.rounds.roundNo))
    .limit(3);
  return rows.map((r) => r.beat as string).reverse();
}

export async function topCanonMakers(db: Db, showId: string, limit: number): Promise<PublicFinale["canonMakers"]> {
  const n = sql<number>`count(*)::int`;
  const rows = await db
    .select({ name: schema.users.displayName, bot: schema.users.isBot, count: n })
    .from(schema.receipts)
    .innerJoin(schema.users, eq(schema.users.id, schema.receipts.userId))
    .where(and(eq(schema.receipts.showId, showId), eq(schema.receipts.type, "CANON")))
    .groupBy(schema.receipts.userId, schema.users.displayName, schema.users.isBot)
    .orderBy(desc(n), asc(sql`min(${schema.receipts.createdAt})`), asc(schema.users.displayName))
    .limit(limit);
  return rows;
}

export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/** Build and push the current state. Never throws: a dead transport must not stall the engine. */
export async function publishRoomState(roomId: string, phaseChanged: boolean): Promise<void> {
  try {
    const db = await getDb();
    const [room] = await db.select({ channelId: schema.rooms.channelId }).from(schema.rooms).where(eq(schema.rooms.id, roomId));
    if (!room) return;
    const state = await buildPublicState(roomId);
    await withTimeout(getRealtimeServer().publishState(room.channelId, state, { phaseChanged }), PUBLISH_TIMEOUT_MS, "publishState");
  } catch (err) {
    log.error({ err, roomId }, "publish state failed");
  }
}

// ---------- coalesced out-of-transition publishes ----------

type Coalescer = { lastRun: number; timer: ReturnType<typeof setTimeout> | null; running: Promise<void> | null; run: () => Promise<void> };
const g = globalThis as unknown as { __cpPublishQ?: Map<string, Coalescer> };
const queues = () => (g.__cpPublishQ ??= new Map<string, Coalescer>());

function fire(c: Coalescer): Promise<void> {
  c.timer = null;
  c.lastRun = Date.now();
  const p: Promise<void> = c
    .run()
    .catch((err) => log.error({ err }, "coalesced publish failed"))
    .finally(() => {
      if (c.running === p) c.running = null;
    });
  c.running = p;
  return p;
}

function mark(key: string, gapMs: number, run: () => Promise<void>): void {
  const map = queues();
  let c = map.get(key);
  if (!c) map.set(key, (c = { lastRun: 0, timer: null, running: null, run }));
  if (c.timer) return; // a trailing run is already scheduled and will read the latest data
  const wait = Math.max(0, c.lastRun + gapMs - Date.now());
  const q = c;
  c.timer = setTimeout(() => void fire(q), wait);
  c.timer.unref?.();
}

async function runTally(roomId: string): Promise<void> {
  const v = await bumpVersionIfPhase(roomId, "VOTE");
  if (v === null) return;
  const db = await getDb();
  const [row] = await db
    .select({ roundNo: schema.engineState.roundNo, showId: schema.engineState.showId, channelId: schema.rooms.channelId })
    .from(schema.engineState)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.engineState.roomId))
    .where(eq(schema.engineState.roomId, roomId));
  if (!row) return;
  const [round] = await db
    .select({ id: schema.rounds.id })
    .from(schema.rounds)
    .where(and(eq(schema.rounds.showId, row.showId), eq(schema.rounds.roundNo, row.roundNo)));
  if (!round) return;
  const opts = await liveOptions(db, round.id);
  const { tally, total } = await loadTally(
    db,
    round.id,
    opts.map((o) => o.id),
  );
  await withTimeout(getRealtimeServer().publishTally(row.channelId, v, row.roundNo, tally, total), PUBLISH_TIMEOUT_MS, "publishTally");
}

async function runStats(roomId: string): Promise<void> {
  const db = await getDb();
  const [row] = await db.select({ phase: schema.engineState.phase }).from(schema.engineState).where(eq(schema.engineState.roomId, roomId));
  if (!row || row.phase === "ENDED") return;
  await bumpVersion(roomId);
  await publishRoomState(roomId, false);
}

/** A vote changed: tally gets re-published (coalesced, ≤ 2/s). */
export function markTallyDirty(roomId: string): void {
  mark(`tally:${roomId}`, TALLY_GAP_MS, () => runTally(roomId));
}

/** Ideas/players changed: stats get re-published (coalesced, ≤ every 2 s). */
export function markStatsDirty(roomId: string): void {
  mark(`stats:${roomId}`, STATS_GAP_MS, () => runStats(roomId));
}

/** Run every scheduled coalesced publish now and wait for it. Returns true if anything was pending. */
export async function flushDirtyPublishes(): Promise<boolean> {
  let any = false;
  for (const c of [...queues().values()]) {
    if (c.timer) {
      clearTimeout(c.timer);
      any = true;
      await fire(c);
    } else if (c.running) {
      any = true;
      await c.running;
    }
  }
  return any;
}

/** Tests: drop timers and pending coalesced work, as a restart would. */
export function resetPublishQueues(): void {
  for (const c of queues().values()) if (c.timer) clearTimeout(c.timer);
  g.__cpPublishQ = undefined;
}
