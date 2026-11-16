import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as healthGet } from "@/app/api/health/route";
import { GET as meGet } from "@/app/api/me/route";
import { POST as ideasPost } from "@/app/api/rooms/[code]/ideas/route";
import { DELETE as sessionDelete, POST as sessionPost } from "@/app/api/session/route";
import { GET as timeGet } from "@/app/api/time/route";
import { signSession } from "@/lib/auth/session";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { ROOM_CODE_ALPHABET } from "@/lib/ids";
import { markStatsDirty, markTallyDirty } from "@/lib/engine/publish";
import { limitIdea, resetRateLimits } from "@/lib/ingest/ratelimit";
import { getRealtimeServer } from "@/lib/realtime";

vi.mock("@/lib/engine/publish", () => ({ markStatsDirty: vi.fn(), markTallyDirty: vi.fn(), buildPublicState: vi.fn() }));
vi.mock("@/lib/ai/embed", () => ({ queueEmbedding: vi.fn() }));

let db: Db;
let close: () => Promise<void>;
let n = 0;

beforeAll(async () => {
  ({ db, close } = await useTestDb());
});
afterAll(() => close());
beforeEach(() => {
  resetRateLimits();
  vi.mocked(markStatsDirty).mockClear();
  vi.mocked(markTallyDirty).mockClear();
});

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const get = (url: string, headers: Record<string, string> = {}) => new Request(`http://localhost${url}`, { headers });
type SessionJson = {
  ok: true;
  user: { id: string; displayName: string };
  sessionToken: string;
  realtime: { mode: string; ingest: string; token?: string };
  features: Record<string, boolean>;
};
type MeJson = {
  ok: true;
  user: { id: string; displayName: string };
  receipts: { id: string; type: string; showId: string; showTitle: string; roundNo: number; optionLabel: string; ideaText: string; createdAt: number }[];
  stats: { ideas: number; ballots: number; canon: number; shows: number };
};
type ErrJson = { ok: false; code: string; message: string; retryInMs?: number };
const json = async <T = Record<string, unknown>>(res: Response): Promise<T> => (await res.json()) as T;
const cookieOf = (res: Response) => /cp_session=([^;]*)/.exec(res.headers.get("set-cookie") ?? "")?.[1];

async function signIn(displayName = "Brave Otter") {
  const res = await sessionPost(post("/api/session", { displayName }));
  const body = await json<SessionJson>(res);
  return { res, body, token: body.sessionToken, id: body.user.id };
}

