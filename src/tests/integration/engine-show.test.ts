import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET as infoRoute } from "@/app/api/rooms/[code]/route";
import { GET as feedRoute } from "@/app/api/rooms/[code]/host/feed/route";
import type { HostFeedRes, RoomInfoRes } from "@/lib/api/contracts";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { resetEngineSingletons, setEngineClock, settleEffects } from "@/lib/engine/advance";
import { addIdea, ai, botCalls, call, clock, makeUser, rt, roundRow } from "./engine-harness";
import { getState, hostAct, installClock, joinAs, newShow, receiptRows, stormIdeas, tickToDeadline, vote } from "./engine-flow";
import { createRoom } from "@/lib/rooms";

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
  botCalls.starts.length = 0;
  botCalls.votes.length = 0;
  installClock();
});

describe("A3/A7/A8: full 3-round show with auto-advance", () => {
  it("runs create -> join x3 -> ideas -> distill -> votes -> reveal x3 -> FINALE -> ENDED", async () => {
    const s = await newShow({ autoAdvance: true });
    const [ava, ben, cleo] = s.players;

    const info = await call<RoomInfoRes>(infoRoute, new Request("http://localhost/x"), s.code);
    expect(info.body.room).toMatchObject({ title: "Heist Night", hostName: "Hosty", players: 3, phase: "LOBBY", full: false, isDemo: false });
    // Round 1 is written at creation, so the first PROMPT needs no model call.
    expect((await roundRow(db, s.showId, 1)).promptProvider).toBe("preset");

    expect((await hostAct(s, { action: "start" })).body.state.phase).toBe("PROMPT");
    const winners: string[] = [];

    for (let r = 1; r <= 3; r++) {
      let st = await getState(s);
      expect(st).toMatchObject({ phase: "PROMPT", roundNo: r, roundsTotal: 3 });
      expect(st.prompt?.title).toBeTruthy();
      expect(st.options).toBeUndefined();

      await tickToDeadline(s.roomId); // PROMPT -> STORM
      expect((await getState(s)).phase).toBe("STORM");
      await stormIdeas(s, r);
      if (r === 2) await db.update(schema.users).set({ displayName: "Ava Prime" }).where(eq(schema.users.id, ava.id));

      await tickToDeadline(s.roomId); // STORM -> DISTILL, distill runs in the background
      await settleEffects(); // RUN_DISTILL persists and sends DISTILL_DONE
      st = await getState(s);
      expect(st.phase).toBe("VOTE");
      expect(st.stats).toMatchObject({ players: 3, ideasThisRound: 5 });
      const opts = st.options!;
      expect(opts.map((o) => o.slot)).toEqual(["A", "B", "C"]);
      expect(opts.map((o) => o.kind)).toEqual(["crowd", "crowd", "wildcard"]);
      expect(opts[0].label).toBe(`Rob the vault r${r}`);
      expect(opts[0].supporters).toBe(2);
      // Credits are read from the users table, earliest idea first.
      expect(opts[0].credit.map((c) => c.name)).toEqual([r >= 2 ? "Ava Prime" : "Ava", "Ben"]);
      expect(opts[0].more).toBe(0);
      expect(st.tally).toEqual({ [opts[0].id]: 0, [opts[1].id]: 0, [opts[2].id]: 0 });

      // BALLOT receipts: one per contributor per live option.
      await settleEffects();
      const ballots = await receiptRows(s, r, "BALLOT");
      const expected = [
        [ava.id, opts[0].id],
        [ben.id, opts[0].id],
        [cleo.id, opts[1].id],
        [ava.id, opts[2].id],
      ];
      expect(ballots.map((b) => `${b.userId}|${b.optionId}`).sort()).toEqual(expected.map((e) => e.join("|")).sort());
      expect(ballots.every((b) => b.delivered)).toBe(true);

      for (const [u, o] of [
        [ava, opts[0]],
        [ben, opts[0]],
        [cleo, opts[1]],
      ] as const) {
        expect((await vote(s, u, r, o.id)).status).toBe(200);
      }
      await settleEffects(); // flush the coalesced tally publish
      expect(rt.tallies.at(-1)).toMatchObject({ roundNo: r, total: 3, tally: { [opts[0].id]: 2, [opts[1].id]: 1, [opts[2].id]: 0 } });

      await tickToDeadline(s.roomId); // VOTE -> REVEAL
      await settleEffects();
      st = await getState(s);
      expect(st.phase).toBe("REVEAL");
      expect(st.outcome?.optionId).toBe(opts[0].id);
      expect(st.outcome?.narration).toContain(`Rob the vault r${r}`);
      expect(st.outcome?.credit.map((c) => c.name)).toEqual([r >= 2 ? "Ava Prime" : "Ava", "Ben"]);
      winners.push(opts[0].id);

      const round = await roundRow(db, s.showId, r);
      expect(round).toMatchObject({ winnerOptionId: opts[0].id, votesCount: 3, ideasCount: 5, contributorsCount: 3, fallbackUsed: false, status: "reveal" });
      const canon = await receiptRows(s, r, "CANON");
      expect(canon.map((c) => c.userId).sort()).toEqual([ava.id, ben.id].sort());
      expect(canon.every((c) => c.delivered && c.optionId === opts[0].id)).toBe(true);

      await tickToDeadline(s.roomId); // REVEAL -> PROMPT | FINALE
    }

    // The next round's prompt was generated during the previous REVEAL; round 4 never was.
    expect((await roundRow(db, s.showId, 2)).promptProvider).toBe("mock");
    expect((await roundRow(db, s.showId, 3)).promptProvider).toBe("mock");
    expect(await roundRow(db, s.showId, 4)).toBeUndefined();
    expect(ai.narrateCalls.map((n) => n.isFinalRound)).toEqual([false, false, true]);

    await settleEffects();
    const fin = await getState(s);
    expect(fin.phase).toBe("FINALE");
    expect(fin.phaseEndsAt).toBeNull();
    expect(fin.finale).toMatchObject({ storyTitle: "The Test Saga", tagline: "Written by everyone." });
    expect(fin.finale?.recap.split(" | ")).toHaveLength(3);
    expect(fin.finale?.canonMakers).toEqual(expect.arrayContaining([{ name: "Ava Prime", bot: false, count: 3 }, { name: "Ben", bot: false, count: 3 }]));
    expect(fin.storySoFar).toHaveLength(3);
    expect(ai.finaleCalls[0].winningLabels).toHaveLength(3);
    expect((await db.select().from(schema.shows).where(eq(schema.shows.id, s.showId)))[0]).toMatchObject({ status: "finale", storyTitle: "The Test Saga" });

    expect((await hostAct(s, { action: "endShow" })).body.state.phase).toBe("ENDED");
    const [show] = await db.select().from(schema.shows).where(eq(schema.shows.id, s.showId));
    expect(show.status).toBe("ended");
    expect(show.endedAt).not.toBeNull();
    expect(winners).toHaveLength(3);

    // Every transition published a strictly higher version than the last; nothing was published backwards.
    const changed = rt.states.filter((p) => p.phaseChanged).map((p) => p.state.v);
    expect(new Set(changed).size).toBe(changed.length);
    expect([...changed].sort((a, b) => a - b)).toEqual(changed);
    const all = rt.states.map((p) => p.state.v);
    expect([...all].sort((a, b) => a - b)).toEqual(all);
    expect(botCalls.starts).toHaveLength(0);
  });
});

