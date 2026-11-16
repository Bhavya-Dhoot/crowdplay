// Effect executors. Everything here runs after the transition commits, never blocks a round on an external
// call (every AI/network step has a timeout and a fallback) and is idempotent per (room, round, effect).
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { distillRound } from "../ai/distill";
import { generateFinale } from "../ai/finale";
import { narrateOutcome } from "../ai/narrate";
import { fallbackPrompt, generatePrompt } from "../ai/prompts";
import { synthesize } from "../ai/tts";
import type {
  DistillInput,
  DistillResult,
  NarrateInput,
  NarrateResult,
  StoryContext,
} from "../ai/types";
import { startBots, startBotVotes } from "../bots/runner";
import { features } from "../config";
import { getDb, schema, type Db } from "../db/client";
import { newId } from "../ids";
import { log } from "../log";
import { getRealtimeServer } from "../realtime/index";
import { sendReceipts } from "../receipts";
import type { OptionSlot, PresetId } from "../realtime/types";
import { advance, bumpVersion, engineNow, loadEngineState } from "./advance";
import { liveOptions, publishRoomState, withTimeout } from "./publish";
import { loadTally, pickWinner } from "./tally";
import type { Effect, EngineState } from "./types";

export type EffectContext = { roomId: string; state: EngineState; now: number };

export const NARRATION_TIMEOUT_MS = 5000;
const PROMPT_TIMEOUT_MS = 6000;
const FINALE_TIMEOUT_MS = 10000;
/** An unfinished effect claim older than this may be taken over (its process died). */
const STALE_CLAIM_MS = 5000;

/** Used only when a vetoed option has no stored backup and every narrator option of the scene is taken. */
const GENERIC_OPTIONS = [
  "Take a different path and see where it leads",
  "Stay put and watch what unfolds",
  "Do the unexpected and trust the crowd",
];

/** Scene used only when neither the prompt model nor the template writer can produce one. */
export const LAST_RESORT_SCENE = {
  title: "What happens next?",
  text: "The story needs its next move. What does the crowd do?",
  narratorOptions: [GENERIC_OPTIONS[0], GENERIC_OPTIONS[1], GENERIC_OPTIONS[2]] as [string, string, string],
  provider: "template" as const,
};

const SLOW: ReadonlySet<Effect["type"]> = new Set([
  "RUN_DISTILL",
  "GEN_NARRATION",
  "GEN_FINALE",
  "SEND_RECEIPTS",
  "START_BOTS",
  "START_BOT_VOTES",
]);

// ---------- tracking of non-blocking effects ----------

const g = globalThis as unknown as { __cpPending?: Set<Promise<void>>; __cpInflight?: Set<string> };
const pending = () => (g.__cpPending ??= new Set());
const inflight = () => (g.__cpInflight ??= new Set());

function track(p: Promise<unknown>): void {
  const set = pending();
  const t: Promise<void> = p
    .then(
      () => undefined,
      () => undefined,
    )
    .then(() => {
      set.delete(t);
    });
  set.add(t);
}

export function pendingEffectCount(): number {
  return pending().size;
}

/** Resolves once every tracked effect (including ones they spawn) has finished. */
export async function settlePendingEffects(): Promise<void> {
  while (pending().size > 0) await Promise.allSettled([...pending()]);
}

export function resetPendingEffects(): void {
  g.__cpPending = undefined;
  g.__cpInflight = undefined;
}

// ---------- idempotency ----------

type Keyed = { roundNo: number; disc: string };

