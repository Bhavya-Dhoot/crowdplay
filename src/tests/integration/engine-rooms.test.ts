import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { GET as infoRoute } from "@/app/api/rooms/[code]/route";
import { POST as joinRoute } from "@/app/api/rooms/[code]/join/route";
import { POST as voteRoute } from "@/app/api/rooms/[code]/vote/route";
import { POST as createRoute } from "@/app/api/rooms/route";
import type { CreateRoomRes, RoomInfoRes } from "@/lib/api/contracts";
import { hashHostKey } from "@/lib/auth/hostKey";
import { resetConfig } from "@/lib/config";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { resetEngineSingletons, setEngineClock, settleEffects } from "@/lib/engine/advance";
import { flushDirtyPublishes, markStatsDirty, markTallyDirty } from "@/lib/engine/publish";
import { ROOM_CODE_RE } from "@/lib/ids";
import { addIdea, ai, call, clock, codes, engineRow, makeUser, roundRow, rt } from "./engine-harness";
import { getState, hostAct, installClock, joinAs, newShow, stormIdeas, tickToDeadline, vote } from "./engine-flow";

vi.mock("@/lib/realtime/index", async () => (await import("./engine-harness")).realtimeModule());
vi.mock("@/lib/ai/distill", async () => (await import("./engine-harness")).distillModule());
vi.mock("@/lib/ai/narrate", async () => (await import("./engine-harness")).narrateModule());
vi.mock("@/lib/ai/prompts", async () => (await import("./engine-harness")).promptsModule());
vi.mock("@/lib/ai/finale", async () => (await import("./engine-harness")).finaleModule());
vi.mock("@/lib/bots/runner", async () => (await import("./engine-harness")).botsModule());
vi.mock("@/lib/presets", async () => (await import("./engine-harness")).presetsModule());
vi.mock("@/lib/ids", async (orig) => {
  const actual = await orig<typeof import("@/lib/ids")>();
  const g = globalThis as unknown as { __cpTestCodes?: { queue: string[] } };
  return { ...actual, newRoomCode: () => g.__cpTestCodes?.queue.shift() ?? actual.newRoomCode() };
});

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
  codes.queue.length = 0;
  installClock();
});

const body = (over: Record<string, unknown> = {}) => ({
  title: "Heist Night",
  preset: "heist",
  premise: "A vault full of rubber ducks.",
  roundsTotal: 3,
  stormMs: 4000,
  voteMs: 6000,
  autoAdvance: true,
  strictFilter: true,
  ...over,
});

const postRoom = (user: { token: string } | null, payload: unknown) =>
  call<CreateRoomRes & { code: string; message?: string }>(
    createRoute,
    new Request("http://localhost/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", ...(user ? { cookie: `cp_session=${user.token}` } : {}) },
      body: JSON.stringify(payload),
    }),
  );

