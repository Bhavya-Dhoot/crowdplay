// Demo bots against a real (PGlite) engine, the recording fake transport and fake timers: bot ideas and votes
// are timers, so a test moves the engine clock and the timer clock together. Each timer callback ends in real
// database I/O, so a test waits for conditions (bots-harness) rather than assuming it finished.
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { resetEngineSingletons, setEngineClock, settleEffects } from "@/lib/engine/advance";
import { BOT_PERSONAS } from "@/lib/bots/personas";
import { BOT_IDEAS_PER_ROUND, ensureBots, startBotVotes, startBots, stopBots } from "@/lib/bots/runner";
import { ai, clock, makeUser, rt, roundRow, type TestUser } from "./engine-harness";
import { botTimers, drain, resetBotState, run, stampIdeaMessages, until } from "./bots-harness";
import { installClock, tickToDeadline } from "./engine-flow";
import { advance } from "@/lib/engine/advance";
import { createRoom, joinRoom, getRoomByCode } from "@/lib/rooms";
import type { CreateRoomInput } from "@/lib/api/contracts";

vi.mock("@/lib/realtime/index", async () => (await import("./engine-harness")).realtimeModule());

let db: Db;
let close: () => Promise<void>;
let stamped: ReturnType<typeof stampIdeaMessages>;
beforeAll(async () => {
  ({ db, close } = await useTestDb());
  stamped = stampIdeaMessages();
});
afterAll(async () => {
  stamped.restore();
  vi.useRealTimers();
  resetEngineSingletons();
  setEngineClock(null);
  await close();
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  resetBotState();
  resetEngineSingletons();
  rt.reset();
  ai.reset();
  stamped.stamps.length = 0;
  installClock();
});
afterEach(() => {
  vi.clearAllTimers();
});

const INPUT: CreateRoomInput = {
  title: "Demo show",
  preset: "heist",
  premise: "A vault full of rubber ducks.",
  roundsTotal: 3,
  stormMs: 20_000,
  voteMs: 12_000,
  autoAdvance: true,
  strictFilter: true,
};

type Demo = { code: string; roomId: string; showId: string; judge: TestUser };

/** A demo room started and ticked into STORM of round 1 (the START_BOTS effect has run). */
async function demoInStorm(): Promise<Demo> {
  const judge = await makeUser(db, "Judge Judy");
  const { room, show } = await createRoom(INPUT, judge, { isDemo: true, demoUserId: judge.id });
  await ensureBots(room.id);
  await joinRoom(room, judge);
  await advance(room.id, { type: "HOST_START" });
  await tickToDeadline(room.id); // PROMPT -> STORM
  await settleEffects();
  return { code: room.code, roomId: room.id, showId: show.id, judge };
}

const ideaRows = async (showId: string, roundNo: number) => {
  const round = await roundRow(db, showId, roundNo);
  return db.select().from(schema.ideas).where(eq(schema.ideas.roundId, round.id));
};
const ideaMessages = () => rt.messages.filter((m) => m.msg.t === "idea");
const ideaCount = async (d: Pick<Demo, "showId">) => (await ideaRows(d.showId, 1)).length;
const cheerMessages = () => rt.messages.filter((m) => m.msg.t === "cheer");

describe("bot users", () => {
  it("are is_bot with stable ids and are participants of the demo room; ensuring twice changes nothing", async () => {
    const judge = await makeUser(db, "Judge A");
    const { room } = await createRoom(INPUT, judge, { isDemo: true, demoUserId: judge.id });
    await ensureBots(room.id);
    await ensureBots(room.id);
    const ids = BOT_PERSONAS.map((p) => p.id);
    const users = await db.select().from(schema.users).where(inArray(schema.users.id, ids));
    expect(users).toHaveLength(30);
    expect(users.every((u) => u.isBot)).toBe(true);
    const parts = await db.select().from(schema.participants).where(eq(schema.participants.roomId, room.id));
    expect(parts.map((p) => p.userId).sort()).toEqual([...ids].sort());
    // A second room reuses the same 30 user rows.
    const { room: other } = await createRoom(INPUT, judge, { isDemo: true, demoUserId: judge.id });
    await ensureBots(other.id);
    expect(await db.select().from(schema.users).where(inArray(schema.users.id, ids))).toHaveLength(30);
    expect(await db.select().from(schema.participants).where(eq(schema.participants.roomId, other.id))).toHaveLength(30);
  });

  it("a judge whose name clashes with a bot becomes 'Name 2', never the bot", async () => {
    const judge = await makeUser(db, "Captain Noodle");
    const { room } = await createRoom(INPUT, judge, { isDemo: true, demoUserId: judge.id });
    await ensureBots(room.id);
    const joined = await joinRoom(room, judge);
    expect(joined.displayName).toBe("Captain Noodle 2");
  });
});