/** Discriminator for the idempotency key. `:1` marks the re-roll cycle (a round can re-roll once). */
function keyOf(eff: Exclude<Effect, { type: "PUBLISH" }>, state: EngineState): Keyed {
  const cycle = state.payload.rerollUsed ? ":1" : "";
  switch (eff.type) {
    case "GEN_PROMPT":
      return { roundNo: eff.roundNo, disc: eff.mode };
    case "RUN_DISTILL":
      return { roundNo: eff.roundNo, disc: eff.mode === "reroll" ? "reroll:1" : `${eff.mode}${cycle}` };
    case "CLOSE_VOTE":
      return { roundNo: eff.roundNo, disc: "close" };
    case "GEN_NARRATION":
      return { roundNo: eff.roundNo, disc: "narration" };
    case "SEND_RECEIPTS":
      return { roundNo: eff.roundNo, disc: eff.kind === "BALLOT" ? `BALLOT${cycle}` : "CANON" };
    case "REPLACE_OPTION":
      return { roundNo: eff.roundNo, disc: eff.optionId };
    case "GEN_FINALE":
      return { roundNo: state.roundNo, disc: "finale" };
    case "START_BOTS":
      return { roundNo: eff.roundNo, disc: "bots" };
    case "START_BOT_VOTES":
      return { roundNo: eff.roundNo, disc: `botvotes${cycle}` };
  }
}

/** Insert the effect's `events` row. False when it already ran (or is running) and must be skipped. */
async function claim(db: Db, roomId: string, key: string, type: string, now: number, staleMs: number): Promise<boolean> {
  if (inflight().has(key)) return false;
  const created = await db
    .insert(schema.events)
    .values({ id: key, roomId, type: `effect:${type}`, data: { startedAt: now } })
    .onConflictDoNothing()
    .returning({ id: schema.events.id });
  if (created.length > 0) {
    inflight().add(key);
    return true;
  }
  const [row] = await db.select({ data: schema.events.data }).from(schema.events).where(eq(schema.events.id, key));
  const data = (row?.data ?? null) as { startedAt?: number; done?: boolean } | null;
  if (!data || data.done) return false;
  const started = data.startedAt ?? 0;
  if (now - started < staleMs) return false;
  // Unfinished and old: its process is gone. Take it over (compare-and-set on startedAt).
  const took = await db
    .update(schema.events)
    .set({ data: { startedAt: now, retry: true } })
    .where(and(eq(schema.events.id, key), sql`${schema.events.data}->>'startedAt' = ${String(started)}`))
    .returning({ id: schema.events.id });
  if (took.length === 0) return false;
  inflight().add(key);
  return true;
}

async function markDone(db: Db, key: string, startedAt: number): Promise<void> {
  await db.update(schema.events).set({ data: { startedAt, done: true } }).where(eq(schema.events.id, key));
}

/** Run a transition's effects in order. Slow ones are tracked instead of awaited; nothing here throws. */
export async function runEffects(ctx: EffectContext, effects: Effect[], opts: { staleMs?: number } = {}): Promise<void> {
  const db = await getDb();
  for (const eff of effects) {
    try {
      if (eff.type === "PUBLISH") {
        await publishRoomState(ctx.roomId, eff.phaseChanged);
        if (eff.phaseChanged && ctx.state.phase === "ENDED") scheduleChannelDestroy(db, ctx.roomId);
        continue;
      }
      const { roundNo, disc } = keyOf(eff, ctx.state);
      const key = `${ctx.roomId}:${roundNo}:${eff.type}:${disc}`;
      if (!(await claim(db, ctx.roomId, key, eff.type, ctx.now, opts.staleMs ?? STALE_CLAIM_MS))) continue;
      const exec = (async () => {
        try {
          await execute(db, ctx, eff);
          await markDone(db, key, ctx.now);
        } finally {
          inflight().delete(key);
        }
      })().catch((err) => log.error({ err, effect: eff.type, roundNo, roomId: ctx.roomId }, "effect failed"));
      if (SLOW.has(eff.type)) track(exec);
      else await exec;
    } catch (err) {
      log.error({ err, effect: eff.type, roomId: ctx.roomId }, "effect dispatch failed");
    }
  }
}

// The Free plan caps concurrent Open Channels (50); release ended rooms after a grace period
// so screens still receive the final ENDED state.
const CHANNEL_DESTROY_GRACE_MS = 2 * 60_000;
function scheduleChannelDestroy(db: Db, roomId: string): void {
  const t = setTimeout(async () => {
    try {
      const [room] = await db.select({ channelId: schema.rooms.channelId }).from(schema.rooms).where(eq(schema.rooms.id, roomId));
      if (room) await getRealtimeServer().destroyChannel(room.channelId);
    } catch (err) {
      log.warn({ err, roomId }, "channel destroy failed");
    }
  }, CHANNEL_DESTROY_GRACE_MS);
  t.unref?.();
}