describe("room creation", () => {
  it("needs a session and a valid body", async () => {
    const host = await makeUser(db, "Hosty");
    expect((await postRoom(null, body())).status).toBe(401);
    expect((await postRoom(host, body({ roundsTotal: 1 }))).status).toBe(400);
    expect((await postRoom(host, body({ title: "x" }))).status).toBe(400);
  });

  it("creates the room, show, LOBBY engine state, channel and round-1 prompt", async () => {
    const host = await makeUser(db, "Hosty");
    const res = await postRoom(host, body({ preset: "custom", premise: "My own premise for the show." }));
    expect(res.status).toBe(200);
    const { code, hostKey, links, showId } = res.body;
    expect(code).toMatch(ROOM_CODE_RE);
    expect(hostKey).toHaveLength(32);
    expect(links).toEqual({
      join: `http://localhost:3000/join/${code}`,
      play: `http://localhost:3000/play/${code}`,
      screen: `http://localhost:3000/screen/${code}`,
      obs: `http://localhost:3000/screen/${code}?obs=1`,
      host: `http://localhost:3000/host/${code}?k=${hostKey}`,
    });
    const [room] = await db.select().from(schema.rooms).where(eq(schema.rooms.code, code));
    expect(room).toMatchObject({ channelId: `cp_${code}`, title: "Heist Night", hostUserId: host.id, isDemo: false, strictFilter: true });
    expect(room.hostKeyHash).toBe(hashHostKey(hostKey));
    expect(room.hostKeyHash).not.toContain(hostKey);
    expect(rt.channels).toEqual([`cp_${code}`]);
    const eng = await engineRow(db, room.id);
    expect(eng).toMatchObject({ phase: "LOBBY", roundNo: 0, version: 1, showId });
    expect(eng.phaseEndsAt).toBeNull();
    const [show] = await db.select().from(schema.shows).where(eq(schema.shows.id, showId));
    expect(show).toMatchObject({ premise: "My own premise for the show.", preset: "custom", roundsTotal: 3, stormMs: 4000, voteMs: 6000, promptMs: 6000, revealMs: 12000, autoAdvance: true, status: "lobby" });
    expect(await roundRow(db, showId, 1)).toMatchObject({ promptTitle: "Opening: custom", promptProvider: "preset" });
  });

  it("applies TIMING_SCALE to storm/vote (host-chosen) and the default phases", async () => {
    process.env.TIMING_SCALE = "0.5";
    resetConfig();
    try {
      const host = await makeUser(db, "Hosty");
      const res = await postRoom(host, body());
      const [show] = await db.select().from(schema.shows).where(eq(schema.shows.id, res.body.showId));
      expect(show).toMatchObject({ stormMs: 2000, voteMs: 3000, promptMs: 3000, revealMs: 6000 });
    } finally {
      delete process.env.TIMING_SCALE;
      resetConfig();
    }
  });

  it("retries when the room code is taken", async () => {
    const host = await makeUser(db, "Hosty");
    codes.queue.push("QQQQQ");
    expect((await postRoom(host, body())).body.code).toBe("QQQQQ");
    codes.queue.push("QQQQQ", "QQQQQ", "WWWWW");
    expect((await postRoom(host, body())).body.code).toBe("WWWWW");
  });
});

describe("room info and joining", () => {
  it("info 404s for unknown or malformed codes and reports player counts", async () => {
    const s = await newShow({ autoAdvance: true });
    expect((await call(infoRoute, new Request("http://localhost/x"), "ZZZZZ")).status).toBe(404);
    expect((await call(infoRoute, new Request("http://localhost/x"), "nope")).status).toBe(404);
    const ok = await call<RoomInfoRes>(infoRoute, new Request("http://localhost/x"), s.code.toLowerCase());
    expect(ok.body.room).toMatchObject({ code: s.code, players: 3, phase: "LOBBY", showId: s.showId, full: false });
  });

  it("gives clashing display names a numeric suffix", async () => {
    const s = await newShow({ autoAdvance: true, names: [], join: false });
    const [a, b, c, d] = [await makeUser(db, "Sam"), await makeUser(db, "sam"), await makeUser(db, "Sam"), await makeUser(db, "Pat")];
    const names: string[] = [];
    for (const u of [a, b, c, d]) {
      const j = await joinAs(s.code, u);
      expect(j.status).toBe(200);
      names.push(j.body.me.displayName);
    }
    expect(names).toEqual(["Sam", "sam 2", "Sam 3", "Pat"]);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, c.id));
    expect(row.displayName).toBe("Sam 3");
    // Re-joining neither renames nor counts twice.
    const again = await joinAs(s.code, c);
    expect(again.body.me.displayName).toBe("Sam 3");
    expect((await call<RoomInfoRes>(infoRoute, new Request("http://localhost/x"), s.code)).body.room.players).toBe(4);
  });

  it("answers ROOM_FULL (409) to new players over the cap but lets existing ones back in", async () => {
    process.env.ROOM_PLAYER_CAP = "2";
    resetConfig();
    try {
      const s = await newShow({ autoAdvance: true, names: ["One", "Two"] });
      const late = await makeUser(db, "Late");
      const res = await joinAs(s.code, late);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ROOM_FULL");
      expect((await call<RoomInfoRes>(infoRoute, new Request("http://localhost/x"), s.code)).body.room.full).toBe(true);
      expect((await joinAs(s.code, s.players[0])).status).toBe(200);
    } finally {
      delete process.env.ROOM_PLAYER_CAP;
      resetConfig();
    }
  });

  it("join returns the state and the player's own view; it needs a session and a real room", async () => {
    const s = await newShow({ autoAdvance: true, names: ["Ava"] });
    const [ava] = s.players;
    const j = await joinAs(s.code, ava);
    expect(j.body.state).toMatchObject({ phase: "LOBBY", roomCode: s.code, premise: "A vault full of rubber ducks.", preset: "heist", isDemo: false, title: "Heist Night" });
    expect(j.body.me).toEqual({ userId: ava.id, displayName: "Ava", vote: null, muted: false, banned: false, myOptionIds: [], ideasThisRound: 0 });
    expect((await joinAs("ZZZZZ", ava)).status).toBe(404);
    const anon = await call(joinRoute, new Request("http://localhost/x", { method: "POST" }), s.code);
    expect(anon.status).toBe(401);
  });

  it("a rejoining player gets their vote and 'yours' options back (A9)", async () => {
    const s = await newShow({ autoAdvance: true });
    const [ava, ben] = s.players;
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await stormIdeas(s, 1);
    await tickToDeadline(s.roomId);
    await settleEffects();
    const opts = (await getState(s)).options!;
    await vote(s, ben, 1, opts[1].id);
    const j = await joinAs(s.code, ava);
    expect(j.body.state.phase).toBe("VOTE");
    expect(j.body.me.ideasThisRound).toBe(2);
    expect(j.body.me.myOptionIds).toEqual([opts[0].id, opts[2].id]);
    expect((await joinAs(s.code, ben)).body.me.vote).toBe(opts[1].id);
  });
});

