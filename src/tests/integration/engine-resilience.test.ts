import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET as feedRoute } from "@/app/api/rooms/[code]/host/feed/route";
import type { HostFeedRes } from "@/lib/api/contracts";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { resetEngineSingletons, setEngineClock, settleEffects } from "@/lib/engine/advance";
import { addIdea, ai, call, clock, engineRow, roundRow, rt } from "./engine-harness";
import { getState, hostAct, installClock, newShow, receiptRows, stormIdeas, tickToDeadline, vote, type Show } from "./engine-flow";

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
beforeEach(() => {
  resetEngineSingletons();
  rt.reset();
  ai.reset();
  installClock();
});

async function stormToDistill(s: Show, ideas = true) {
  await hostAct(s, { action: "start" });
  await tickToDeadline(s.roomId); // STORM
  if (ideas) await stormIdeas(s, 1);
  await tickToDeadline(s.roomId); // DISTILL
}

const feed = (s: Show) => call<HostFeedRes>(feedRoute, new Request("http://localhost/x", { headers: { "x-host-key": s.hostKey } }), s.code);

describe("B1: distiller failures never stall the round", () => {
  it("distillRound throwing -> heuristic retry, round completes, fallback is reported to the host", async () => {
    ai.distill = "throw-full";
    const s = await newShow({ autoAdvance: true });
    await stormToDistill(s);
    await settleEffects();

    const st = await getState(s);
    expect(st.phase).toBe("VOTE");
    expect(st.options).toHaveLength(3);
    expect(ai.distillCalls.map((c) => Boolean(c.heuristicOnly))).toEqual([false, true]);
    expect(await roundRow(db, s.showId, 1)).toMatchObject({ fallbackUsed: true, distillProvider: "heuristic" });
    const f = await feed(s);
    expect(f.body.metrics).toMatchObject({ fallbackUsed: true, distillProvider: "heuristic" });
    expect(f.body.metrics.distillMs).not.toBeNull();

    await tickToDeadline(s.roomId); // the rest of the round still runs
    await settleEffects();
    expect((await getState(s)).outcome).toBeDefined();
  });

  it("even the heuristic path failing yields narrator options and a completed round", async () => {
    ai.distill = "throw-all";
    const s = await newShow({ autoAdvance: true });
    await stormToDistill(s);
    await settleEffects();
    const st = await getState(s);
    expect(st.phase).toBe("VOTE");
    expect(st.options!.map((o) => o.kind)).toEqual(["narrator", "narrator", "narrator"]);
    expect(st.options!.map((o) => o.label)).toEqual(["heist: act", "heist: wait", "heist: run"]);
    expect(await roundRow(db, s.showId, 1)).toMatchObject({ fallbackUsed: true, distillProvider: "template" });
  });

  it("a malformed model result is treated as a failure", async () => {
    ai.distill = "malformed";
    const s = await newShow({ autoAdvance: true });
    await stormToDistill(s);
    await settleEffects();
    expect((await getState(s)).options).toHaveLength(3);
    expect(await roundRow(db, s.showId, 1)).toMatchObject({ fallbackUsed: true, distillProvider: "heuristic" });
  });

  it("supporters come from the database: unknown, foreign and unsafe source ids are ignored", async () => {
    ai.distill = "inflate";
    const s = await newShow({ autoAdvance: true });
    const [ava] = s.players;
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await stormIdeas(s, 1);
    // An idea of another round the model might try to claim.
    const round2 = await db.select().from(schema.rounds).where(eq(schema.rounds.showId, s.showId));
    expect(round2).toHaveLength(1);
    await db.insert(schema.rounds).values({
      id: "rd_foreign",
      showId: s.showId,
      roundNo: 2,
      promptTitle: "x",
      promptText: "y",
      narratorOptions: ["a", "b", "c"],
    });
    ai.foreignIds = [await addIdea(db, s.showId, 2, ava.id, "Foreign idea", clock.now)];
    await tickToDeadline(s.roomId);
    await settleEffects();
    const opts = (await getState(s)).options!;
    expect(opts[0].supporters).toBe(2);
    const [a] = await db.select().from(schema.options).where(eq(schema.options.id, opts[0].id));
    expect((a.sourceIdeaIds as string[]).sort()).toHaveLength(2);
    expect(a.supporters).toBe(2);
  });

  it("ideas flagged unsafe are blocked, drop out of the option's sources and of the counts", async () => {
    ai.distill = "unsafe";
    const s = await newShow({ autoAdvance: true });
    await stormToDistill(s);
    await settleEffects();
    const st = await getState(s);
    expect(st.options![0].supporters).toBe(1); // one of the two "Rob the vault" ideas was flagged
    const blocked = await db
      .select({ id: schema.ideas.id })
      .from(schema.ideas)
      .innerJoin(schema.rounds, eq(schema.rounds.id, schema.ideas.roundId))
      .where(eq(schema.ideas.status, "blocked"));
    expect(blocked).toHaveLength(1);
    expect(await roundRow(db, s.showId, 1)).toMatchObject({ ideasCount: 4 });
  });
});