async function execute(db: Db, ctx: EffectContext, eff: Exclude<Effect, { type: "PUBLISH" }>): Promise<void> {
  switch (eff.type) {
    case "GEN_PROMPT":
      return genPrompt(db, ctx, eff.roundNo, eff.mode);
    case "RUN_DISTILL":
      return runDistill(db, ctx, eff.roundNo, eff.mode);
    case "CLOSE_VOTE":
      return closeVote(db, ctx, eff.roundNo, eff.forcedWinnerId);
    case "GEN_NARRATION":
      return genNarration(db, ctx, eff.roundNo);
    case "SEND_RECEIPTS": {
      const show = await loadShow(db, ctx.state.showId);
      await sendReceipts({ showId: show.id, roundNo: eff.roundNo, kind: eff.kind });
      return;
    }
    case "REPLACE_OPTION":
      return replaceOption(db, ctx, eff.roundNo, eff.optionId);
    case "GEN_FINALE":
      return genFinale(db, ctx);
    case "START_BOTS":
      return startBots(ctx.roomId, eff.roundNo);
    case "START_BOT_VOTES":
      return startBotVotes(ctx.roomId, eff.roundNo);
  }
}

// ---------- shared loaders ----------

type ShowRow = typeof schema.shows.$inferSelect;
type RoundRow = typeof schema.rounds.$inferSelect;

async function loadShow(db: Db, showId: string): Promise<ShowRow> {
  const [show] = await db.select().from(schema.shows).where(eq(schema.shows.id, showId));
  if (!show) throw new Error(`show ${showId} not found`);
  return show;
}

async function loadRoundRow(db: Db, showId: string, roundNo: number): Promise<RoundRow | null> {
  const [round] = await db
    .select()
    .from(schema.rounds)
    .where(and(eq(schema.rounds.showId, showId), eq(schema.rounds.roundNo, roundNo)));
  return round ?? null;
}

async function storyContext(db: Db, show: ShowRow, roundNo: number): Promise<StoryContext> {
  const prev = await db
    .select({ narration: schema.rounds.narration })
    .from(schema.rounds)
    .where(and(eq(schema.rounds.showId, show.id), lt(schema.rounds.roundNo, roundNo), isNotNull(schema.rounds.narration)))
    .orderBy(desc(schema.rounds.roundNo))
    .limit(2);
  return {
    premise: show.premise,
    preset: show.preset as PresetId,
    summary: show.storySummary,
    lastNarrations: prev.map((r) => r.narration as string).reverse(),
    roundNo,
    roundsTotal: show.roundsTotal,
    lang: show.lang,
  };
}

const NarratorOptions = z.tuple([z.string(), z.string(), z.string()]);

function narratorOptionsOf(round: RoundRow): [string, string, string] {
  const parsed = NarratorOptions.safeParse(round.narratorOptions);
  return parsed.success ? parsed.data : [GENERIC_OPTIONS[0], GENERIC_OPTIONS[1], GENERIC_OPTIONS[2]];
}

/** The previous round's one-line beat, or its winning label while the narration is still being written. */
async function lastBeatFor(db: Db, showId: string, roundNo: number): Promise<string | null> {
  const prev = await loadRoundRow(db, showId, roundNo - 1);
  if (!prev) return null;
  if (prev.beat) return prev.beat;
  if (!prev.winnerOptionId) return null;
  const [opt] = await db.select({ label: schema.options.label }).from(schema.options).where(eq(schema.options.id, prev.winnerOptionId));
  return opt?.label ?? null;
}

async function publishFresh(roomId: string): Promise<void> {
  await bumpVersion(roomId);
  await publishRoomState(roomId, false);
}

// ---------- GEN_PROMPT ----------

