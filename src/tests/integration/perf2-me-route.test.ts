// PERF2: GET /api/rooms/:code/me answers "my view" cheaply and has none of the join side effects.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET as meRoute } from "@/app/api/rooms/[code]/me/route";
import type { MeInRoom } from "@/lib/api/contracts";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { resetEngineSingletons, setEngineClock, settleEffects } from "@/lib/engine/advance";
import { ai, botCalls, call, clock, engineRow, makeUser, req, rt, type TestUser } from "./engine-harness";
import { getState, hostAct, installClock, newShow, stormIdeas, tickToDeadline, vote, type Show } from "./engine-flow";

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

type MeBody = { ok: boolean; me?: MeInRoom; code?: string };
const getMeIn = (s: Show, user?: TestUser) => call<MeBody>(meRoute, req(`/api/rooms/${s.code}/me`, { user }), s.code);

async function showInVote(): Promise<Show> {
  const s = await newShow({ autoAdvance: true });
  await hostAct(s, { action: "start" });
  await tickToDeadline(s.roomId);
  await stormIdeas(s, 1);
  await tickToDeadline(s.roomId);
  await settleEffects();
  return s;
}

describe("GET /api/rooms/:code/me", () => {
  it("returns my vote, my options and my idea count during VOTE", async () => {
    const s = await showInVote();
    const [ava, , cleo] = s.players;
    const opts = (await getState(s)).options!;
    const a = opts.find((o) => o.slot === "A")!;
    await vote(s, ava, 1, a.id);

    const mine = await getMeIn(s, ava);
    expect(mine.status).toBe(200);
    expect(mine.body.me).toMatchObject({ userId: ava.id, displayName: "Ava", vote: a.id, muted: false, banned: false, ideasThisRound: 2 });
    expect(mine.body.me!.myOptionIds).toContain(a.id);

    const other = await getMeIn(s, cleo);
    expect(other.body.me).toMatchObject({ userId: cleo.id, vote: null });
    expect(other.body.me!.myOptionIds).not.toContain(a.id);
  });

  it("does not join anybody: strangers get NOT_PARTICIPANT, no session gets NO_SESSION", async () => {
    const s = await showInVote();
    const stranger = await makeUser(db, "Stranger");
    const before = await db.select().from(schema.participants).where(eq(schema.participants.roomId, s.roomId));

    const res = await getMeIn(s, stranger);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("NOT_PARTICIPANT");
    expect((await getMeIn(s)).status).toBe(401);

    const after = await db.select().from(schema.participants).where(eq(schema.participants.roomId, s.roomId));
    expect(after).toHaveLength(before.length);
  });

  it("does no lazy advance: a passed deadline stays untouched", async () => {
    const s = await showInVote();
    const before = await engineRow(db, s.roomId);
    expect(before.phase).toBe("VOTE");
    clock.set(before.phaseEndsAt!.getTime() + 5_000);
    const res = await getMeIn(s, s.players[0]);
    expect(res.status).toBe(200);
    await settleEffects();
    const after = await engineRow(db, s.roomId);
    expect(after.phase).toBe("VOTE");
    expect(after.version).toBe(before.version);
  });

  it("answers 404 for an unknown room", async () => {
    const u = await makeUser(db, "Zed");
    const res = await call<MeBody>(meRoute, req("/api/rooms/NOPE/me", { user: u }), "NOPE");
    expect(res.status).toBe(404);
  });
});