describe("POST /api/session", () => {
  it("creates a guest, sets the cookie and returns the realtime handshake", async () => {
    const { res, body, token } = await signIn("  Brave   Otter ");
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      user: { displayName: "Brave Otter" },
      realtime: { mode: "mock", ingest: "dual" },
      features: { cheers: true, tts: false, multilingual: false },
    });
    expect(body.user.id).toMatch(/^u_[0-9a-z]{16}$/);
    expect(typeof body.realtime.token).toBe("string");
    expect(body.realtime.token?.length ?? 0).toBeGreaterThan(8);
    expect(typeof token).toBe("string");

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookieOf(res)).toBe(token);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2592000/);

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, body.user.id));
    expect(row).toMatchObject({ displayName: "Brave Otter", isBot: false, deletedAt: null });
  });

  it("the cookie authenticates the next request", async () => {
    const { token, id } = await signIn("Cookie Kid");
    const me = await json<MeJson>(await meGet(get("/api/me", { cookie: `cp_session=${token}` })));
    expect(me).toMatchObject({ ok: true, user: { id, displayName: "Cookie Kid" } });
  });

  it("the x-cp-session header works when cookies are blocked", async () => {
    const { token, id } = await signIn("Header Kid");
    const me = await json<MeJson>(await meGet(get("/api/me", { "x-cp-session": token })));
    expect(me).toMatchObject({ ok: true, user: { id } });
  });

  it("requests without a valid session get 401 NO_SESSION", async () => {
    const none = await meGet(get("/api/me"));
    expect(none.status).toBe(401);
    expect(await json(none)).toMatchObject({ ok: false, code: "NO_SESSION" });
    const forged = await meGet(get("/api/me", { "x-cp-session": "not.a.jwt" }));
    expect(forged.status).toBe(401);
  });

  it("rejects a blocked name and creates nothing", async () => {
    const before = (await db.select().from(schema.users)).length;
    for (const displayName of ["shithead", "sh1thead", "visit.me.com", "9876543210", "damn"]) {
      const res = await sessionPost(post("/api/session", { displayName }));
      expect(res.status).toBe(400);
      expect(await json(res)).toMatchObject({ ok: false, code: "NAME_BLOCKED" });
      expect(res.headers.get("set-cookie")).toBeNull();
    }
    expect((await db.select().from(schema.users)).length).toBe(before);
  });

  it("rejects names that are too short, too long or missing", async () => {
    for (const displayName of ["a", "x".repeat(21), ""]) {
      const res = await sessionPost(post("/api/session", { displayName }));
      expect(res.status).toBe(400);
      expect(await json(res)).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    }
    expect((await sessionPost(post("/api/session", {}))).status).toBe(400);
    expect((await sessionPost(new Request("http://localhost/api/session", { method: "POST", body: "not json" }))).status).toBe(400);
  });

  it("reuses the signed-in user and updates the name instead of creating a second account", async () => {
    const first = await signIn("First Name");
    const again = await sessionPost(post("/api/session", { displayName: "Second Name" }, { cookie: `cp_session=${first.token}` }));
    const body = await json<SessionJson>(again);
    expect(body.user).toEqual({ id: first.id, displayName: "Second Name" });
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, first.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Second Name");
    // Also through the header fallback.
    const viaHeader = await json<SessionJson>(await sessionPost(post("/api/session", { displayName: "Third Name" }, { "x-cp-session": first.token })));
    expect(viaHeader.user.id).toBe(first.id);
  });

  it("a deleted account's old cookie starts a brand new guest", async () => {
    const first = await signIn("Soon Gone");
    await sessionDelete(new Request("http://localhost/api/session", { method: "DELETE", headers: { cookie: `cp_session=${first.token}` } }));
    const next = await json<SessionJson>(await sessionPost(post("/api/session", { displayName: "Fresh Start" }, { cookie: `cp_session=${first.token}` })));
    expect(next.user.id).not.toBe(first.id);
  });

  it("still succeeds without a realtime token when the provider errors", async () => {
    const spy = vi.spyOn(getRealtimeServer(), "ensureUser").mockRejectedValueOnce(new Error("provider down"));
    const { res, body } = await signIn("Offline Owl");
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(body.realtime.token).toBeUndefined();
    expect(body.realtime.mode).toBe("mock");
    expect(cookieOf(res)).toBeTruthy();
  });

  it("still succeeds when the provider hangs (3 s timeout)", async () => {
    const spy = vi.spyOn(getRealtimeServer(), "ensureUser").mockImplementationOnce(() => new Promise(() => {}));
    const started = Date.now();
    const { res, body } = await signIn("Slow Sloth");
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(body.realtime.token).toBeUndefined();
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900);
    expect(Date.now() - started).toBeLessThan(6000);
  });
});

/** A finished round with options, ballots and a canon winner, so DELETE and /api/me have rows to work on. */
async function seedShow() {
  const i = ++n;
  const code = Array.from({ length: 5 }, (_, k) => ROOM_CODE_ALPHABET[Math.floor(i / 24 ** k) % 24]).join("");
  const host = `u_host${i}`;
  await db.insert(schema.users).values({ id: host, displayName: "Host" });
  await db.insert(schema.rooms).values({ id: `room_${i}`, code, channelId: `cp_${code}`, title: `Show ${i}`, hostUserId: host, hostKeyHash: "x" });
  await db.insert(schema.shows).values({ id: `show_${i}`, roomId: `room_${i}`, premise: "p", preset: "heist", roundsTotal: 3, stormMs: 30000, voteMs: 12000, promptMs: 6000, revealMs: 12000 });
  await db.insert(schema.engineState).values({ roomId: `room_${i}`, showId: `show_${i}`, roundNo: 1, phase: "STORM", payload: { rerollUsed: false, distill: "idle", forcedWinnerId: null, voice: false } });
  const rounds: string[] = [];
  for (const no of [1, 2]) {
    const id = `round_${i}_${no}`;
    rounds.push(id);
    await db.insert(schema.rounds).values({ id, showId: `show_${i}`, roundNo: no, promptTitle: "t", promptText: "t", narratorOptions: ["a", "b", "c"] });
    await db.insert(schema.options).values({ id: `opt_${i}_${no}`, roundId: id, slot: "A", kind: "crowd", label: `Option for round ${no}`, sourceIdeaIds: [], rank: 1 });
  }
  return { i, code, roomId: `room_${i}`, showId: `show_${i}`, rounds };
}

