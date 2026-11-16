import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNotNull, like } from "drizzle-orm";
import { resetConfig } from "@/lib/config";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { advance, resetEngineSingletons, setEngineClock, settleEffects } from "@/lib/engine/advance";
import { recoverInterruptedEffects } from "@/lib/engine/effects";
import { flushDirtyPublishes } from "@/lib/engine/publish";
import { startTicker, stopTicker, tickOnce } from "@/lib/engine/ticker";
import { ai, botCalls, clock, engineRow, roundRow, rt } from "./engine-harness";
import { getState, hostAct, installClock, newShow, receiptRows, stormIdeas, tickToDeadline, vote } from "./engine-flow";

vi.mock("@/lib/realtime/index", async () => (await import("./engine-harness")).realtimeModule());
vi.mock("@/lib/ai/distill", async () => (await import("./engine-harness")).distillModule());
vi.mock("@/lib/ai/narrate", async () => (await import("./engine-harness")).narrateModule());
vi.mock("@/lib/ai/prompts", async () => (await import("./engine-harness")).promptsModule());
vi.mock("@/lib/ai/finale", async () => (await import("./engine-harness")).finaleModule());
vi.mock("@/lib/bots/runner", async () => (await import("./engine-harness")).botsModule());
vi.mock("@/lib/presets", async () => (await import("./engine-harness")).presetsModule());

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await useTestDb());
});
afterAll(async () => {
  resetEngineSingletons();
  setEngineClock(null);
  await close();
});
beforeEach(async () => {
  resetEngineSingletons();
  await db.delete(schema.engineState); // rooms of earlier tests must not look "due" to the ticker scans below
  rt.reset();
  ai.reset();
  botCalls.starts.length = 0;
  botCalls.votes.length = 0;
  installClock();
});

describe("B6: advance() under concurrency", () => {
  it("20 concurrent advance(TICK) past a deadline make exactly one transition", async () => {
    const s = await newShow({ autoAdvance: true });
    await hostAct(s, { action: "start" });
    await settleEffects();
    const before = await engineRow(db, s.roomId);
    expect(before.phase).toBe("PROMPT");
    const publishedBefore = rt.states.length;

    clock.set(before.phaseEndsAt!.getTime());
    const results = await Promise.all(Array.from({ length: 20 }, () => advance(s.roomId, { type: "TICK" })));
    await settleEffects();

    expect(results.filter((r) => r.changed)).toHaveLength(1);
    const after = await engineRow(db, s.roomId);
    expect(after.phase).toBe("STORM");
    expect(after.version).toBe(before.version + 1);
    const published = rt.states.slice(publishedBefore);
    expect(published.filter((p) => p.phaseChanged)).toHaveLength(1);
    expect(published.every((p) => p.state.v === after.version)).toBe(true);
  });

  it("a deadline race between TICK and host actions still moves one step", async () => {
    const s = await newShow({ autoAdvance: true });
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId); // STORM
    await settleEffects();
    const before = await engineRow(db, s.roomId);
    clock.set(before.phaseEndsAt!.getTime());
    const calls = [
      ...Array.from({ length: 10 }, () => advance(s.roomId, { type: "TICK" })),
      ...Array.from({ length: 10 }, () => advance(s.roomId, { type: "HOST_END_STORM" })),
    ];
    const results = await Promise.all(calls);
    await settleEffects();
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    const after = await engineRow(db, s.roomId);
    expect(after.phase).toBe("VOTE"); // DISTILL finished on its own and opened the vote
    expect(ai.distillCalls).toHaveLength(1); // the distill effect ran once
  });

  it("closing a vote under 20 concurrent TICKs runs CLOSE_VOTE, receipts and narration once", async () => {
    const s = await newShow({ autoAdvance: true });
    const [ava, ben] = s.players;
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await stormIdeas(s, 1);
    await tickToDeadline(s.roomId);
    await settleEffects();
    const opts = (await getState(s)).options!;
    await vote(s, ava, 1, opts[0].id);
    await vote(s, ben, 1, opts[0].id);
    await settleEffects();

    clock.set((await engineRow(db, s.roomId)).phaseEndsAt!.getTime());
    const results = await Promise.all(Array.from({ length: 20 }, () => advance(s.roomId, { type: "TICK" })));
    await settleEffects();

    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(ai.narrateCalls).toHaveLength(1);
    expect(ai.promptCalls.filter((p) => p.story.roundNo === 2)).toHaveLength(1);
    expect(await receiptRows(s, 1, "CANON")).toHaveLength(2);
    const closes = await db.select().from(schema.events).where(like(schema.events.id, `${s.roomId}:1:CLOSE_VOTE:%`));
    expect(closes).toHaveLength(1);
    const canonSends = rt.receipts.filter((r) => r.receipt.type === "CANON");
    expect(canonSends).toHaveLength(2);
  });
});

