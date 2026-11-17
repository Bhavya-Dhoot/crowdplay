// PERF2: option credits are read once per ballot, not once per state build, and moderation still shows at once.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { resetEngineSingletons, setEngineClock, settleEffects } from "@/lib/engine/advance";
import { buildPublicState, invalidateCredits } from "@/lib/engine/publish";
import { ai, botCalls, rt, roundRow } from "./engine-harness";
import { getState, hostAct, installClock, newShow, stormIdeas, tickToDeadline, type Show } from "./engine-flow";

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
  await db.delete(schema.engineState);
  rt.reset();
  ai.reset();
  botCalls.starts.length = 0;
  botCalls.votes.length = 0;
  installClock();
});

async function showInVote(): Promise<Show> {
  const s = await newShow({ autoAdvance: true });
  await hostAct(s, { action: "start" });
  await tickToDeadline(s.roomId);
  await stormIdeas(s, 1);
  await tickToDeadline(s.roomId);
  await settleEffects();
  return s;
}

const creditNames = (state: Awaited<ReturnType<typeof buildPublicState>>, slot: "A" | "B" | "C") =>
  state.options!.find((o) => o.slot === slot)!.credit.map((c) => c.name);

describe("credit cache", () => {
  it("serves the contributors of a live option from memory until something signals a change", async () => {
    const s = await showInVote();
    const first = await buildPublicState(s.roomId);
    expect(creditNames(first, "A")).toEqual(["Ava", "Ben"]);

    // A rename that signals nothing is not visible while the entry is fresh: proof the second build read no ideas or users.
    await db.update(schema.users).set({ displayName: "Avalanche" }).where(eq(schema.users.id, s.players[0].id));
    expect(creditNames(await buildPublicState(s.roomId), "A")).toEqual(["Ava", "Ben"]);

    invalidateCredits(s.roomId);
    expect(creditNames(await buildPublicState(s.roomId), "A")).toEqual(["Avalanche", "Ben"]);
  });

  it("host moderation shows in the very next state: deleting a supporting idea drops the credit and the count", async () => {
    const s = await showInVote();
    const before = await getState(s);
    const optA = before.options!.find((o) => o.slot === "A")!;
    expect(optA.supporters).toBe(2);

    const round = await roundRow(db, s.showId, 1);
    const [benIdea] = await db
      .select({ id: schema.ideas.id })
      .from(schema.ideas)
      .where(and(eq(schema.ideas.roundId, round.id), eq(schema.ideas.userId, s.players[1].id), eq(schema.ideas.text, "Rob the vault r1")));
    const res = await hostAct(s, { action: "deleteIdea", ideaId: benIdea.id });
    expect(res.status).toBe(200);

    const after = await getState(s);
    const optAfter = after.options!.find((o) => o.slot === "A")!;
    expect(optAfter.supporters).toBe(1);
    expect(optAfter.credit.map((c) => c.name)).toEqual(["Ava"]);
  });

  it("a banned player's ideas leave the credits at once", async () => {
    const s = await showInVote();
    await getState(s); // warm the cache
    const res = await hostAct(s, { action: "ban", userId: s.players[1].id, on: true });
    expect(res.status).toBe(200);
    const state = await getState(s);
    for (const slot of ["A", "B", "C"] as const) expect(creditNames(state, slot)).not.toContain("Ben");
  });
});