async function seedPlayer(s: Awaited<ReturnType<typeof seedShow>>, name: string) {
  const id = `u_${s.i}_${name.toLowerCase().replace(/\W/g, "")}`;
  await db.insert(schema.users).values({ id, displayName: name });
  await db.insert(schema.participants).values({ roomId: s.roomId, userId: id });
  const ideaIds: string[] = [];
  for (const [k, roundId] of s.rounds.entries()) {
    const ideaId = `idea_${id}_${k}`;
    ideaIds.push(ideaId);
    await db.insert(schema.ideas).values({ id: ideaId, roundId, userId: id, text: `${name}'s idea ${k + 1}`, clientMsgId: `client-${id}-${k}`, source: "post" });
    await db.insert(schema.votes).values({ roundId, userId: id, optionId: `opt_${s.i}_${k + 1}` });
  }
  const t0 = Date.now();
  await db.insert(schema.receipts).values([
    { id: `rc_${id}_1`, userId: id, showId: s.showId, roundId: s.rounds[0], type: "BALLOT", optionId: `opt_${s.i}_1`, ideaId: ideaIds[0], createdAt: new Date(t0 - 5000) },
    { id: `rc_${id}_2`, userId: id, showId: s.showId, roundId: s.rounds[0], type: "CANON", optionId: `opt_${s.i}_1`, ideaId: ideaIds[0], createdAt: new Date(t0) },
  ]);
  return { id, token: await signSession(id), ideaIds };
}

describe("GET /api/me", () => {
  it("returns my receipts newest first with show title, round, option label and idea text, plus stats", async () => {
    const s = await seedShow();
    const me = await seedPlayer(s, "Maya");
    const other = await seedPlayer(s, "Omar");
    const res = await json<MeJson>(await meGet(get("/api/me", { cookie: `cp_session=${me.token}` })));
    expect(res.ok).toBe(true);
    expect(res.user).toEqual({ id: me.id, displayName: "Maya" });
    expect(res.receipts).toHaveLength(2);
    expect(res.receipts[0]).toMatchObject({
      id: `rc_${me.id}_2`, type: "CANON", showId: s.showId, showTitle: `Show ${s.i}`, roundNo: 1, optionLabel: "Option for round 1", ideaText: "Maya's idea 1",
    });
    expect(typeof res.receipts[0].createdAt).toBe("number");
    expect(res.receipts[1].type).toBe("BALLOT");
    expect(res.receipts.every((r) => !r.id.includes(other.id))).toBe(true);
    expect(res.stats).toEqual({ ideas: 2, ballots: 1, canon: 1, shows: 1 });
  });

  it("counts a show once however many rounds took part, and zero for a newcomer", async () => {
    const fresh = await signIn("Newcomer");
    const res = await json<MeJson>(await meGet(get("/api/me", { "x-cp-session": fresh.token })));
    expect(res.receipts).toEqual([]);
    expect(res.stats).toEqual({ ideas: 0, ballots: 0, canon: 0, shows: 0 });
  });

  it("does not count blocked or deleted ideas", async () => {
    const s = await seedShow();
    const me = await seedPlayer(s, "Nina");
    await db.update(schema.ideas).set({ status: "blocked" }).where(eq(schema.ideas.id, me.ideaIds[0]));
    const res = await json<MeJson>(await meGet(get("/api/me", { "x-cp-session": me.token })));
    expect(res.stats.ideas).toBe(1);
  });
});