describe("A6: vote rules and tie-break", () => {
  it("rejects votes that break FR-18 and accepts the valid one", async () => {
    const s = await newShow({ autoAdvance: true });
    const [ava] = s.players;
    const outsider = await makeUser(db, "Outsider");
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    expect((await vote(s, ava, 1, "any")).body).toMatchObject({ ok: false, code: "NOT_VOTING" }); // STORM
    await stormIdeas(s, 1);
    await tickToDeadline(s.roomId);
    await settleEffects();
    const opts = (await getState(s)).options!;

    expect((await vote(s, outsider, 1, opts[0].id)).body.code).toBe("NOT_PARTICIPANT");
    expect((await vote(s, ava, 2, opts[0].id)).body.code).toBe("WRONG_ROUND");
    expect((await vote(s, ava, 1, "ghost")).body.code).toBe("BAD_OPTION");
    const noSession = await call(voteRoute, new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ roundNo: 1, optionId: opts[0].id }) }), s.code);
    expect(noSession.status).toBe(401);
    expect((await vote(s, ava, 1, opts[0].id)).body).toEqual({ ok: true, optionId: opts[0].id });

    const ends = (await engineRow(db, s.roomId)).phaseEndsAt!.getTime();
    clock.set(ends - 1);
    expect((await vote(s, ava, 1, opts[1].id)).status).toBe(200);
    clock.set(ends);
    const late = await vote(s, ava, 1, opts[2].id);
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("VOTE_CLOSED");
    const rows = await db.select().from(schema.votes);
    expect(rows.filter((r) => r.userId === ava.id).map((r) => r.optionId)).toEqual([opts[1].id]); // last accepted write stands
  });

  it("one vote per user; changing it moves the tally (last write wins)", async () => {
    const s = await newShow({ autoAdvance: true });
    const [ava, ben] = s.players;
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await stormIdeas(s, 1);
    await tickToDeadline(s.roomId);
    await settleEffects();
    const opts = (await getState(s)).options!;
    await vote(s, ava, 1, opts[0].id);
    await vote(s, ava, 1, opts[1].id);
    await vote(s, ava, 1, opts[1].id);
    await vote(s, ben, 1, opts[1].id);
    const rows = await db.select().from(schema.votes).where(eq(schema.votes.userId, ava.id));
    expect(rows).toHaveLength(1);
    await settleEffects();
    expect(rt.tallies.at(-1)?.tally).toEqual({ [opts[0].id]: 0, [opts[1].id]: 2, [opts[2].id]: 0 });
    expect((await getState(s)).votesTotal).toBe(2);
  });

  it("a tie goes to the option with the earliest first supporting idea, and the tie-break is logged", async () => {
    const s = await newShow({ autoAdvance: true });
    const [p0, p1, p2] = s.players;
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    const t = clock.now;
    // Alpha is the bigger cluster (slot A) but its first idea is later than Beta's.
    await addIdea(db, s.showId, 1, p0.id, "Alpha", t + 10);
    await addIdea(db, s.showId, 1, p1.id, "Alpha", t + 11);
    await addIdea(db, s.showId, 1, p2.id, "Beta", t + 1);
    await tickToDeadline(s.roomId);
    await settleEffects();
    const [A, B] = (await getState(s)).options!;
    expect([A.label, B.label]).toEqual(["Alpha", "Beta"]);
    await vote(s, p0, 1, A.id);
    await vote(s, p2, 1, B.id);
    await tickToDeadline(s.roomId);
    await settleEffects();
    expect((await getState(s)).outcome?.optionId).toBe(B.id);
    const [ev] = await db.select().from(schema.events).where(like(schema.events.id, `${s.roomId}:1:TIEBREAK`));
    expect(ev.type).toBe("tiebreak");
    expect(ev.data).toMatchObject({ winnerId: B.id, tied: [B.id, A.id] });
  });

  it("an empty ballot is decided by the same rule, preferring crowd options over narrator ones", async () => {
    const s = await newShow({ autoAdvance: true });
    const [p0] = s.players;
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await addIdea(db, s.showId, 1, p0.id, "Only idea", clock.now + 5);
    await tickToDeadline(s.roomId);
    await settleEffects();
    const opts = (await getState(s)).options!;
    expect(opts.map((o) => o.kind)).toEqual(["crowd", "narrator", "narrator"]);
    await tickToDeadline(s.roomId);
    await settleEffects();
    expect((await getState(s)).outcome?.optionId).toBe(opts[0].id);
    expect((await roundRow(db, s.showId, 1)).votesCount).toBe(0);
  });
});