describe("A3: manual host control", () => {
  it("runs on host actions only: REVEAL holds, pause/resume/extend/auto toggle work", async () => {
    const s = await newShow({ autoAdvance: false });
    const [ava, ben, cleo] = s.players;
    expect((await hostAct(s, { action: "start" })).body.state.phase).toBe("PROMPT");

    for (let r = 1; r <= 3; r++) {
      expect((await hostAct(s, { action: "next" })).body.state.phase).toBe("STORM");
      if (r === 1) {
        const paused = (await hostAct(s, { action: "pause" })).body.state;
        expect(paused.paused).toBe(true);
        expect(paused.phaseEndsAt).toBeNull();
        clock.set(clock.now + 60_000);
        await getState(s); // lazy advance must not move a paused room
        expect((await getState(s)).phase).toBe("STORM");
        const resumed = (await hostAct(s, { action: "resume" })).body.state;
        expect(resumed.paused).toBe(false);
        expect(resumed.phaseEndsAt).toBe(clock.now + 3000);
        const extended = (await hostAct(s, { action: "extend", ms: 10_000 })).body.state;
        expect(extended.phaseEndsAt).toBe(resumed.phaseEndsAt! + 10_000);
      }
      await stormIdeas(s, r);
      const dist = (await hostAct(s, { action: "endStorm" })).body.state;
      expect(dist.phase).toBe("DISTILL");
      await settleEffects();
      let st = await getState(s);
      expect(st.phase).toBe("VOTE");
      const opts = st.options!;
      expect((await vote(s, ava, r, opts[0].id)).status).toBe(200);
      expect((await vote(s, ben, r, opts[1].id)).status).toBe(200);
      expect((await vote(s, cleo, r, opts[1].id)).status).toBe(200);

      expect((await hostAct(s, { action: "next" })).body.state.phase).toBe("REVEAL");
      await settleEffects();
      st = await getState(s);
      expect(st.phaseEndsAt).toBeNull(); // manual mode: REVEAL waits for the host
      expect(st.outcome?.optionId).toBe(opts[1].id); // 2 votes beat 1
      clock.set(clock.now + 3_600_000);
      expect((await getState(s)).phase).toBe("REVEAL");

      if (r === 3) {
        // Turning auto-advance on in a held REVEAL starts its countdown.
        const on = (await hostAct(s, { action: "autoAdvance", on: true })).body.state;
        expect(on.phaseEndsAt).toBe(clock.now + 12000);
        expect((await db.select().from(schema.shows).where(eq(schema.shows.id, s.showId)))[0].autoAdvance).toBe(true);
        await tickToDeadline(s.roomId);
      } else {
        expect((await hostAct(s, { action: "next" })).body.state.roundNo).toBe(r + 1);
      }
    }
    await settleEffects();
    expect((await getState(s)).phase).toBe("FINALE");
    expect((await hostAct(s, { action: "endShow" })).body.state.phase).toBe("ENDED");
  });

  it("returns the host feed with names, flags and metrics (B1 surface)", async () => {
    const s = await newShow({ autoAdvance: false });
    await hostAct(s, { action: "start" });
    await hostAct(s, { action: "next" });
    await stormIdeas(s, 1);
    const feed = await call<HostFeedRes>(feedRoute, new Request("http://localhost/x", { headers: { "x-host-key": s.hostKey } }), s.code);
    expect(feed.status).toBe(200);
    expect(feed.body.ideas.map((i) => i.name)).toEqual(["Ava", "Ben", "Cleo", "Ava", "Ben"]);
    expect(feed.body.players.map((p) => [p.name, p.ideas])).toEqual([["Ava", 2], ["Ben", 2], ["Cleo", 1]]);
    expect(feed.body.metrics).toMatchObject({ connected: 3, ideasThisRound: 5, fallbackUsed: false, rerollUsed: false, autoAdvance: false, strictFilter: true, voice: false });
    expect(feed.body.links.host).toContain(`k=${s.hostKey}`);
    const denied = await call(feedRoute, new Request("http://localhost/x", { headers: { "x-host-key": "wrong" } }), s.code);
    expect(denied.status).toBe(403);
  });
});

