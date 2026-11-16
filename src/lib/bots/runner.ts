// Demo-room bots (TECH_SPEC §11, FR-26). The 30 labelled personas type ideas through the STORM window and
// vote through the VOTE window, so a judge alone on one device plays a whole show with no host.
//
// Everything here is a timer on globalThis that is armed and then left alone: startBots / startBotVotes return
// as soon as the schedule exists (the engine tracks them as slow effects and must not wait for a whole phase)
// and nothing throws into the engine. A bot idea goes through the same ingest path as a human's, so the filter,
// the round cap and the phase check still apply; a vote goes through castVote, so live options, the deadline and
// the participant rules are the vote route's.
import { and, eq, inArray } from "drizzle-orm";
import type { BotIdeasInput } from "../ai/types";
import { features } from "../config";
import { CHEER_EMOJI } from "../copy";
import { getDb, schema } from "../db/client";
import { engineNow, loadEngineState } from "../engine/advance";
import type { EngineState } from "../engine/types";
import { liveOptions, withTimeout } from "../engine/publish";
import { AppError } from "../errors";
import { ingestIdea } from "../ingest/ideas";
import { log } from "../log";
import { getRealtimeServer } from "../realtime/index";
import type { OptionSlot, PresetId } from "../realtime/types";
import { castVote, type RoomRow } from "../rooms";
import { sampleCanned } from "./canned";
import { generateBotIdeas } from "./ideas";
import { BOT_PERSONAS, type BotPersona } from "./personas";

export const BOT_IDEAS_PER_ROUND = 60;
/** Slight bias to A, as TECH_SPEC §11 asks; a wildcard still gets a real share so "maybe yours wins" is true. */
export const BOT_VOTE_WEIGHTS: Record<OptionSlot, number> = { A: 0.4, B: 0.34, C: 0.26 };

const IDEA_LEAD_MS = 600; // first idea lands this long after STORM opens
const IDEA_TAIL_MS = 1200; // last idea lands this long before the deadline (the insert must beat it)
const VOTE_LEAD_MS = 700;
const VOTE_TAIL_MS = 1000;
const BOT_ROUND_CAP = 6; // well under the 12-idea per-user cap
const CHEERS_PER_ROUND = 8;
const IDEAS_GENERATION_TIMEOUT_MS = 8000;
const REALTIME_TIMEOUT_MS = 3000;
const ENSURE_USERS_TIMEOUT_MS = 5000;
const MAX_RUNS_KEPT = 300;