describe("lazy advance", () => {
  it("GET state and the host heartbeat advance a due room, and leave a running one alone", async () => {
    const s = await newShow({ autoAdvance: true });
    await hostAct(s, { action: "start" });
    const ends = (await engineRow(db, s.roomId)).phaseEndsAt!.getTime();
    clock.set(ends - 1);
    expect((await getState(s)).phase).toBe("PROMPT");
    clock.set(ends);
    expect((await getState(s)).phase).toBe("STORM");
    const stormEnds = (await engineRow(db, s.roomId)).phaseEndsAt!.getTime();
    clock.set(stormEnds);
    const hb = await hostAct(s, { action: "heartbeat" });
    expect(hb.body.state.phase).toBe("DISTILL");
    await settleEffects();
    expect((await engineRow(db, s.roomId)).phase).toBe("VOTE");
  });
});

describe("coalesced publishes", () => {
  it("tally publishes are coalesced (many marks -> one) and spaced at least 500 ms apart", async () => {
    const s = await newShow({ autoAdvance: true });
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await stormIdeas(s, 1);
    await tickToDeadline(s.roomId);
    await settleEffects();
    rt.tallies.length = 0;

    for (let i = 0; i < 10; i++) markTallyDirty(s.roomId);
    await flushDirtyPublishes();
    expect(rt.tallies).toHaveLength(1);

    const t0 = Date.now();
    for (let i = 0; i < 10; i++) markTallyDirty(s.roomId);
    await vi.waitFor(() => expect(rt.tallies.length).toBe(2), { timeout: 2000, interval: 25 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(400);
    expect(rt.tallies[1].v).toBeGreaterThan(rt.tallies[0].v);
    await settleEffects();
    expect(rt.tallies).toHaveLength(2);
  });

  it("a tally is never published once the vote is over", async () => {
    const s = await newShow({ autoAdvance: true });
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await tickToDeadline(s.roomId);
    await settleEffects();
    await tickToDeadline(s.roomId); // REVEAL
    await settleEffects();
    rt.tallies.length = 0;
    markTallyDirty(s.roomId);
    await flushDirtyPublishes();
    expect(rt.tallies).toHaveLength(0);
  });

  it("stats publishes are coalesced, use a fresh version and are not phase changes", async () => {
    const s = await newShow({ autoAdvance: true });
    await settleEffects();
    const v0 = (await engineRow(db, s.roomId)).version;
    rt.states.length = 0;
    for (let i = 0; i < 10; i++) markStatsDirty(s.roomId);
    await flushDirtyPublishes();
    expect(rt.states).toHaveLength(1);
    expect(rt.states[0].phaseChanged).toBe(false);
    expect(rt.states[0].state.v).toBe(v0 + 1);
    expect(rt.states[0].state.stats.players).toBe(3);
  });
});