describe("Judge Mode hooks (demo rooms)", () => {
  it("starts bots in STORM, bot votes in VOTE, boosts the judge's ideas and labels bot credits", async () => {
    const host = await makeUser(db, "Hosty");
    const judge = await makeUser(db, "Judge");
    const bot1 = await makeUser(db, "Botty", true);
    const bot2 = await makeUser(db, "Botly", true);
    const { room, show, hostKey } = await createRoom(
      { title: "Try it", preset: "heist", premise: "A vault full of rubber ducks.", roundsTotal: 3, stormMs: 3000, voteMs: 3000, autoAdvance: true, strictFilter: true },
      host,
      { isDemo: true, demoUserId: judge.id },
    );
    const s = { code: room.code, showId: show.id, roomId: room.id, hostKey, host, players: [judge, bot1, bot2] };
    for (const u of s.players) expect((await joinAs(room.code, u)).status).toBe(200);
    expect((await getState(s)).isDemo).toBe(true);

    await hostAct(s, { action: "start" });
    await tickToDeadline(room.id);
    expect(botCalls.starts).toEqual([[room.id, 1]]);
    const t = clock.now;
    await addIdea(db, show.id, 1, judge.id, "Judge idea", t + 1);
    await addIdea(db, show.id, 1, bot1.id, "Bot idea", t + 2);
    await addIdea(db, show.id, 1, bot2.id, "Bot idea", t + 3);
    await tickToDeadline(room.id);
    await settleEffects();
    expect(ai.distillCalls[0].boostUserId).toBe(judge.id);
    expect(botCalls.votes).toEqual([[room.id, 1]]);

    const st = await getState(s);
    expect(st.options![0].credit).toEqual([{ name: "Botty", bot: true }, { name: "Botly", bot: true }]);
    expect(st.options![1].credit).toEqual([{ name: "Judge", bot: false }]);
    // Bots get a database row but never a transport message.
    const ballots = await receiptRows(s, 1, "BALLOT");
    expect(ballots.map((b) => b.userId).sort()).toEqual([judge.id, bot1.id, bot2.id].sort());
    expect(rt.receipts.map((r) => r.userId)).toEqual([judge.id]);
  });
});