describe("A10: restart mid-round resumes from the database", () => {
  it("restart during STORM keeps ideas and finishes the round", async () => {
    const s = await newShow({ autoAdvance: true });
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await stormIdeas(s, 1);

    resetEngineSingletons(); // new process: no mutexes, no pending effects, no coalesced publishes
    rt.reset();

    expect((await getState(s)).phase).toBe("STORM");
    const ends = (await engineRow(db, s.roomId)).phaseEndsAt!.getTime();
    clock.set(ends);
    expect(await tickOnce(clock.now)).toBe(1); // the ticker finds the due room by itself
    await settleEffects();
    const st = await getState(s);
    expect(st.phase).toBe("VOTE");
    expect(st.options).toHaveLength(3);
    expect(st.stats.ideasThisRound).toBe(5);
  });

  it("restart during VOTE keeps the votes and still closes on time", async () => {
    const s = await newShow({ autoAdvance: true });
    const [ava, ben, cleo] = s.players;
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await stormIdeas(s, 1);
    await tickToDeadline(s.roomId);
    await settleEffects();
    const opts = (await getState(s)).options!;
    await vote(s, ava, 1, opts[1].id);
    await vote(s, ben, 1, opts[1].id);
    await vote(s, cleo, 1, opts[0].id);
    await settleEffects();

    resetEngineSingletons();
    rt.reset();

    const mid = await getState(s);
    expect(mid.phase).toBe("VOTE");
    expect(mid.tally).toEqual({ [opts[0].id]: 1, [opts[1].id]: 2, [opts[2].id]: 0 });
    await tickToDeadline(s.roomId);
    await settleEffects();
    expect((await getState(s)).outcome?.optionId).toBe(opts[1].id);
  });

  it("restart during DISTILL resolves via the cap tick with the heuristic path", async () => {
    const s = await newShow({ autoAdvance: true });
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await stormIdeas(s, 1);
    ai.distill = "hang"; // the full run never answers: the process "dies" with it
    await tickToDeadline(s.roomId);
    await Promise.resolve();
    expect((await engineRow(db, s.roomId)).phase).toBe("DISTILL");

    resetEngineSingletons();
    rt.reset();

    expect((await getState(s)).phase).toBe("DISTILL");
    const cap = (await engineRow(db, s.roomId)).phaseEndsAt!.getTime();
    clock.set(cap - 1);
    expect(await tickOnce(clock.now)).toBe(0); // before the cap nothing happens
    clock.set(cap);
    expect(await tickOnce(clock.now)).toBe(1);
    const grace = await engineRow(db, s.roomId);
    expect(grace.phase).toBe("DISTILL");
    expect(grace.phaseEndsAt!.getTime()).toBe(cap + 3000);
    await settleEffects();

    const st = await getState(s);
    expect(st.phase).toBe("VOTE");
    expect(st.options?.map((o) => o.slot)).toEqual(["A", "B", "C"]);
    const round = await roundRow(db, s.showId, 1);
    expect(round).toMatchObject({ fallbackUsed: true, distillProvider: "heuristic" });
    expect(ai.distillCalls.filter((c) => c.heuristicOnly)).toHaveLength(1);
  });

  it("a full distill that finishes after the heuristic run already took over changes nothing", async () => {
    ai.distill = "defer";
    const s = await newShow({ autoAdvance: true });
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await stormIdeas(s, 1);
    await tickToDeadline(s.roomId); // DISTILL: the full run is parked
    await tickToDeadline(s.roomId); // cap -> heuristic grace run
    // settleEffects() would wait for the parked full run too, so poll for the phase instead.
    await vi.waitFor(async () => expect((await engineRow(db, s.roomId)).phase).toBe("VOTE"), { timeout: 5000, interval: 25 });
    const st = await getState(s);
    const labels = st.options!.map((o) => o.label);
    await flushDirtyPublishes(); // stats publishes queued by the joins would also bump the version
    const version = (await engineRow(db, s.roomId)).version;

    ai.release(); // the slow full run answers late
    await vi.waitFor(async () => expect((await db.select().from(schema.events).where(like(schema.events.id, `${s.roomId}:1:RUN_DISTILL:full`)))[0].data).toMatchObject({ done: true }));
    await settleEffects();

    expect((await getState(s)).options!.map((o) => o.label)).toEqual(labels);
    const round = await roundRow(db, s.showId, 1);
    const live = await db.select().from(schema.options).where(and(eq(schema.options.roundId, round.id), isNotNull(schema.options.slot)));
    expect(live).toHaveLength(3); // the late full run did not add a second set of options
    expect((await engineRow(db, s.roomId)).version).toBe(version);
    expect(await roundRow(db, s.showId, 1)).toMatchObject({ distillProvider: "heuristic" });
  });

  it("a REVEAL whose narration was lost in the restart gets it back", async () => {
    const s = await newShow({ autoAdvance: true });
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await stormIdeas(s, 1);
    await tickToDeadline(s.roomId);
    await settleEffects();
    await tickToDeadline(s.roomId); // VOTE -> REVEAL
    await settleEffects();
    const round = await roundRow(db, s.showId, 1);
    expect(round.narration).not.toBeNull();

    // Simulate the process dying before the narration landed: narration gone, effect row never finished.
    await db.update(schema.rounds).set({ narration: null, beat: null }).where(eq(schema.rounds.id, round.id));
    await db
      .update(schema.events)
      .set({ data: { startedAt: clock.now } })
      .where(and(eq(schema.events.roomId, s.roomId), like(schema.events.id, "%:GEN_NARRATION:%")));
    resetEngineSingletons();
    rt.reset();
    ai.narrateCalls.length = 0;

    expect(await recoverInterruptedEffects(clock.now)).toBeGreaterThan(0);
    await settleEffects();
    expect((await roundRow(db, s.showId, 1)).narration).toContain("The crowd chose");
    expect(ai.narrateCalls).toHaveLength(1);
    expect((await getState(s)).outcome?.narration).toContain("The crowd chose");
    // Finished effects are not repeated by a second recovery pass.
    await recoverInterruptedEffects(clock.now);
    await settleEffects();
    expect(ai.narrateCalls).toHaveLength(1);
  });
});