describe("B3: a silent round", () => {
  it("zero ideas -> three narrator options, no credits, no receipts, the round still completes", async () => {
    const s = await newShow({ autoAdvance: true });
    await stormToDistill(s, false);
    await settleEffects();
    const st = await getState(s);
    expect(st.phase).toBe("VOTE");
    expect(st.options!.every((o) => o.kind === "narrator" && o.credit.length === 0 && o.more === 0 && o.supporters === 0)).toBe(true);
    expect(st.stats.ideasThisRound).toBe(0);
    expect(await receiptRows(s, 1, "BALLOT")).toHaveLength(0);

    await tickToDeadline(s.roomId);
    await settleEffects();
    const rev = await getState(s);
    expect(rev.phase).toBe("REVEAL");
    expect(rev.outcome?.optionId).toBe(st.options![0].id); // no votes, no ideas: slot A
    expect(rev.outcome?.credit).toEqual([]);
    expect(rev.outcome?.narration).toBeTruthy();
    expect(await receiptRows(s, 1, "CANON")).toHaveLength(0);
  });
});

describe("no external failure stalls a round", () => {
  it("a dead transport does not block transitions", async () => {
    const s = await newShow({ autoAdvance: true });
    rt.failPublish = true;
    expect((await hostAct(s, { action: "start" })).status).toBe(200);
    await tickToDeadline(s.roomId);
    expect((await engineRow(db, s.roomId)).phase).toBe("STORM");
    rt.failPublish = false;
    expect((await getState(s)).phase).toBe("STORM");
  });

  it("a failing finale model falls back to the beats", async () => {
    ai.finale = "throw";
    const s = await newShow({ autoAdvance: false, roundsTotal: 3 });
    const [ava] = s.players;
    await hostAct(s, { action: "start" });
    await hostAct(s, { action: "next" });
    await stormIdeas(s, 1);
    await hostAct(s, { action: "endStorm" });
    await settleEffects();
    const opts = (await getState(s)).options!;
    await vote(s, ava, 1, opts[0].id);
    await hostAct(s, { action: "next" }); // REVEAL
    await settleEffects();
    await hostAct(s, { action: "endShow" }); // FINALE from REVEAL
    await settleEffects();
    const st = await getState(s);
    expect(st.phase).toBe("FINALE");
    expect(st.finale).toMatchObject({ storyTitle: "Heist Night", tagline: "A story written by the crowd." });
    expect(st.finale?.recap).toContain("Beat 1: Rob the vault");
  });

  it("a room is created even when the transport cannot make its channel", async () => {
    rt.failEnsure = true;
    const s = await newShow({ autoAdvance: true, join: false });
    expect((await engineRow(db, s.roomId)).phase).toBe("LOBBY");
    expect(rt.channels).toEqual([]);
  });
});