async function genPrompt(db: Db, ctx: EffectContext, roundNo: number, mode: "ensure" | "pregen"): Promise<void> {
  const show = await loadShow(db, ctx.state.showId);
  if (await loadRoundRow(db, show.id, roundNo)) return;
  const input = { story: await storyContext(db, show, roundNo), lastBeat: await lastBeatFor(db, show.id, roundNo) };
  let p: { title: string; text: string; narratorOptions: [string, string, string]; provider: string };
  if (mode === "pregen") {
    p = await withTimeout(generatePrompt(input), PROMPT_TIMEOUT_MS, "generatePrompt"); // failure: ensure covers it at PROMPT
  } else {
    try {
      p = fallbackPrompt(input);
    } catch (err) {
      log.error({ err, roomId: ctx.roomId, roundNo }, "fallback prompt failed; using the last-resort scene");
      p = LAST_RESORT_SCENE;
    }
  }
  await db
    .insert(schema.rounds)
    .values({
      id: newId("rd"),
      showId: show.id,
      roundNo,
      promptTitle: p.title,
      promptText: p.text,
      narratorOptions: p.narratorOptions,
      promptProvider: p.provider,
    })
    .onConflictDoNothing();
}

// ---------- RUN_DISTILL ----------

const DistilledOption = z.object({
  kind: z.enum(["crowd", "wildcard", "narrator"]),
  label: z.string().trim().min(1).max(70),
  sourceIdeaIds: z.array(z.string()),
  boosted: z.boolean().optional(),
});
const DistillShape = z.object({
  options: z.tuple([DistilledOption, DistilledOption, DistilledOption]),
  backups: z.array(DistilledOption).default([]),
  unsafeIdeaIds: z.array(z.string()).default([]),
  clusterOf: z.record(z.string(), z.number()).default({}),
  provider: z.string(),
  fallbackUsed: z.boolean(),
});
type Distilled = z.infer<typeof DistillShape>;

function narratorOnly(narrator: [string, string, string]): Distilled {
  return {
    options: narrator.map((label) => ({ kind: "narrator" as const, label: label.slice(0, 70), sourceIdeaIds: [] })) as unknown as Distilled["options"],
    backups: [],
    unsafeIdeaIds: [],
    clusterOf: {},
    provider: "template",
    fallbackUsed: true,
  };
}

const validated = (r: DistillResult): Distilled => DistillShape.parse(r);

/** Full path first; any failure or malformed result falls back to the heuristic path, then to narrator options. */
async function computeDistill(input: DistillInput, narrator: [string, string, string], mode: "full" | "heuristic" | "reroll", roomId: string): Promise<Distilled> {
  const heuristic = async (): Promise<Distilled> => {
    try {
      return { ...validated(await distillRound({ ...input, heuristicOnly: true })), fallbackUsed: true };
    } catch (err) {
      log.error({ err, roomId, roundNo: input.roundNo }, "heuristic distill failed; using narrator options");
      return narratorOnly(narrator);
    }
  };
  if (mode === "heuristic") return heuristic();
  try {
    return validated(await distillRound(input));
  } catch (err) {
    log.warn({ err, roomId, roundNo: input.roundNo }, "distill failed; retrying with heuristics");
    return heuristic();
  }
}

async function runDistill(db: Db, ctx: EffectContext, roundNo: number, mode: "full" | "heuristic" | "reroll"): Promise<void> {
  const started = Date.now();
  const show = await loadShow(db, ctx.state.showId);
  let round = await loadRoundRow(db, show.id, roundNo);
  if (!round) {
    await genPrompt(db, ctx, roundNo, "ensure");
    round = await loadRoundRow(db, show.id, roundNo);
  }
  if (!round) throw new Error(`round ${roundNo} has no row`);
  const [room] = await db.select().from(schema.rooms).where(eq(schema.rooms.id, ctx.roomId));
  const ideaRows = await db
    .select({ id: schema.ideas.id, userId: schema.ideas.userId, text: schema.ideas.text, createdAt: schema.ideas.createdAt })
    .from(schema.ideas)
    .where(and(eq(schema.ideas.roundId, round.id), eq(schema.ideas.status, "ok")))
    .orderBy(asc(schema.ideas.createdAt), asc(schema.ideas.id));
  const narrator = narratorOptionsOf(round);
  const input: DistillInput = {
    roomId: ctx.roomId,
    roundNo,
    story: await storyContext(db, show, roundNo),
    prompt: { title: round.promptTitle, text: round.promptText },
    narratorOptions: narrator,
    ideas: ideaRows.map((i) => ({ id: i.id, userId: i.userId, text: i.text, createdAt: i.createdAt.getTime() })),
    boostUserId: room?.isDemo ? room.demoUserId : null,
    excludeLabels: mode === "reroll" ? (await liveOptions(db, round.id)).map((o) => o.label) : undefined,
  };
  const result = await computeDistill(input, narrator, mode, ctx.roomId);
  const cycleIsReroll = ctx.state.payload.rerollUsed;
  await persistDistill(db, ctx.roomId, round, result, cycleIsReroll, Date.now() - started);
  await advance(ctx.roomId, { type: "DISTILL_DONE", roundNo });
}