describe("startBots", () => {
  it("lands every idea inside the STORM window, labelled as bots, and none after it", async () => {
    const d = await demoInStorm();
    const room = (await getRoomByCode(d.code))!;
    const [eng] = await db.select().from(schema.engineState).where(eq(schema.engineState.roomId, room.id));
    expect(eng.phase).toBe("STORM");
    const t0 = eng.phaseStartedAt.getTime();
    const t1 = eng.phaseEndsAt!.getTime();

    // The last idea is scheduled at least ~1.2 s before the deadline: stop short of it, then wait for I/O.
    await run(t1 - 600 - clock.now);
    await until(() => ideaMessages().length === BOT_IDEAS_PER_ROUND, "all 60 bot idea messages");
    const landed = stamped.stamps;
    expect(landed).toHaveLength(BOT_IDEAS_PER_ROUND);
    expect(Math.min(...landed)).toBeGreaterThan(t0);
    expect(Math.max(...landed)).toBeLessThan(t1);

    // Every idea went through ingest (source 'bot') and the transport, from a bot, with the isBot flag.
    const rows = await ideaRows(d.showId, 1);
    expect(rows).toHaveLength(BOT_IDEAS_PER_ROUND);
    expect(rows.every((r) => r.source === "bot" && r.status === "ok")).toBe(true);
    const botIds = new Set(BOT_PERSONAS.map((p) => p.id));
    expect(rows.every((r) => botIds.has(r.userId))).toBe(true);
    for (const m of ideaMessages()) {
      expect(botIds.has(m.from)).toBe(true);
      expect(m.msg).toMatchObject({ t: "idea", roundNo: 1, isBot: true });
    }
    expect(cheerMessages().length).toBeGreaterThan(0);
    expect(cheerMessages().every((m) => botIds.has(m.from))).toBe(true);
    expect(botTimers()).toBe(0);
  });

  it("stops when the phase leaves STORM: late timers add nothing", async () => {
    const d = await demoInStorm();
    await run(5_000);
    const before = await drain(() => ideaCount(d)); // nothing in flight when the phase changes
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(BOT_IDEAS_PER_ROUND);

    await tickToDeadline(d.roomId); // the host-less engine moves to DISTILL while timers are still pending
    await settleEffects();
    const msgs = ideaMessages().length;
    await run(30_000);
    await drain(() => ideaCount(d));
    expect(await ideaCount(d)).toBe(before);
    expect(ideaMessages().length).toBe(msgs);
  });

  it("is idempotent: a second (even concurrent) start for the same round schedules nothing new", async () => {
    const d = await demoInStorm();
    const timers = botTimers();
    expect(timers).toBeGreaterThanOrEqual(BOT_IDEAS_PER_ROUND);
    await Promise.all([startBots(d.roomId, 1), startBots(d.roomId, 1)]);
    await startBots(d.roomId, 1);
    expect(botTimers()).toBe(timers);
    await run(19_000);
    await until(async () => (await ideaCount(d)) === BOT_IDEAS_PER_ROUND, "all 60 bot ideas stored");
    await drain(() => ideaCount(d));
    expect(await ideaCount(d)).toBe(BOT_IDEAS_PER_ROUND); // 60, not 120 or 180
  });

  it("does nothing outside STORM, for a non-demo room, or for a stale round, and stopBots cancels the rest", async () => {
    const d = await demoInStorm();
    stopBots(d.roomId);
    expect(botTimers()).toBe(0);
    await run(20_000);
    expect(await ideaRows(d.showId, 1)).toHaveLength(0);

    await startBots(d.roomId, 2); // the room is in round 1
    expect(botTimers()).toBe(0);

    const plain = await makeUser(db, "Plain Host");
    const { room } = await createRoom(INPUT, plain);
    await advance(room.id, { type: "HOST_START" });
    await tickToDeadline(room.id);
    await settleEffects();
    await startBots(room.id, 1);
    expect(botTimers()).toBe(0);
  });
});

