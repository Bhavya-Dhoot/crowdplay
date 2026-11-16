// advance(): the only place engine state changes. One transaction per trigger under a per-room mutex and
// SELECT ... FOR UPDATE; effects run after commit (TECH_SPEC §5.2).
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { defaultTimings } from "../config";
import { getDb, schema, type Db } from "../db/client";
import { AppError } from "../errors";
import { log } from "../log";
import type { Phase } from "../realtime/types";
import { pendingEffectCount, resetPendingEffects, runEffects, settlePendingEffects } from "./effects";
import { resetLocks, withRoomLock } from "./lock";
import { next } from "./machine";
import { flushDirtyPublishes, resetPublishQueues } from "./publish";
import { stopTicker } from "./ticker";
import type { EnginePayload, EngineState, Trigger } from "./types";

const g = globalThis as unknown as { __cpClock?: () => number };

/** Engine clock: Date.now() unless a test installed its own. */
export function engineNow(): number {
  return g.__cpClock ? g.__cpClock() : Date.now();
}

/** Tests only: drive every engine timestamp (advance defaults, vote deadline, serverNow) from a fake clock. */
export function setEngineClock(fn: (() => number) | null): void {
  g.__cpClock = fn ?? undefined;
}

const PayloadSchema = z.object({
  rerollUsed: z.boolean().default(false),
  distill: z.enum(["idle", "running", "done"]).default("idle"),
  forcedWinnerId: z.string().nullable().default(null),
  voice: z.boolean().default(false),
});

export function parsePayload(raw: unknown): EnginePayload {
  return PayloadSchema.parse(raw ?? {});
}

type EngineRow = typeof schema.engineState.$inferSelect;
type ShowRow = typeof schema.shows.$inferSelect;

function toEngineState(row: EngineRow, show: ShowRow, isDemo: boolean): EngineState {
  return {
    roomId: row.roomId,
    showId: row.showId,
    isDemo,
    phase: row.phase as Phase,
    roundNo: row.roundNo,
    roundsTotal: show.roundsTotal,
    phaseStartedAt: row.phaseStartedAt.getTime(),
    phaseEndsAt: row.phaseEndsAt ? row.phaseEndsAt.getTime() : null,
    pausedRemainingMs: row.pausedRemainingMs,
    version: row.version,
    autoAdvance: show.autoAdvance,
    timings: {
      promptMs: show.promptMs,
      stormMs: show.stormMs,
      voteMs: show.voteMs,
      revealMs: show.revealMs,
      distillCapMs: defaultTimings().distillCapMs,
    },
    payload: parsePayload(row.payload),
  };
}

/** Load the current engine state of a room (no lock; use for reads). */
export async function loadEngineState(roomId: string, db?: Db): Promise<EngineState | null> {
  const q = db ?? (await getDb());
  const [row] = await q
    .select({ eng: schema.engineState, show: schema.shows, isDemo: schema.rooms.isDemo })
    .from(schema.engineState)
    .innerJoin(schema.shows, eq(schema.shows.id, schema.engineState.showId))
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.engineState.roomId))
    .where(eq(schema.engineState.roomId, roomId));
  return row ? toEngineState(row.eng, row.show, row.isDemo) : null;
}

const ROUND_STATUS: Record<Phase, string> = {
  LOBBY: "pending",
  PROMPT: "pending",
  STORM: "storm",
  DISTILL: "distill",
  VOTE: "vote",
  REVEAL: "reveal",
  FINALE: "done",
  ENDED: "done",
};

async function persist(q: Db, prev: EngineState, s: EngineState, now: number): Promise<void> {
  await q
    .update(schema.engineState)
    .set({
      roundNo: s.roundNo,
      phase: s.phase,
      phaseStartedAt: new Date(s.phaseStartedAt),
      phaseEndsAt: s.phaseEndsAt === null ? null : new Date(s.phaseEndsAt),
      pausedRemainingMs: s.pausedRemainingMs,
      version: s.version,
      payload: s.payload,
      updatedAt: new Date(now),
    })
    .where(eq(schema.engineState.roomId, s.roomId));

  if (s.autoAdvance !== prev.autoAdvance) {
    await q.update(schema.shows).set({ autoAdvance: s.autoAdvance }).where(eq(schema.shows.id, s.showId));
  }
  if (s.phase === prev.phase) return;

  if (prev.phase === "LOBBY" && s.phase === "PROMPT") {
    await q.update(schema.shows).set({ status: "live", startedAt: new Date(now) }).where(eq(schema.shows.id, s.showId));
  } else if (s.phase === "FINALE") {
    await q.update(schema.shows).set({ status: "finale" }).where(eq(schema.shows.id, s.showId));
  } else if (s.phase === "ENDED") {
    await q.update(schema.shows).set({ status: "ended", endedAt: new Date(now) }).where(eq(schema.shows.id, s.showId));
  }
  if (s.roundNo >= 1) {
    await q
      .update(schema.rounds)
      .set({ status: ROUND_STATUS[s.phase] })
      .where(and(eq(schema.rounds.showId, s.showId), eq(schema.rounds.roundNo, s.roundNo)));
    await q
      .update(schema.rounds)
      .set({ status: "done" })
      .where(and(eq(schema.rounds.showId, s.showId), lt(schema.rounds.roundNo, s.roundNo)));
  }
}

