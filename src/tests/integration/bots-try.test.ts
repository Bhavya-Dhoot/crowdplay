// Judge Mode end to end: POST /api/try, then a whole 3-round show with no host action (the engine ticks and
// the bot timers are driven by a fake clock), with the real distill pipeline so the demo boost is exercised.
// Bot ideas and votes finish in real database I/O after their fake timer fires, so the show waits for them
// (bots-harness) before it moves the engine clock on; nothing here races the wall clock.
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as tryRoute } from "@/app/api/try/route";
import type { TryRes } from "@/lib/api/contracts";
import { BOT_PERSONAS } from "@/lib/bots/personas";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { resetEngineSingletons, setEngineClock, settleEffects } from "@/lib/engine/advance";
import { buildPublicState } from "@/lib/engine/publish";
import { ingestIdea } from "@/lib/ingest/ideas";
import { resetRateLimits } from "@/lib/ingest/ratelimit";
import { castVote, getRoomByCode } from "@/lib/rooms";
import { ai, makeUser, req, rt, roundRow, type TestUser } from "./engine-harness";
import { botTimers, drain, resetBotState, run, until } from "./bots-harness";
import { installClock, tickToDeadline } from "./engine-flow";

vi.mock("@/lib/realtime/index", async () => (await import("./engine-harness")).realtimeModule());

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await useTestDb());
});
afterAll(async () => {
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
  installClock();
});
afterEach(() => {
  vi.clearAllTimers();
});

const startTry = async (user: TestUser, body?: unknown) => {
  const res = await tryRoute(req("/api/try", { method: "POST", user, body }));
  return { status: res.status, body: (await res.json()) as TryRes & { code?: string; message?: string; hostKey?: string } };
};

describe("POST /api/try", () => {
  it("creates a started demo room: 3 rounds, 30 bot participants plus the judge, no host key", async () => {
    const judge = await makeUser(db, "Judge Judy");
    const r = await startTry(judge);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.code).toMatch(/^[A-Z]{5}$/);
    expect(r.body).not.toHaveProperty("hostKey");

    const room = (await getRoomByCode(r.body.code!))!;
    expect(room).toMatchObject({ isDemo: true, demoUserId: judge.id, hostUserId: judge.id, title: "Demo show" });
    const [show] = await db.select().from(schema.shows).where(eq(schema.shows.roomId, room.id));
    expect(show).toMatchObject({ id: r.body.showId, roundsTotal: 3, autoAdvance: true, preset: "heist" });
    const [eng] = await db.select().from(schema.engineState).where(eq(schema.engineState.roomId, room.id));
    expect(["PROMPT", "STORM"]).toContain(eng.phase);
    expect(eng.roundNo).toBe(1);

    const parts = await db
      .select({ id: schema.participants.userId, bot: schema.users.isBot })
      .from(schema.participants)
      .innerJoin(schema.users, eq(schema.users.id, schema.participants.userId))
      .where(eq(schema.participants.roomId, room.id));
    expect(parts).toHaveLength(31);
    expect(parts.filter((p) => p.bot)).toHaveLength(30);
    expect(parts.filter((p) => !p.bot).map((p) => p.id)).toEqual([judge.id]);

    const state = await buildPublicState(room.id);
    expect(state).toMatchObject({ isDemo: true, roundsTotal: 3, preset: "heist", phase: "PROMPT" });
    expect(state.stats.players).toBe(31);
  });

  it("applies the name sent with the request and refuses a blocked one", async () => {
    const judge = await makeUser(db, "Old Name");
    const ok = await startTry(judge, { displayName: "Fresh Name" });
    expect(ok.status).toBe(200);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, judge.id));
    expect(u.displayName).toBe("Fresh Name");
    const [p] = await db.select({ name: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, judge.id));
    expect(p.name).toBe("Fresh Name");

    const bad = await startTry(await makeUser(db, "Other Judge"), { displayName: "fuck" });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("NAME_BLOCKED");
  });

  it("needs a session", async () => {
    const res = await tryRoute(req("/api/try", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("NO_SESSION");
  });

  it("rate-limits demo creation per user", async () => {
    const judge = await makeUser(db, "Eager Judge");
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await startTry(judge)).status);
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes.slice(5)).toEqual([429, 429]);
    const again = await startTry(judge);
    expect(again.body.code).toBe("DEMO_LIMIT");
    expect(again.body.message).toMatch(/seconds/);
    // Someone else on the same network is not blocked by this user's bucket.
    expect((await startTry(await makeUser(db, "Calm Judge"))).status).toBe(200);
  });
});