describe("ticker", () => {
  it("startTicker advances a due room on its own and is guarded against double start", async () => {
    setEngineClock(null); // real time: this test runs the real 250 ms interval
    const s = await newShow({ autoAdvance: true });
    await hostAct(s, { action: "start" });
    expect((await engineRow(db, s.roomId)).phase).toBe("PROMPT");
    await db.update(schema.engineState).set({ phaseEndsAt: new Date(Date.now() - 1000) }).where(eq(schema.engineState.roomId, s.roomId));
    startTicker();
    startTicker();
    try {
      await vi.waitFor(async () => expect((await engineRow(db, s.roomId)).phase).toBe("STORM"), { timeout: 3000, interval: 100 });
    } finally {
      stopTicker();
    }
    const row = await engineRow(db, s.roomId);
    expect(row.version).toBeGreaterThanOrEqual(3);
  });
});

describe("instrumentation", () => {
  it("boots only on the Node runtime, starts the ticker, and refuses the mock transport in production", async () => {
    const { register } = await import("@/instrumentation");
    const g = globalThis as unknown as { __cpTicker?: unknown };

    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(g.__cpTicker).toBeUndefined();

    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await register();
    expect(g.__cpTicker).toBeDefined();
    stopTicker();
    await settleEffects();

    vi.stubEnv("NODE_ENV", "production");
    resetConfig();
    await expect(register()).rejects.toThrow(/Refusing to start/);
    expect(g.__cpTicker).toBeUndefined();
    vi.unstubAllEnvs();
    resetConfig();
  });
});