/** Persist once per cycle (first / re-roll): whichever of the full and heuristic runs lands first wins. */
async function persistDistill(db: Db, roomId: string, round: RoundRow, res: Distilled, reroll: boolean, ms: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const q = tx as unknown as Db;
    const claimed = await q
      .insert(schema.events)
      .values({ id: `${roomId}:${round.roundNo}:DISTILL_PERSISTED:${reroll ? "rr" : "first"}`, roomId, type: "distill_persisted", data: { provider: res.provider } })
      .onConflictDoNothing()
      .returning({ id: schema.events.id });
    if (claimed.length === 0) return false;

    if (reroll) {
      // Old options stay (receipts reference them) but leave the ballot; their votes are cleared.
      await q.delete(schema.votes).where(eq(schema.votes.roundId, round.id));
      await q
        .update(schema.options)
        .set({ slot: null, vetoed: true, rank: sql`${schema.options.rank} + 100` })
        .where(eq(schema.options.roundId, round.id));
    }
    if (res.unsafeIdeaIds.length > 0) {
      await q
        .update(schema.ideas)
        .set({ status: "blocked" })
        .where(and(eq(schema.ideas.roundId, round.id), inArray(schema.ideas.id, res.unsafeIdeaIds)));
    }

    // Supporters come from the database, never from the model: keep only ids that are ok ideas of THIS round.
    const wanted = [...new Set([...res.options, ...res.backups].flatMap((o) => o.sourceIdeaIds))];
    const valid = new Set(
      wanted.length
        ? (
            await q
              .select({ id: schema.ideas.id })
              .from(schema.ideas)
              .where(and(eq(schema.ideas.roundId, round.id), eq(schema.ideas.status, "ok"), inArray(schema.ideas.id, wanted)))
          ).map((r) => r.id)
        : [],
    );
    const slots: OptionSlot[] = ["A", "B", "C"];
    const toRow = (o: Distilled["options"][number], slot: OptionSlot | null, rank: number): typeof schema.options.$inferInsert => {
      const ids = o.kind === "narrator" ? [] : [...new Set(o.sourceIdeaIds)].filter((id) => valid.has(id));
      return {
        id: newId("op"),
        roundId: round.id,
        slot,
        kind: ids.length === 0 ? "narrator" : o.kind,
        label: o.label,
        sourceIdeaIds: ids,
        supporters: ids.length,
        boosted: ids.length > 0 && Boolean(o.boosted),
        rank,
      };
    };
    await q.insert(schema.options).values([
      ...res.options.map((o, i) => toRow(o, slots[i], i + 1)),
      ...res.backups.map((o, j) => toRow(o, null, 4 + j)),
    ]);

    const byCluster = new Map<number, string[]>();
    for (const [ideaId, cluster] of Object.entries(res.clusterOf)) byCluster.set(cluster, [...(byCluster.get(cluster) ?? []), ideaId]);
    for (const [cluster, ids] of byCluster) {
      await q
        .update(schema.ideas)
        .set({ clusterId: cluster })
        .where(and(eq(schema.ideas.roundId, round.id), inArray(schema.ideas.id, ids)));
    }

    const [counts] = await q
      .select({ ideas: sql<number>`count(*)::int`, people: sql<number>`count(distinct ${schema.ideas.userId})::int` })
      .from(schema.ideas)
      .where(and(eq(schema.ideas.roundId, round.id), eq(schema.ideas.status, "ok")));
    await q
      .update(schema.rounds)
      .set({
        ideasCount: counts?.ideas ?? 0,
        contributorsCount: counts?.people ?? 0,
        distillMs: ms,
        distillProvider: res.provider,
        fallbackUsed: round.fallbackUsed || res.fallbackUsed,
      })
      .where(eq(schema.rounds.id, round.id));
    return true;
  });
}