describe("a 3-round demo with no host action", () => {
  it("runs PROMPT -> STORM -> DISTILL -> VOTE -> REVEAL x3 to FINALE; the judge's idea is boosted onto the ballot and earns a BALLOT receipt", async () => {
    const judge = await makeUser(db, "Judge Judy");
    const started = await startTry(judge);
    expect(started.status).toBe(200);
    const room = (await getRoomByCode(started.body.code!))!;
    const showId = started.body.showId;
    const botIds = new Set(BOT_PERSONAS.map((p) => p.id));
    const judgeIdeas = [
      "teach the vault door to love knock knock jokes",
      "borrow a submarine and arrive through the fountain",
      "hire the hotel's ghost as our inside man",
    ];

    for (let r = 1; r <= 3; r++) {
      const [pre] = await db.select().from(schema.engineState).where(eq(schema.engineState.roomId, room.id));
      expect(pre).toMatchObject({ phase: "PROMPT", roundNo: r });

      await tickToDeadline(room.id); // PROMPT -> STORM: the engine starts the bots
      await settleEffects();
      await run(2_000);
      resetRateLimits(); // the limiter reads the wall clock, which this test does not move
      const sent = await ingestIdea({
        roomCode: room.code,
        userId: judge.id,
        roundNo: r,
        text: judgeIdeas[r - 1],
        clientMsgId: `judge_idea_${r}_${r}`,
        source: "post",
      });
      expect(JSON.stringify(sent), `round ${r} judge idea`).toContain(`"ok":true`);
      await run(17_000); // 19 s into the 20 s storm: every bot idea is scheduled by now (the last ~1.2 s before the end)

      const round = await roundRow(db, showId, r);
      const stormIdeas = () => db.select().from(schema.ideas).where(eq(schema.ideas.roundId, round.id));
      const botIdeas = async () => (await stormIdeas()).filter((i) => botIds.has(i.userId)).length;
      await until(async () => (await botIdeas()) === 60, `round ${r}: all 60 bot ideas stored`);
      await drain(botIdeas);
      expect(await botIdeas()).toBe(60);
      expect((await stormIdeas()).filter((i) => i.userId === judge.id)).toHaveLength(1);
      await until(
        () => rt.messages.filter((m) => m.msg.t === "idea" && botIds.has(m.from)).length === 60 * r,
        `round ${r}: all bot idea messages sent`,
      );

      await tickToDeadline(room.id); // STORM -> DISTILL -> VOTE (bot votes start)
      await settleEffects();
      const state = await buildPublicState(room.id);
      expect(state.phase).toBe("VOTE");
      expect(state.options).toHaveLength(3);

      // D2: the judge's idea is on the ballot as the boosted wildcard, credited to the judge.
      const boosted = state.options!.find((o) => o.boosted);
      expect(boosted, `round ${r}: a boosted option`).toBeDefined();
      expect(boosted).toMatchObject({ slot: "C", kind: "wildcard" });
      expect(boosted!.credit.map((c) => c.name)).toContain("Judge Judy");
      const [ballot] = await db
        .select()
        .from(schema.receipts)
        .where(and(eq(schema.receipts.userId, judge.id), eq(schema.receipts.roundId, round.id), eq(schema.receipts.type, "BALLOT")));
      expect(ballot, `round ${r}: judge BALLOT receipt`).toBeDefined();
      expect(ballot.optionId).toBe(boosted!.id);
      expect(rt.receipts.some((x) => x.userId === judge.id && x.receipt.type === "BALLOT" && x.receipt.roundNo === r)).toBe(true);

      await run(500);
      await castVote(room, judge.id, { roundNo: r, optionId: boosted!.id });
      await run(10_500); // 11 s into the 12 s vote: every bot vote is scheduled by now (the last ~1 s before the end)
      const voteRows = () => db.select().from(schema.votes).where(eq(schema.votes.roundId, round.id));
      await until(async () => (await voteRows()).length === 31, `round ${r}: 30 bot votes plus the judge's`);
      await drain(async () => (await voteRows()).length);
      const botVotes = await voteRows();
      expect(botVotes.filter((v) => botIds.has(v.userId))).toHaveLength(30);
      expect(botVotes).toHaveLength(31);

      await tickToDeadline(room.id); // VOTE -> REVEAL
      await settleEffects();
      const [revealed] = await db.select().from(schema.rounds).where(eq(schema.rounds.id, round.id));
      expect(revealed.winnerOptionId).toBeTruthy();
      expect(revealed.narration).toBeTruthy();

      await tickToDeadline(room.id); // REVEAL -> next PROMPT, or FINALE
      await settleEffects();
    }

    const [end] = await db.select().from(schema.engineState).where(eq(schema.engineState.roomId, room.id));
    expect(end.phase).toBe("FINALE");
    const final = await buildPublicState(room.id);
    expect(final.finale?.canonMakers.length).toBeGreaterThan(0);
    expect(botTimers()).toBe(0);
    // Nothing a person had to do: the only host-side calls were engine ticks; the judge never held a key.
    expect(rt.messages.filter((m) => m.msg.t === "idea" && botIds.has(m.from)).length).toBe(180);
  }, 180_000);
});