describe("DELETE /api/session (delete my data)", () => {
  it("removes receipts, votes and participation, blanks ideas, anonymises the account and clears the cookie", async () => {
    const s = await seedShow();
    const me = await seedPlayer(s, "Leaver");
    const other = await seedPlayer(s, "Stayer");

    const res = await sessionDelete(new Request("http://localhost/api/session", { method: "DELETE", headers: { cookie: `cp_session=${me.token}` } }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
    expect(res.headers.get("set-cookie")).toMatch(/cp_session=;.*Max-Age=0/);

    expect(await db.select().from(schema.receipts).where(eq(schema.receipts.userId, me.id))).toHaveLength(0);
    expect(await db.select().from(schema.votes).where(eq(schema.votes.userId, me.id))).toHaveLength(0);
    expect(await db.select().from(schema.participants).where(eq(schema.participants.userId, me.id))).toHaveLength(0);
    const ideas = await db.select().from(schema.ideas).where(eq(schema.ideas.userId, me.id));
    expect(ideas).toHaveLength(2);
    expect(ideas.every((r) => r.status === "deleted" && r.text === "")).toBe(true);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, me.id));
    expect(user.displayName).toBe("Former player");
    expect(user.deletedAt).toBeInstanceOf(Date);

    // Everyone else is untouched.
    expect(await db.select().from(schema.receipts).where(eq(schema.receipts.userId, other.id))).toHaveLength(2);
    expect(await db.select().from(schema.votes).where(eq(schema.votes.userId, other.id))).toHaveLength(2);
    expect(await db.select().from(schema.participants).where(eq(schema.participants.userId, other.id))).toHaveLength(1);
    const [stayer] = await db.select().from(schema.ideas).where(and(eq(schema.ideas.userId, other.id), eq(schema.ideas.id, other.ideaIds[0])));
    expect(stayer).toMatchObject({ status: "ok", text: "Stayer's idea 1" });

    // Live rooms recompute their tallies and idea counts.
    expect(markTallyDirty).toHaveBeenCalledWith(s.roomId);
    expect(markStatsDirty).toHaveBeenCalledWith(s.roomId);

    // The old token no longer works.
    expect((await meGet(get("/api/me", { cookie: `cp_session=${me.token}` }))).status).toBe(401);
  });

  it("needs a session", async () => {
    const res = await sessionDelete(new Request("http://localhost/api/session", { method: "DELETE" }));
    expect(res.status).toBe(401);
  });

  it("works for a player who never joined a room", async () => {
    const guest = await signIn("Just Browsing");
    const res = await sessionDelete(new Request("http://localhost/api/session", { method: "DELETE", headers: { "x-cp-session": guest.token } }));
    expect(res.status).toBe(200);
    expect(markTallyDirty).not.toHaveBeenCalled();
  });
});