// ---------- CLOSE_VOTE ----------

/** Earliest created_at among each option's ok source ideas (null when it has none). */
async function firstIdeaTimes(db: Db, opts: { id: string; sourceIdeaIds: unknown }[]): Promise<Map<string, number | null>> {
  const ids = [...new Set(opts.flatMap((o) => o.sourceIdeaIds as string[]))];
  const rows = ids.length
    ? await db
        .select({ id: schema.ideas.id, createdAt: schema.ideas.createdAt })
        .from(schema.ideas)
        .where(and(inArray(schema.ideas.id, ids), eq(schema.ideas.status, "ok")))
    : [];
  const at = new Map(rows.map((r) => [r.id, r.createdAt.getTime()]));
  const out = new Map<string, number | null>();
  for (const o of opts) {
    const times = (o.sourceIdeaIds as string[]).map((id) => at.get(id)).filter((t): t is number => t !== undefined);
    out.set(o.id, times.length ? Math.min(...times) : null);
  }
  return out;
}

async function closeVote(db: Db, ctx: EffectContext, roundNo: number, forcedWinnerId: string | null): Promise<void> {
  const show = await loadShow(db, ctx.state.showId);
  const round = await loadRoundRow(db, show.id, roundNo);
  if (!round) return;
  const opts = await liveOptions(db, round.id);
  const { tally, total } = await loadTally(
    db,
    round.id,
    opts.map((o) => o.id),
  );
  const firstAt = await firstIdeaTimes(db, opts);
  const pick = pickWinner(
    opts.map((o) => ({ id: o.id, slot: o.slot as OptionSlot, firstIdeaAt: firstAt.get(o.id) ?? null })),
    tally,
    forcedWinnerId,
  );
  await db.update(schema.rounds).set({ winnerOptionId: pick.winnerId, votesCount: total }).where(eq(schema.rounds.id, round.id));
  if (pick.reason === "tiebreak") {
    await db
      .insert(schema.events)
      .values({
        id: `${ctx.roomId}:${roundNo}:TIEBREAK`,
        roomId: ctx.roomId,
        type: "tiebreak",
        data: { rule: "earliest-first-supporting-idea", winnerId: pick.winnerId, tied: pick.tied, tally },
      })
      .onConflictDoNothing();
    log.info({ roomId: ctx.roomId, roundNo, winnerId: pick.winnerId, tied: pick.tied }, "vote tie broken");
  }
}

// ---------- GEN_NARRATION ----------

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(s.length - max);
}

