// PERF2 engine fixes: narration overlaps the REVEAL publish, the pre-generated scene never blocks advance(),
// and DISTILL no longer writes ideas.cluster_id (nothing reads it).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { advance, resetEngineSingletons, setEngineClock, settleEffects } from "@/lib/engine/advance";
import { ai, botCalls, clock, engineRow, fakeRealtime, roundRow, rt } from "./engine-harness";
import { getState, hostAct, installClock, newShow, stormIdeas, tickToDeadline, vote } from "./engine-flow";

const h = vi.hoisted(() => ({
  revealGate: null as Promise<void> | null,
  pregenGate: null as Promise<void> | null,
}));

vi.mock("@/lib/realtime/index", async () => (await import("./engine-harness")).realtimeModule());
vi.mock("@/lib/ai/distill", async () => (await import("./engine-harness")).distillModule());
vi.mock("@/lib/ai/narrate", async () => (await import("./engine-harness")).narrateModule());
vi.mock("@/lib/ai/prompts", async () => {
  const base = (await import("./engine-harness")).promptsModule();
  return {
    ...base,
    // Round 2's pre-generated scene can be parked by a test; everything else answers at once.
    generatePrompt: async (input: Parameters<typeof base.generatePrompt>[0]) => {
      if (input.story.roundNo === 2 && h.pregenGate) await h.pregenGate;
      return base.generatePrompt(input);
    },
  };
});
vi.mock("@/lib/ai/finale", async () => (await import("./engine-harness")).finaleModule());
vi.mock("@/lib/bots/runner", async () => (await import("./engine-harness")).botsModule());
vi.mock("@/lib/presets", async () => (await import("./engine-harness")).presetsModule());

let db: Db;
let close: () => Promise<void>;
const realPublish = fakeRealtime.publishState.bind(fakeRealtime);

beforeAll(async () => {
  ({ db, close } = await useTestDb());
});
afterAll(async () => {
  resetEngineSingletons();
  setEngineClock(null);
  fakeRealtime.publishState = realPublish;
  await close();
});
beforeEach(async () => {
  resetEngineSingletons();
  await db.delete(schema.engineState);
  rt.reset();
  ai.reset();
  botCalls.starts.length = 0;
  botCalls.votes.length = 0;
  installClock();
  h.revealGate = null;
  h.pregenGate = null;
  // The REVEAL transition publish can be parked by a test (it stands for a slow Nexconn REST call).
  fakeRealtime.publishState = async (channelId, state, opts) => {
    if (state.phase === "REVEAL" && opts.phaseChanged && h.revealGate) await h.revealGate;
    await realPublish(channelId, state, opts);
  };
});

const until = async (cond: () => boolean, ms = 3000): Promise<void> => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 5));
  }
};

/** A show in VOTE of round 1 with two votes in, clock on the VOTE deadline. */
async function showAtVoteEnd() {
  const s = await newShow({ autoAdvance: true });
  await hostAct(s, { action: "start" });
  await tickToDeadline(s.roomId); // STORM
  await stormIdeas(s, 1);
  await tickToDeadline(s.roomId); // DISTILL -> VOTE
  await settleEffects();
  const opts = (await getState(s)).options!;
  await vote(s, s.players[0], 1, opts[0].id);
  await vote(s, s.players[1], 1, opts[0].id);
  await settleEffects();
  clock.set((await engineRow(db, s.roomId)).phaseEndsAt!.getTime());
  return s;
}

describe("narration critical path", () => {
  it("starts the narration while the REVEAL publish is still in flight, and publishes it afterwards", async () => {
    const s = await showAtVoteEnd();
    let release = () => {};
    h.revealGate = new Promise<void>((r) => {
      release = r;
    });
    const adv = advance(s.roomId, { type: "TICK" });

    await until(() => ai.narrateCalls.length === 1); // the model was asked although REVEAL is not out yet
    expect(rt.states.some((x) => x.state.phase === "REVEAL")).toBe(false);

    release();
    await adv;
    await settleEffects();

    const reveals = rt.states.filter((x) => x.state.phase === "REVEAL");
    expect(reveals[0].phaseChanged).toBe(true);
    const versions = rt.states.map((x) => x.state.v);
    expect(versions).toEqual([...versions].sort((a, b) => a - b)); // the narration publish never overtakes the REVEAL one
    expect(reveals.at(-1)!.state.outcome?.narration).toContain("Rob the vault");
    expect(ai.narrateCalls).toHaveLength(1);
  });

  it("keeps the running summary and beat from the narration result", async () => {
    const s = await showAtVoteEnd();
    await advance(s.roomId, { type: "TICK" });
    await settleEffects();
    const round = await roundRow(db, s.showId, 1);
    expect(round.beat).toBe("Beat 1: Rob the vault r1");
    expect(round.narration).toContain("Rob the vault");
    const [show] = await db.select({ storySummary: schema.shows.storySummary }).from(schema.shows).where(eq(schema.shows.id, s.showId));
    expect(show.storySummary).toContain("Rob the vault");
  });
});

describe("scene pre-generation", () => {
  it("does not hold up advance(): VOTE -> REVEAL returns while the next scene is still being written", async () => {
    const s = await showAtVoteEnd();
    let release = () => {};
    h.pregenGate = new Promise<void>((r) => {
      release = r;
    });
    const done = await Promise.race([advance(s.roomId, { type: "TICK" }).then(() => "advanced"), new Promise((r) => setTimeout(() => r("blocked"), 2000))]);
    expect(done).toBe("advanced");
    expect(await roundRow(db, s.showId, 2)).toBeUndefined();
    expect((await getState(s)).phase).toBe("REVEAL");

    release();
    await settleEffects();
    const r2 = await roundRow(db, s.showId, 2);
    expect(r2?.promptProvider).toBe("mock");
    expect(r2?.promptTitle).toBe("Scene 2");
  });
});

describe("distill persistence", () => {
  it("writes the options without touching ideas.cluster_id", async () => {
    const s = await newShow({ autoAdvance: true });
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await stormIdeas(s, 1);
    await tickToDeadline(s.roomId);
    await settleEffects();
    const state = await getState(s);
    expect(state.phase).toBe("VOTE");
    expect(state.options).toHaveLength(3);
    const round = await roundRow(db, s.showId, 1);
    const ideas = await db.select({ clusterId: schema.ideas.clusterId }).from(schema.ideas).where(eq(schema.ideas.roundId, round.id));
    expect(ideas.length).toBe(5);
    expect(ideas.every((i) => i.clusterId === null)).toBe(true);
  });
});