// ---------- seeded randomness (a demo is reproducible per room and round) ----------

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** mulberry32 */
function rngFor(seed: string): () => number {
  let a = seedOf(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

function gauss(rng: () => number, mean: number, sd: number): number {
  const u = Math.max(rng(), 1e-9);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/**
 * Where in a phase window (0 = open, 1 = deadline) `count` events land: an opening rush, two mid-window
 * bursts, a steady trickle and a last-seconds scramble, like a real room. Sorted.
 */
export function planOffsets(count: number, rng: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(count)); i++) {
    const r = rng();
    let f: number;
    if (r < 0.28) f = 0.02 + rng() * 0.16;
    else if (r < 0.43) f = gauss(rng, 0.42, 0.04);
    else if (r < 0.58) f = gauss(rng, 0.66, 0.04);
    else if (r < 0.8) f = 0.05 + rng() * 0.85;
    else f = 0.84 + rng() * 0.14;
    out.push(clamp01(f));
  }
  return out.sort((a, b) => a - b);
}

const VERBOSITY_WEIGHT = { terse: 1, normal: 2, chatty: 3 } as const;

/** Which bot types each idea: everyone speaks once before anyone speaks twice, chatty ones more often, capped. */
export function assignBots(count: number, rng: () => number, cap = BOT_ROUND_CAP): BotPersona[] {
  const order = [...BOT_PERSONAS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const used = new Map<string, number>();
  const out: BotPersona[] = [];
  for (let i = 0; i < count; i++) {
    let pick = order[i];
    if (i >= order.length) {
      const pool = order.filter((p) => (used.get(p.id) ?? 0) < cap);
      if (pool.length === 0) break;
      pick = pool[pickWeighted(pool.map((p) => VERBOSITY_WEIGHT[p.verbosity]), rng())];
    }
    used.set(pick.id, (used.get(pick.id) ?? 0) + 1);
    out.push(pick);
  }
  return out;
}

/** Index chosen by a weighted draw; `r` is a uniform number in [0, 1). */
export function pickWeighted(weights: readonly number[], r: number): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!(total > 0)) return 0;
  let x = clamp01(r) * total;
  for (let i = 0; i < weights.length; i++) {
    x -= Math.max(0, weights[i]);
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/** Absolute time window (epoch ms, engine clock) events may land in; null when the phase has no time left. */
export function eventWindow(now: number, phaseStartedAt: number, endsAt: number | null, leadMs: number, tailMs: number): { from: number; to: number } | null {
  if (endsAt === null) return null;
  const open = Math.max(now, phaseStartedAt);
  const remaining = endsAt - open;
  if (remaining < 250) return null;
  const from = open + Math.min(leadMs, remaining * 0.15);
  const to = endsAt - Math.min(tailMs, remaining * 0.25);
  return { from, to: Math.max(to, from + 100) };
}

// ---------- process state ----------

type Timer = ReturnType<typeof setTimeout>;
type Kind = "ideas" | "votes";
type Run = { key: string; roomId: string; roundNo: number; kind: Kind; timers: Set<Timer>; stopped: boolean };
type BotState = { runs: Map<string, Run>; registered: Set<string> };

const g = globalThis as unknown as { __cpBots?: BotState };
const state = (): BotState => (g.__cpBots ??= { runs: new Map(), registered: new Set() });

const keyOf = (roomId: string, roundNo: number, kind: Kind) => `${roomId}:${roundNo}:${kind}`;

function finish(run: Run): void {
  run.stopped = true;
  for (const t of run.timers) clearTimeout(t);
  run.timers.clear();
}

/** Register a run unless one exists for this (room, round, kind): the second call of a double start is a no-op. */
function open(roomId: string, roundNo: number, kind: Kind): Run | null {
  const runs = state().runs;
  const key = keyOf(roomId, roundNo, kind);
  if (runs.has(key)) return null;
  for (const [k, r] of runs) {
    if (r.roomId === roomId && r.roundNo < roundNo) {
      finish(r);
      runs.delete(k);
    }
  }
  if (runs.size >= MAX_RUNS_KEPT) {
    for (const [k, r] of runs) if (r.timers.size === 0) runs.delete(k); // finished runs are only idempotency markers
  }
  const run: Run = { key, roomId, roundNo, kind, timers: new Set(), stopped: false };
  runs.set(key, run);
  return run;
}

/** Forget a run that never got going so a later, valid call can start it. */
function drop(run: Run): void {
  finish(run);
  if (state().runs.get(run.key) === run) state().runs.delete(run.key);
}

function after(run: Run, ms: number, fn: () => Promise<void>): void {
  const t: Timer = setTimeout(
    () => {
      run.timers.delete(t);
      if (run.stopped) return;
      fn().catch((err) => log.warn({ err, roomId: run.roomId, roundNo: run.roundNo, kind: run.kind }, "bot step failed"));
    },
    Math.max(0, Math.round(ms)),
  );
  t.unref?.();
  run.timers.add(t);
}

/** Cancel every scheduled idea, cheer and vote of a room. Safe to call at any time, any number of times. */
export function stopBots(roomId: string): void {
  const runs = state().runs;
  for (const [k, r] of runs) {
    if (r.roomId !== roomId) continue;
    finish(r);
    runs.delete(k);
  }
}

// ---------- bot users ----------

/**
 * The 30 persona users exist (is_bot, stable ids), are registered with the realtime provider and are
 * participants of the room. Idempotent. Bots join before the human so a clashing display name makes the human
 * "Name 2", never the bot.
 */
export async function ensureBots(roomId: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.users)
    .values(BOT_PERSONAS.map((p) => ({ id: p.id, displayName: p.name, isBot: true })))
    .onConflictDoNothing();
  await db
    .insert(schema.participants)
    .values(BOT_PERSONAS.map((p) => ({ roomId, userId: p.id })))
    .onConflictDoNothing();

  const known = state().registered;
  const todo = BOT_PERSONAS.filter((p) => !known.has(p.id));
  if (todo.length === 0) return;
  const rt = getRealtimeServer();
  const registered: string[] = [];
  try {
    await withTimeout(
      Promise.all(
        todo.map(async (p) => {
          try {
            await rt.ensureUser({ id: p.id, name: p.name });
            known.add(p.id);
            registered.push(p.id);
          } catch (err) {
            log.warn({ err, botId: p.id }, "bot user registration failed; will retry on the next room");
          }
        }),
      ),
      ENSURE_USERS_TIMEOUT_MS,
      "ensure bot users",
    );
  } catch (err) {
    log.warn({ err }, "bot user registration timed out");
  }
  if (rt.kind === "nexconn" && registered.length > 0) {
    await db
      .update(schema.users)
      .set({ nexconnUserId: schema.users.id })
      .where(inArray(schema.users.id, registered))
      .catch((err) => log.warn({ err }, "could not record bot nexconn ids"));
  }
}

// ---------- shared context ----------

type Ctx = {
  eng: EngineState;
  room: RoomRow;
  preset: PresetId;
  prompt: { title: string; text: string };
};

/** Engine state, room and scene of a demo room's round; null when it is not a demo room or has no such round. */
async function loadCtx(roomId: string, roundNo: number): Promise<Ctx | null> {
  const db = await getDb();
  const eng = await loadEngineState(roomId, db);
  if (!eng || !eng.isDemo) return null;
  const [room] = await db.select().from(schema.rooms).where(eq(schema.rooms.id, roomId));
  const [show] = await db.select({ preset: schema.shows.preset }).from(schema.shows).where(eq(schema.shows.id, eng.showId));
  const [round] = await db
    .select({ title: schema.rounds.promptTitle, text: schema.rounds.promptText })
    .from(schema.rounds)
    .where(and(eq(schema.rounds.showId, eng.showId), eq(schema.rounds.roundNo, roundNo)));
  if (!room || !show || !round) return null;
  return { eng, room, preset: show.preset as PresetId, prompt: round };
}

// ---------- ideas ----------

async function writeIdeas(input: BotIdeasInput): Promise<string[]> {
  try {
    const got = await withTimeout(generateBotIdeas(input), IDEAS_GENERATION_TIMEOUT_MS, "bot ideas");
    if (got.length > 0) return got;
  } catch (err) {
    log.warn({ err }, "bot idea generation failed; using the canned pool");
  }
  return sampleCanned(input.preset, input.count, input.seed);
}

async function deliverIdea(run: Run, ctx: Ctx, bot: BotPersona, text: string, clientMsgId: string): Promise<void> {
  const res = await ingestIdea({ roomCode: ctx.room.code, userId: bot.id, roundNo: run.roundNo, text, clientMsgId, source: "bot" });
  if (!res.ok) {
    // The storm is over (or this round is): nothing later in the schedule can land either.
    if (res.code === "NOT_STORM" || res.code === "WRONG_ROUND") finish(run);
    return;
  }
  if (res.duplicate || run.stopped) return;
  await withTimeout(
    getRealtimeServer().sendRoomMessage(ctx.room.channelId, bot.id, {
      t: "idea",
      roundNo: run.roundNo,
      text,
      clientMsgId,
      name: bot.name,
      isBot: true,
    }),
    REALTIME_TIMEOUT_MS,
    "bot idea message",
  ).catch((err) => log.warn({ err, roomCode: ctx.room.code }, "bot idea stored but its message did not send"));
}

/** STORM opened in a demo room: schedule ~60 bot ideas (and a few cheers) across the real time left in it. */
export async function startBots(roomId: string, roundNo: number): Promise<void> {
  const run = open(roomId, roundNo, "ideas");
  if (!run) return;
  try {
    const ctx = await loadCtx(roomId, roundNo);
    if (!ctx || ctx.eng.phase !== "STORM" || ctx.eng.roundNo !== roundNo) return drop(run);
    await ensureBots(roomId);

    const seed = `${roomId}:${roundNo}`;
    const ideas = await writeIdeas({ preset: ctx.preset, prompt: ctx.prompt, count: BOT_IDEAS_PER_ROUND, seed });
    if (run.stopped) return;

    // Writing ideas can take seconds in live mode: read the clock and the phase again before scheduling.
    const eng = await loadEngineState(roomId);
    if (!eng || eng.phase !== "STORM" || eng.roundNo !== roundNo) return drop(run);
    const now = engineNow();
    const win = eventWindow(now, eng.phaseStartedAt, eng.phaseEndsAt, IDEA_LEAD_MS, IDEA_TAIL_MS);
    if (!win) return drop(run);

    const rng = rngFor(seed);
    const bots = assignBots(ideas.length, rng);
    const offsets = planOffsets(bots.length, rng);
    const roomTag = roomId.slice(-8);
    bots.forEach((bot, i) => {
      const at = win.from + offsets[i] * (win.to - win.from);
      after(run, at - now, () => deliverIdea(run, ctx, bot, ideas[i], `bot_${roomTag}_${roundNo}_${i}`));
    });

    if (features().cheers) {
      const cheerAt = planOffsets(CHEERS_PER_ROUND, rng);
      cheerAt.forEach((f) => {
        const bot = BOT_PERSONAS[Math.floor(rng() * BOT_PERSONAS.length)];
        const emoji = CHEER_EMOJI[Math.floor(rng() * CHEER_EMOJI.length)];
        after(run, win.from + f * (win.to - win.from) - now, async () => {
          await withTimeout(
            getRealtimeServer().sendRoomMessage(ctx.room.channelId, bot.id, { t: "cheer", emoji, name: bot.name, isBot: true }),
            REALTIME_TIMEOUT_MS,
            "bot cheer",
          ).catch(() => undefined);
        });
      });
    }
    log.info({ roomCode: ctx.room.code, roundNo, phase: "STORM", ideas: bots.length }, "bots scheduled");
  } catch (err) {
    log.error({ err, roomId, roundNo }, "bots failed to start");
    drop(run);
  }
}

// ---------- votes ----------

const STOP_VOTING = new Set(["NOT_VOTING", "WRONG_ROUND", "VOTE_CLOSED"]);

async function deliverVote(run: Run, room: RoomRow, roundId: string, bot: BotPersona, wanted: OptionSlot, rng: () => number): Promise<void> {
  const db = await getDb();
  const live = await liveOptions(db, roundId);
  if (live.length === 0) return;
  // The ballot can change under us (a veto swaps an option): vote only for what is live now.
  let choice = live.find((o) => o.slot === wanted);
  if (!choice) choice = live[pickWeighted(live.map((o) => BOT_VOTE_WEIGHTS[o.slot as OptionSlot] ?? 0.2), rng())];
  try {
    await castVote(room, bot.id, { roundNo: run.roundNo, optionId: choice.id });
  } catch (err) {
    if (err instanceof AppError && STOP_VOTING.has(err.code)) return finish(run);
    throw err;
  }
}

/** VOTE opened in a demo room: every bot casts one weighted-random vote at a random moment of the window. */
export async function startBotVotes(roomId: string, roundNo: number): Promise<void> {
  const run = open(roomId, roundNo, "votes");
  if (!run) return;
  try {
    const ctx = await loadCtx(roomId, roundNo);
    if (!ctx || ctx.eng.phase !== "VOTE" || ctx.eng.roundNo !== roundNo) return drop(run);
    const eng = ctx.eng;
    const db = await getDb();
    const [round] = await db
      .select({ id: schema.rounds.id })
      .from(schema.rounds)
      .where(and(eq(schema.rounds.showId, eng.showId), eq(schema.rounds.roundNo, roundNo)));
    if (!round) return drop(run);
    const live = await liveOptions(db, round.id);
    if (live.length === 0) return drop(run);
    await ensureBots(roomId);

    const now = engineNow();
    const win = eventWindow(now, eng.phaseStartedAt, eng.phaseEndsAt, VOTE_LEAD_MS, VOTE_TAIL_MS);
    if (!win) return drop(run);

    const rng = rngFor(`${roomId}:${roundNo}:votes`);
    const slots = live.map((o) => o.slot as OptionSlot);
    const weights = slots.map((s) => BOT_VOTE_WEIGHTS[s] ?? 0.2);
    const order = assignBots(BOT_PERSONAS.length, rng);
    const offsets = planOffsets(order.length, rng);
    order.forEach((bot, i) => {
      const wanted = slots[pickWeighted(weights, rng())];
      const at = win.from + offsets[i] * (win.to - win.from);
      after(run, at - now, () => deliverVote(run, ctx.room, round.id, bot, wanted, rng));
    });
    log.info({ roomCode: ctx.room.code, roundNo, phase: "VOTE", votes: order.length }, "bot votes scheduled");
  } catch (err) {
    log.error({ err, roomId, roundNo }, "bot votes failed to start");
    drop(run);
  }
}