/** narrateOutcome raced against a timeout; either failure path yields the template (never stalls a reveal). */
export async function narrateWithTimeout(input: NarrateInput, timeoutMs: number = NARRATION_TIMEOUT_MS): Promise<NarrateResult> {
  const started = Date.now();
  const template = (): NarrateResult => ({
    narration: `${input.winnerLabel}. And just like that, everything changes — the story turns a corner no one saw coming.`,
    beat: input.winnerLabel,
    summary: clip(`${input.story.summary} ${input.winnerLabel}`.trim(), 1200),
    provider: "template",
    ms: Date.now() - started,
    fallbackUsed: true,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<NarrateResult>((resolve) => {
    timer = setTimeout(() => resolve(template()), timeoutMs);
  });
  const real = narrateOutcome(input).then(
    (r) => (r.narration.trim() && r.beat.trim() ? r : template()),
    () => template(),
  );
  try {
    return await Promise.race([real, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function genNarration(db: Db, ctx: EffectContext, roundNo: number): Promise<void> {
  const show = await loadShow(db, ctx.state.showId);
  const round = await loadRoundRow(db, show.id, roundNo);
  if (!round?.winnerOptionId) return;
  const [winner] = await db.select().from(schema.options).where(eq(schema.options.id, round.winnerOptionId));
  if (!winner) return;
  const sourceIds = winner.sourceIdeaIds as string[];
  const sources = sourceIds.length
    ? await db
        .select({ text: schema.ideas.text })
        .from(schema.ideas)
        .where(and(inArray(schema.ideas.id, sourceIds), eq(schema.ideas.status, "ok")))
        .orderBy(asc(schema.ideas.createdAt), asc(schema.ideas.id))
        .limit(5)
    : [];
  const result = await narrateWithTimeout({
    story: await storyContext(db, show, roundNo),
    prompt: { title: round.promptTitle, text: round.promptText },
    winnerLabel: winner.label,
    sourceIdeas: sources.map((s) => s.text),
    isFinalRound: roundNo >= show.roundsTotal,
  });
  await db
    .update(schema.rounds)
    .set({ narration: result.narration, narrationProvider: result.provider, beat: result.beat })
    .where(eq(schema.rounds.id, round.id));
  await db.update(schema.shows).set({ storySummary: clip(result.summary, 1200) }).where(eq(schema.shows.id, show.id));
  await publishFresh(ctx.roomId);

  const live = await loadEngineState(ctx.roomId, db);
  if (live?.payload.voice && features().tts) {
    const url = await withTimeout(synthesize(result.narration), 15000, "synthesize").catch((err) => {
      log.warn({ err, roomId: ctx.roomId }, "tts failed");
      return null;
    });
    if (url) {
      await db.update(schema.rounds).set({ ttsUrl: url }).where(eq(schema.rounds.id, round.id));
      await publishFresh(ctx.roomId);
    }
  }
}

// ---------- REPLACE_OPTION ----------

async function replaceOption(db: Db, ctx: EffectContext, roundNo: number, optionId: string): Promise<void> {
  const show = await loadShow(db, ctx.state.showId);
  const round = await loadRoundRow(db, show.id, roundNo);
  if (!round) return;
  const replacementId = await db.transaction(async (tx) => {
    const q = tx as unknown as Db;
    const live = await liveOptions(q, round.id);
    const old = live.find((o) => o.id === optionId);
    if (!old) return null;
    await q.update(schema.options).set({ vetoed: true, slot: null }).where(eq(schema.options.id, old.id));
    await q.delete(schema.votes).where(and(eq(schema.votes.roundId, round.id), eq(schema.votes.optionId, old.id)));

    const backups = await q
      .select()
      .from(schema.options)
      .where(and(eq(schema.options.roundId, round.id), isNull(schema.options.slot), eq(schema.options.vetoed, false), lt(schema.options.rank, 100)))
      .orderBy(asc(schema.options.rank));
    // Keep the ballot shape: a vetoed wildcard is replaced by a wildcard backup when one exists.
    const liveLabels = new Set(live.filter((o) => o.id !== old.id).map((o) => o.label.trim().toLowerCase()));
    const fresh = backups.filter((b) => !liveLabels.has(b.label.trim().toLowerCase()));
    const backup = fresh.find((b) => b.kind === old.kind) ?? fresh[0];
    if (backup) {
      await q.update(schema.options).set({ slot: old.slot, rank: old.rank }).where(eq(schema.options.id, backup.id));
      return backup.id;
    }
    const taken = new Set([...live.map((o) => o.label), old.label].map((l) => l.trim().toLowerCase()));
    const label = [...narratorOptionsOf(round), ...GENERIC_OPTIONS].find((l) => !taken.has(l.trim().toLowerCase()));
    const id = newId("op");
    await q.insert(schema.options).values({
      id,
      roundId: round.id,
      slot: old.slot,
      kind: "narrator",
      label: (label ?? GENERIC_OPTIONS[0]).slice(0, 70),
      sourceIdeaIds: [],
      supporters: 0,
      rank: old.rank,
    });
    return id;
  });
  if (replacementId) {
    // The replacement's contributors are on the ballot now: they get their BALLOT receipt too.
    track(sendReceipts({ showId: show.id, roundNo, kind: "BALLOT", onlyOptionIds: [replacementId] }).catch((err) => log.warn({ err }, "replacement receipts failed")));
  }
}

// ---------- GEN_FINALE ----------

async function genFinale(db: Db, ctx: EffectContext): Promise<void> {
  const show = await loadShow(db, ctx.state.showId);
  const [room] = await db.select({ title: schema.rooms.title }).from(schema.rooms).where(eq(schema.rooms.id, ctx.roomId));
  const rows = await db
    .select({ beat: schema.rounds.beat, label: schema.options.label })
    .from(schema.rounds)
    .leftJoin(schema.options, eq(schema.options.id, schema.rounds.winnerOptionId))
    .where(eq(schema.rounds.showId, show.id))
    .orderBy(asc(schema.rounds.roundNo));
  const beats = rows.map((r) => r.beat).filter((b): b is string => Boolean(b));
  const winningLabels = rows.map((r) => r.label).filter((l): l is string => Boolean(l));
  const title = room?.title ?? show.premise.slice(0, 40);
  let out: { storyTitle: string; recap: string; tagline: string };
  try {
    const r = await withTimeout(generateFinale({ premise: show.premise, title, beats, winningLabels }), FINALE_TIMEOUT_MS, "generateFinale");
    if (!r.storyTitle.trim() || !r.recap.trim() || !r.tagline.trim()) throw new Error("empty finale");
    out = { storyTitle: r.storyTitle, recap: r.recap, tagline: r.tagline };
  } catch (err) {
    log.warn({ err, roomId: ctx.roomId }, "finale generation failed; using the beats");
    out = { storyTitle: title, recap: beats.length ? beats.join(" ") : show.premise, tagline: "A story written by the crowd." };
  }
  await db
    .update(schema.shows)
    .set({ storyTitle: out.storyTitle, storyRecap: out.recap, storyTagline: out.tagline })
    .where(eq(schema.shows.id, show.id));
  await publishFresh(ctx.roomId);
}

// ---------- restart recovery ----------

/**
 * After a restart, slow effects that were in flight are gone. Re-run the ones the current phase still needs
 * (idempotent: finished effects are marked done, receipts are unique). DISTILL needs nothing: its cap tick
 * forces the heuristic run.
 */
export async function recoverInterruptedEffects(now: number = engineNow()): Promise<number> {
  const db = await getDb();
  const live = await db
    .select({ roomId: schema.engineState.roomId })
    .from(schema.engineState)
    .where(inArray(schema.engineState.phase, ["VOTE", "REVEAL", "FINALE"]));
  let n = 0;
  for (const { roomId } of live) {
    try {
      const state = await loadEngineState(roomId, db);
      if (!state) continue;
      const round = await loadRoundRow(db, state.showId, state.roundNo);
      const effects: Effect[] = [];
      if (state.phase === "VOTE") effects.push({ type: "SEND_RECEIPTS", roundNo: state.roundNo, kind: "BALLOT" });
      if (state.phase === "REVEAL" && round) {
        if (!round.winnerOptionId) {
          effects.push({ type: "CLOSE_VOTE", roundNo: state.roundNo, forcedWinnerId: state.payload.forcedWinnerId }, { type: "PUBLISH", phaseChanged: false });
        }
        effects.push({ type: "SEND_RECEIPTS", roundNo: state.roundNo, kind: "CANON" });
        if (!round.narration) effects.push({ type: "GEN_NARRATION", roundNo: state.roundNo });
      }
      if (state.phase === "FINALE") {
        const show = await loadShow(db, state.showId);
        if (!show.storyRecap) effects.push({ type: "GEN_FINALE" });
      }
      if (effects.length) {
        await runEffects({ roomId, state, now }, effects, { staleMs: 0 });
        n += effects.length;
      }
    } catch (err) {
      log.error({ err, roomId }, "effect recovery failed");
    }
  }
  return n;
}