describe("startBotVotes", () => {
  /** Round 1 of a demo room, played to the start of VOTE (bot ideas landed, ballot saved). */
  async function demoInVote(): Promise<Demo & { optionIds: string[]; endsAt: number }> {
    const d = await demoInStorm();
    await run(20_000 - 1_000);
    await until(async () => (await ideaCount(d)) === BOT_IDEAS_PER_ROUND, "all 60 bot ideas stored");
    await tickToDeadline(d.roomId); // STORM -> DISTILL; RUN_DISTILL sends DISTILL_DONE
    await settleEffects();
    const [eng] = await db.select().from(schema.engineState).where(eq(schema.engineState.roomId, d.roomId));
    expect(eng.phase).toBe("VOTE");
    const round = await roundRow(db, d.showId, 1);
    const opts = await db.select().from(schema.options).where(and(eq(schema.options.roundId, round.id)));
    return { ...d, optionIds: opts.filter((o) => o.slot).map((o) => o.id), endsAt: eng.phaseEndsAt!.getTime() };
  }

  const votes = async (showId: string) => {
    const round = await roundRow(db, showId, 1);
    return db.select().from(schema.votes).where(eq(schema.votes.roundId, round.id));
  };
  const voteCount = async (d: Pick<Demo, "showId">) => (await votes(d.showId)).length;

  it("every bot votes once, for live options, spread across the window and before the deadline", async () => {
    const d = await demoInVote();
    expect(await voteCount(d)).toBe(0);
    await run(3_500);
    const early = await drain(() => voteCount(d));
    expect(early).toBeGreaterThan(0); // they start voting straight away...
    expect(early).toBeLessThan(30); // ...and keep going across the window
    await run(d.endsAt - 600 - clock.now); // the last vote is scheduled ~1 s before the deadline
    await until(async () => (await voteCount(d)) === 30, "all 30 bot votes");
    expect(clock.now).toBeLessThan(d.endsAt);
    const rows = await votes(d.showId);
    expect(new Set(rows.map((r) => r.userId)).size).toBe(30);
    const botIds = new Set(BOT_PERSONAS.map((p) => p.id));
    expect(rows.every((r) => botIds.has(r.userId) && d.optionIds.includes(r.optionId))).toBe(true);
  });

  it("votes only for options that are still live", async () => {
    const d = await demoInVote();
    const retired = d.optionIds[1];
    await db.update(schema.options).set({ slot: null, vetoed: true }).where(eq(schema.options.id, retired));
    await run(11_000);
    await until(async () => (await voteCount(d)) === 30, "all 30 bot votes");
    const rows = await votes(d.showId);
    expect(rows.some((r) => r.optionId === retired)).toBe(false);
  });

  it("never votes after the deadline", async () => {
    const d = await demoInVote();
    await run(4_000);
    const early = await drain(() => voteCount(d));
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(30);
    clock.now = d.endsAt + 1; // the deadline passes before the engine ticks
    await vi.advanceTimersByTimeAsync(20_000);
    await drain(() => voteCount(d));
    expect(await voteCount(d)).toBe(early);
  });

  it("is idempotent and ignores a start outside VOTE", async () => {
    const d = await demoInVote();
    const timers = botTimers();
    expect(timers).toBeGreaterThanOrEqual(30);
    await Promise.all([startBotVotes(d.roomId, 1), startBotVotes(d.roomId, 1)]);
    expect(botTimers()).toBe(timers);
    await run(11_000);
    await until(async () => (await voteCount(d)) === 30, "all 30 bot votes");
    await drain(() => voteCount(d));
    expect(await voteCount(d)).toBe(30); // 30, not 60
    stopBots(d.roomId);
    await startBotVotes(d.roomId, 2);
    expect(botTimers()).toBe(0);
  });
});