export type AdvanceResult = { changed: boolean; state: EngineState };

/**
 * Apply one trigger to a room. Safe to call any number of times from any caller: the row lock plus the pure
 * machine produce exactly one transition per deadline. Effects run after commit, outside the lock.
 */
export async function advance(roomId: string, trigger: Trigger, now: number = engineNow()): Promise<AdvanceResult> {
  const db = await getDb();
  const result = await withRoomLock(roomId, () =>
    db.transaction(async (tx) => {
      const q = tx as unknown as Db;
      const [row] = await q.select().from(schema.engineState).where(eq(schema.engineState.roomId, roomId)).for("update");
      if (!row) throw new AppError("ROOM_NOT_FOUND", "That room doesn't exist.", 404);
      const [show] = await q.select().from(schema.shows).where(eq(schema.shows.id, row.showId));
      const [room] = await q.select({ isDemo: schema.rooms.isDemo }).from(schema.rooms).where(eq(schema.rooms.id, roomId));
      const prev = toEngineState(row, show, room?.isDemo ?? false);
      const res = next(prev, now, trigger);
      if (res.changed) await persist(q, prev, res.state, now);
      return res;
    }),
  );
  if (result.changed) {
    log.debug({ roomId, trigger: trigger.type, phase: result.state.phase, roundNo: result.state.roundNo, v: result.state.version }, "engine transition");
    await runEffects({ roomId, state: result.state, now }, result.effects);
  }
  return { changed: result.changed, state: result.state };
}

/** Lazy advance for reads and host heartbeats: only touches the lock when a deadline has actually passed. */
export async function advanceIfDue(roomId: string, now: number = engineNow()): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ endsAt: schema.engineState.phaseEndsAt })
    .from(schema.engineState)
    .where(eq(schema.engineState.roomId, roomId));
  if (!row?.endsAt || row.endsAt.getTime() > now) return false;
  try {
    return (await advance(roomId, { type: "TICK" }, now)).changed;
  } catch (err) {
    log.warn({ err, roomId }, "lazy advance failed; the ticker will retry"); // a read must not fail because of it
    return false;
  }
}

async function bump(roomId: string, onlyPhase?: Phase): Promise<number | null> {
  const db = await getDb();
  return withRoomLock(roomId, async () => {
    const where = onlyPhase
      ? and(eq(schema.engineState.roomId, roomId), eq(schema.engineState.phase, onlyPhase))
      : eq(schema.engineState.roomId, roomId);
    const [r] = await db
      .update(schema.engineState)
      .set({ version: sql`${schema.engineState.version} + 1`, updatedAt: new Date(engineNow()) })
      .where(where)
      .returning({ version: schema.engineState.version });
    return r?.version ?? null;
  });
}

/** Fresh version for a publish that is not an engine transition (narration, tally, stats, moderation). */
export async function bumpVersion(roomId: string): Promise<number> {
  const v = await bump(roomId);
  if (v === null) throw new AppError("ROOM_NOT_FOUND", "That room doesn't exist.", 404);
  return v;
}

/** Same, but only while the room is in `phase` (a tally must not outlive its VOTE). */
export async function bumpVersionIfPhase(roomId: string, phase: Phase): Promise<number | null> {
  return bump(roomId, phase);
}

/** Wait for every tracked slow effect and coalesced publish (tests, graceful shutdown). */
export async function settleEffects(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await settlePendingEffects();
    const flushed = await flushDirtyPublishes();
    if (!flushed && pendingEffectCount() === 0) return;
  }
}

/** Tests: forget every in-process singleton, as a process restart would. The database is untouched. */
export function resetEngineSingletons(): void {
  stopTicker();
  resetLocks();
  resetPendingEffects();
  resetPublishQueues();
}