describe("POST /api/rooms/:code/ideas", () => {
  async function stormRoom(phase = "STORM", players = 1) {
    const s = await seedShow();
    await db.update(schema.engineState).set({ phase }).where(eq(schema.engineState.roomId, s.roomId));
    const tokens: string[] = [];
    for (let k = 0; k < players; k++) {
      const id = `u_${s.i}_p${k}`;
      await db.insert(schema.users).values({ id, displayName: `Player ${k}` });
      await db.insert(schema.participants).values({ roomId: s.roomId, userId: id });
      tokens.push(await signSession(id));
    }
    return { ...s, tokens };
  }
  const send = (code: string, token: string, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    ideasPost(post(`/api/rooms/${code}/ideas`, body, { cookie: `cp_session=${token}`, ...headers }), { params: Promise.resolve({ code }) });
  const idea = (over: Record<string, unknown> = {}) => ({ roundNo: 1, text: "Dig a tunnel under the bank", clientMsgId: `http-${++n}-abcdef`, ...over });

  it("accepts an idea: 200 {ok, ideaId, duplicate:false}; a redelivery is 200 duplicate:true", async () => {
    const r = await stormRoom();
    const body = idea();
    const res = await send(r.code, r.tokens[0], body);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ ok: true, duplicate: false, ideaId: expect.any(String) });
    const again = await send(r.code, r.tokens[0], body);
    expect(again.status).toBe(200);
    expect(await json(again)).toMatchObject({ ok: true, duplicate: true });
    expect(await db.select().from(schema.ideas).where(eq(schema.ideas.roundId, r.rounds[0]))).toHaveLength(1);
  });

  it("accepts a lower-case room code with spaces, as people type it", async () => {
    const r = await stormRoom();
    const res = await send(r.code.toLowerCase().split("").join(" "), r.tokens[0], idea());
    expect(res.status).toBe(200);
  });

  it("answers 429 with retryInMs and Retry-After when someone sends too fast", async () => {
    const r = await stormRoom();
    await send(r.code, r.tokens[0], idea());
    const res = await send(r.code, r.tokens[0], idea());
    expect(res.status).toBe(429);
    const body = await json<ErrJson>(res);
    expect(body).toMatchObject({ ok: false, code: "RATE_LIMITED", message: expect.any(String) });
    expect(body.retryInMs ?? 0).toBeGreaterThan(0);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });

  it("uses the forwarded client IP for the per-IP bucket", async () => {
    const r = await stormRoom("STORM", 2);
    // A crowd on one address has used up its allowance...
    for (let k = 0; k < 40; k++) limitIdea(`u_crowd${k}`, "198.51.100.9");
    // ...so a new player behind that address is refused, though their own bucket is full.
    const throttled = await send(r.code, r.tokens[0], idea(), { "x-forwarded-for": "198.51.100.9, 10.0.0.1" });
    expect(throttled.status).toBe(429);
    expect((await json<ErrJson>(throttled)).code).toBe("RATE_LIMITED");
    // The same player on another address is fine (and the refusal above did not spend their token).
    expect((await send(r.code, r.tokens[0], idea(), { "x-forwarded-for": "198.51.100.10" })).status).toBe(200);
  });

  it.each([
    ["VOTE", {}, 409, "NOT_STORM"],
    ["STORM", { roundNo: 2 }, 409, "WRONG_ROUND"],
    ["STORM", { text: "   " }, 400, "EMPTY"],
    ["STORM", { text: "x ".repeat(100) }, 400, "TOO_LONG"],
    ["STORM", { text: "what the fuck" }, 422, "BLOCKED"],
  ])("%s %j -> %i %s", async (phase, over, status, code) => {
    const r = await stormRoom(phase);
    const res = await send(r.code, r.tokens[0], idea(over));
    expect(res.status).toBe(status);
    expect(await json(res)).toMatchObject({ ok: false, code });
  });

  it("muted and banned players get 403", async () => {
    const r = await stormRoom("STORM", 2);
    await db.update(schema.participants).set({ muted: true }).where(eq(schema.participants.userId, `u_${r.i}_p0`));
    await db.update(schema.participants).set({ banned: true }).where(eq(schema.participants.userId, `u_${r.i}_p1`));
    const muted = await send(r.code, r.tokens[0], idea());
    const banned = await send(r.code, r.tokens[1], idea());
    expect([muted.status, banned.status]).toEqual([403, 403]);
    expect((await json<ErrJson>(muted)).code).toBe("MUTED");
    expect((await json<ErrJson>(banned)).code).toBe("BANNED");
  });

  it("needs a session, a real room and a valid body", async () => {
    const r = await stormRoom();
    const noSession = await ideasPost(post(`/api/rooms/${r.code}/ideas`, idea()), { params: Promise.resolve({ code: r.code }) });
    expect(noSession.status).toBe(401);
    expect((await send("ZZZZZ", r.tokens[0], idea())).status).toBe(404);
    expect((await send("12", r.tokens[0], idea())).status).toBe(404);
    expect((await send(r.code, r.tokens[0], { roundNo: 0, text: "hi there", clientMsgId: "abcdefgh" })).status).toBe(400);
    expect((await send(r.code, r.tokens[0], { roundNo: 1, text: "hi there", clientMsgId: "short" })).status).toBe(400);
    expect((await send(r.code, r.tokens[0], { roundNo: 1, clientMsgId: "abcdefgh1" })).status).toBe(400);
  });
});

describe("GET /api/time and /api/health", () => {
  it("time returns server now, uncached", async () => {
    const before = Date.now();
    const res = await timeGet();
    const body = await json<{ now: number }>(res);
    expect(body.now).toBeGreaterThanOrEqual(before);
    expect(body.now).toBeLessThanOrEqual(Date.now());
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("health reports modes, the database kind and the package version", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string };
    expect(await json(res)).toEqual({ ok: true, realtimeMode: "mock", llmMode: "mock", db: "pglite", version: pkg.version });
  });

  it("health answers 503 when the database probe fails", async () => {
    const spy = vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("connection refused"));
    const res = await healthGet();
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect((await json<{ ok: boolean }>(res)).ok).toBe(false);
  });
});
