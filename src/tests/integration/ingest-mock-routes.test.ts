import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as mockSend } from "@/app/api/mock/send/route";
import { GET as mockStream } from "@/app/api/mock/stream/route";
import { signSession } from "@/lib/auth/session";
import { resetConfig } from "@/lib/config";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { ROOM_CODE_ALPHABET } from "@/lib/ids";
import { limitCheer, resetRateLimits } from "@/lib/ingest/ratelimit";
import { getRealtimeServer } from "@/lib/realtime";
import { mockBus } from "@/lib/realtime/mock.server";
import type { PublicState } from "@/lib/realtime/types";

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
  mockBus.reset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetConfig();
});

type Room = { roomId: string; code: string; channelId: string; roundId: string; players: { id: string; token: string }[] };

async function room(players = 3, phase = "STORM"): Promise<Room> {
  const i = ++n;
  const code = Array.from({ length: 5 }, (_, k) => ROOM_CODE_ALPHABET[Math.floor(i / 24 ** k) % 24]).join("");
  const roomId = `room_${i}`;
  await db.insert(schema.users).values({ id: `u_host${i}`, displayName: "Host" });
  await db.insert(schema.rooms).values({ id: roomId, code, channelId: `cp_${code}`, title: "T", hostUserId: `u_host${i}`, hostKeyHash: "x" });
  await db.insert(schema.shows).values({ id: `show_${i}`, roomId, premise: "p", preset: "heist", roundsTotal: 3, stormMs: 30000, voteMs: 12000, promptMs: 6000, revealMs: 12000 });
  await db.insert(schema.engineState).values({ roomId, showId: `show_${i}`, roundNo: 1, phase, payload: { rerollUsed: false, distill: "idle", forcedWinnerId: null, voice: false } });
  await db.insert(schema.rounds).values({ id: `round_${i}`, showId: `show_${i}`, roundNo: 1, promptTitle: "t", promptText: "t", narratorOptions: ["a", "b", "c"] });
  const list: Room["players"] = [];
  for (let k = 0; k < players; k++) {
    const id = `u_${i}_${k}`;
    await db.insert(schema.users).values({ id, displayName: `Player${k}` });
    await db.insert(schema.participants).values({ roomId, userId: id });
    list.push({ id, token: await signSession(id) });
  }
  return { roomId, code, channelId: `cp_${code}`, roundId: `round_${i}`, players: list };
}

type Seen = { event: string; data: Record<string, unknown> };
/** A fake listener on the bus, like another player's open stream. */
function listen(channelId: string, userId: string | null) {
  const seen: Seen[] = [];
  const off = mockBus.subscribe(channelId, { userId, push: (event, data) => seen.push({ event, data: data as Record<string, unknown> }), close() {} });
  return { seen, off };
}

const ideaPayload = (over: Record<string, unknown> = {}) => ({ t: "idea", roundNo: 1, text: "Dig a tunnel under the bank", clientMsgId: `mock-${++n}-abcdef`, name: "ignored", ...over });
const send = (token: string | null, body: unknown, headers: Record<string, string> = {}) =>
  mockSend(
    new Request("http://localhost/api/mock/send", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { cookie: `cp_session=${token}` } : {}), ...headers },
      body: JSON.stringify(body),
    }),
  );
const sendIdea = (r: Room, who: number, payload: Record<string, unknown> = ideaPayload()) =>
  send(r.players[who].token, { channelId: r.channelId, objectName: "CP:Idea", payload });
const ideasIn = (r: Room) => db.select().from(schema.ideas).where(eq(schema.ideas.roundId, r.roundId));
const err = async (res: Response) => (await res.json()) as { ok: false; code: string; message: string };

describe("POST /api/mock/send", () => {
  it("answers 404 when the realtime mode is not mock", async () => {
    const r = await room(1);
    vi.stubEnv("REALTIME_MODE", "nexconn");
    resetConfig();
    const res = await sendIdea(r, 0);
    expect(res.status).toBe(404);
    expect(await ideasIn(r)).toHaveLength(0);
  });

  it("needs a session", async () => {
    const r = await room(1);
    const res = await send(null, { channelId: r.channelId, objectName: "CP:Idea", payload: ideaPayload() });
    expect(res.status).toBe(401);
  });

  it("broadcasts an idea to the other players but not back to the sender (A4)", async () => {
    const r = await room(3);
    const sender = listen(r.channelId, r.players[0].id);
    const peer = listen(r.channelId, r.players[1].id);
    const screen = listen(r.channelId, null);
    const elsewhere = listen("cp_ELSEWHERE", r.players[2].id);
    const payload = ideaPayload();
    const res = await sendIdea(r, 0, payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    for (const l of [peer, screen]) {
      const first = l.seen.find((e) => e.event === "idea");
      expect(first?.data).toEqual({ t: "idea", roundNo: 1, text: payload.text, clientMsgId: payload.clientMsgId, name: "Player0", isBot: false, userId: r.players[0].id });
    }
    expect(sender.seen.filter((e) => e.event === "idea")).toHaveLength(0);
    expect(elsewhere.seen).toHaveLength(0);
  });

  it("takes the name and bot flag from the account, not from the client", async () => {
    const r = await room(2);
    const peer = listen(r.channelId, r.players[1].id);
    await sendIdea(r, 0, ideaPayload({ name: "Admin", isBot: true }));
    expect(peer.seen[0].data).toMatchObject({ name: "Player0", isBot: false, userId: r.players[0].id });
  });

  describe("simulated provider webhook", () => {
    it("INGEST_MODE=dual ingests the idea through the webhook pipeline (source 'webhook')", async () => {
      const r = await room(2);
      expect((await sendIdea(r, 0)).status).toBe(200);
      const rows = await ideasIn(r);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ source: "webhook", userId: r.players[0].id, status: "ok" });
      expect(await db.select().from(schema.webhookEvents)).not.toHaveLength(0);
    });

    it("INGEST_MODE=webhook also ingests", async () => {
      vi.stubEnv("INGEST_MODE", "webhook");
      resetConfig();
      const r = await room(1);
      await sendIdea(r, 0);
      expect(await ideasIn(r)).toHaveLength(1);
    });

    it("INGEST_MODE=post only broadcasts: the HTTP path is the one that ingests", async () => {
      vi.stubEnv("INGEST_MODE", "post");
      resetConfig();
      const r = await room(2);
      const peer = listen(r.channelId, r.players[1].id);
      await sendIdea(r, 0);
      expect(peer.seen.filter((e) => e.event === "idea")).toHaveLength(1);
      expect(await ideasIn(r)).toHaveLength(0);
    });

    it("transport send followed by the HTTP POST of the same idea stores one row (B4 end to end)", async () => {
      const { POST: ideasPost } = await import("@/app/api/rooms/[code]/ideas/route");
      const r = await room(1);
      const payload = ideaPayload();
      await sendIdea(r, 0, payload);
      const http = await ideasPost(
        new Request(`http://localhost/api/rooms/${r.code}/ideas`, {
          method: "POST",
          headers: { cookie: `cp_session=${r.players[0].token}`, "content-type": "application/json" },
          body: JSON.stringify({ roundNo: 1, text: payload.text, clientMsgId: payload.clientMsgId }),
        }),
        { params: Promise.resolve({ code: r.code }) },
      );
      expect(http.status).toBe(200);
      expect(await http.json()).toMatchObject({ ok: true, duplicate: true });
      expect(await ideasIn(r)).toHaveLength(1);
    });

    it("a blocked idea reaches the transport first, then a moderation hide follows (C1)", async () => {
      const r = await room(2);
      const peer = listen(r.channelId, r.players[1].id);
      const payload = ideaPayload({ text: "what the fuck" });
      await sendIdea(r, 0, payload);
      expect(peer.seen.map((e) => e.event)).toEqual(["idea", "moderation"]);
      expect(peer.seen[1].data).toEqual({ t: "mod", hide: [{ userId: r.players[0].id, clientMsgId: payload.clientMsgId }] });
      const rows = await ideasIn(r);
      expect(rows.map((x) => x.status)).toEqual(["blocked"]);
    });

    it("outside STORM the idea is broadcast like the provider would, but not stored", async () => {
      const r = await room(2, "VOTE");
      await sendIdea(r, 0);
      expect(await ideasIn(r)).toHaveLength(0);
    });
  });

  describe("mute and ban", () => {
    it("a player muted on the transport cannot send, and nothing is broadcast", async () => {
      const r = await room(2);
      const peer = listen(r.channelId, r.players[1].id);
      await getRealtimeServer().moderate(r.channelId, r.players[0].id, "mute");
      const res = await sendIdea(r, 0);
      expect(res.status).toBe(403);
      expect((await err(res)).code).toBe("MUTED");
      expect(peer.seen).toHaveLength(0);
      expect(await ideasIn(r)).toHaveLength(0);
      await getRealtimeServer().moderate(r.channelId, r.players[0].id, "unmute");
      expect((await sendIdea(r, 0)).status).toBe(200);
    });

    it("a player banned on the transport cannot send", async () => {
      const r = await room(2);
      await getRealtimeServer().moderate(r.channelId, r.players[0].id, "ban");
      const res = await sendIdea(r, 0);
      expect(res.status).toBe(403);
      expect((await err(res)).code).toBe("BANNED");
      await getRealtimeServer().moderate(r.channelId, r.players[0].id, "unban");
      expect((await sendIdea(r, 0)).status).toBe(200);
    });

    it("mute/ban flags in the database count too, so a restart does not let people back in", async () => {
      const r = await room(2);
      await db.update(schema.participants).set({ muted: true }).where(eq(schema.participants.userId, r.players[0].id));
      expect((await err(await sendIdea(r, 0))).code).toBe("MUTED");
      await db.update(schema.participants).set({ banned: true }).where(eq(schema.participants.userId, r.players[1].id));
      expect((await err(await sendIdea(r, 1))).code).toBe("BANNED");
    });
  });

  describe("cheers", () => {
    const cheer = (r: Room, who: number, emoji = "🎉") => send(r.players[who].token, { channelId: r.channelId, objectName: "CP:Cheer", payload: { t: "cheer", emoji } });

    it("are broadcast to everyone else with the sender's name and never ingested", async () => {
      const r = await room(2);
      const peer = listen(r.channelId, r.players[1].id);
      const self = listen(r.channelId, r.players[0].id);
      expect((await cheer(r, 0)).status).toBe(200);
      expect(peer.seen).toEqual([{ event: "cheer", data: { t: "cheer", emoji: "🎉", name: "Player0", isBot: false, userId: r.players[0].id } }]);
      expect(self.seen).toHaveLength(0);
      expect(await ideasIn(r)).toHaveLength(0);
    });

    it("answer 403 when FEATURE_CHEERS is off", async () => {
      vi.stubEnv("FEATURE_CHEERS", "0");
      resetConfig();
      const r = await room(1);
      const res = await cheer(r, 0);
      expect(res.status).toBe(403);
      expect((await err(res)).code).toBe("CHEERS_OFF");
    });

    it("are rate limited, more loosely than ideas", async () => {
      const r = await room(2);
      for (let k = 0; k < 6; k++) expect(limitCheer(r.players[0].id).ok).toBe(true); // a burst of 6 is allowed
      const res = await cheer(r, 0);
      expect(res.status).toBe(429);
      expect(await err(res)).toMatchObject({ ok: false, code: "RATE_LIMITED" });
      expect((await cheer(r, 1)).status).toBe(200); // other players are unaffected
    });

    it("refuse an emoji that is empty or absurdly long", async () => {
      const r = await room(1);
      expect((await cheer(r, 0, "")).status).toBe(400);
      expect((await cheer(r, 0, "x".repeat(40))).status).toBe(400);
    });
  });

  it("refuses to send server-only message types and malformed requests", async () => {
    const r = await room(1);
    for (const objectName of ["CP:State", "CP:Tally", "CP:Moderation", "CP:Notice", "CP:Receipt", "RC:TxtMsg"]) {
      const res = await send(r.players[0].token, { channelId: r.channelId, objectName, payload: {} });
      expect(res.status).toBe(400);
    }
    const bad = [
      { channelId: "nope", objectName: "CP:Idea", payload: ideaPayload() },
      { channelId: r.channelId, objectName: "CP:Idea", payload: { t: "idea", roundNo: "x" } },
      { channelId: r.channelId, objectName: "CP:Idea" },
    ];
    for (const body of bad) expect((await send(r.players[0].token, body)).status).toBe(400);
    expect((await send(r.players[0].token, { channelId: "cp_ZZZZZ", objectName: "CP:Idea", payload: ideaPayload() })).status).toBe(404);
  });
});

describe("GET /api/mock/stream", () => {
  const open = (channel: string | null, headers: Record<string, string> = {}, signal?: AbortSignal) =>
    mockStream(new Request(`http://localhost/api/mock/stream${channel ? `?channel=${channel}` : ""}`, { headers, signal }));

  /** Read SSE text until `until` appears (or fail after 2 s of real time). */
  async function readUntil(res: Response, until: RegExp, acc = { text: "" }): Promise<string> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const deadline = Date.now() + 2000;
    try {
      while (!until.test(acc.text)) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${until}; got: ${JSON.stringify(acc.text)}`);
        const chunk = await Promise.race([reader.read(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("read stalled")), 1500))]);
        if (chunk.done) break;
        acc.text += decoder.decode(chunk.value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }
    return acc.text;
  }

  const state = (v: number): PublicState =>
    ({ v, roomCode: "ABCDE", showId: "s", phase: "STORM", roundNo: 1, roundsTotal: 3, phaseStartedAt: 0, phaseEndsAt: null, serverNow: 0, paused: false, title: "T", premise: "p", preset: "heist", isDemo: false, stats: { players: 0, ideasThisRound: 0, ideasTotal: 0, canonMakers: 0 }, storySoFar: [] });

  it("answers 404 when the realtime mode is not mock", async () => {
    vi.stubEnv("REALTIME_MODE", "nexconn");
    resetConfig();
    expect((await open("cp_ABCDE")).status).toBe(404);
  });

  it("answers 400 for a missing or malformed channel", async () => {
    expect((await open(null)).status).toBe(400);
    expect((await open("ABCDE")).status).toBe(400);
    expect((await open("cp_abcde")).status).toBe(400);
    expect((await open("cp_ABCDEF")).status).toBe(400);
  });

  it("opens an event stream and delivers published state in SSE framing", async () => {
    const ac = new AbortController();
    const res = await open("cp_ABCDE", {}, ac.signal);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(res.headers.get("cache-control")).toMatch(/no-cache/);
    const acc = { text: "" };
    await readUntil(res, /connected/, acc); // the opening comment flushes the headers
    await getRealtimeServer().publishState("cp_ABCDE", state(7), { phaseChanged: true });
    const text = await readUntil(res, /event: state\ndata: .*\n\n/, acc);
    const frame = /event: state\ndata: (.*)\n\n/.exec(text)!;
    expect(JSON.parse(frame[1])).toMatchObject({ v: 7, phase: "STORM" });
    ac.abort();
  });

  it("only carries its own channel, and the other server events in the same framing", async () => {
    const ac = new AbortController();
    const res = await open("cp_ABCDE", {}, ac.signal);
    const acc = { text: "" };
    await readUntil(res, /connected/, acc);
    const server = getRealtimeServer();
    await server.publishState("cp_OTHER", state(1), { phaseChanged: true });
    await server.publishTally("cp_ABCDE", 8, 1, { o1: 2 }, 2);
    await server.sendRoomMessage("cp_ABCDE", "u_bot", { t: "notice", text: "Hello room" });
    const text = await readUntil(res, /event: notice\ndata: .*\n\n/, acc);
    expect(text).not.toMatch(/event: state/);
    expect(text).toMatch(/event: tally\ndata: \{"t":"tally","v":8,"roundNo":1,"tally":\{"o1":2\},"total":2\}\n\n/);
    expect(text).toMatch(/event: notice\ndata: \{"t":"notice","text":"Hello room"\}\n\n/);
    ac.abort();
  });

  it("delivers a receipt to the stream of the session user only; the user id is never read from the query", async () => {
    const a = await signSession("u_receipt_a");
    const ac = new AbortController();
    const mine = await open("cp_ABCDE", { cookie: `cp_session=${a}` }, ac.signal);
    const anon = await mockStream(new Request("http://localhost/api/mock/stream?channel=cp_ABCDE&user=u_receipt_a", { signal: ac.signal }));
    const accMine = { text: "" };
    const accAnon = { text: "" };
    await readUntil(mine, /connected/, accMine);
    await readUntil(anon, /connected/, accAnon);

    const receipt = { t: "receipt" as const, type: "CANON" as const, showId: "s", roundNo: 2, optionId: "o", optionLabel: "Dig", ideaText: "Dig a tunnel" };
    expect(await getRealtimeServer().sendReceipt("u_receipt_a", receipt)).toBe(true);
    const text = await readUntil(mine, /event: receipt\ndata: .*\n\n/, accMine);
    expect(JSON.parse(/event: receipt\ndata: (.*)\n\n/.exec(text)![1])).toEqual(receipt);
    // The anonymous stream that merely *claimed* the user in its query string got nothing.
    expect(accAnon.text).not.toMatch(/receipt/);
    // And a user with no open stream is reported as not delivered.
    expect(await getRealtimeServer().sendReceipt("u_nobody", receipt)).toBe(false);
    ac.abort();
  });

  it("works with the x-cp-session header when cookies are blocked", async () => {
    const token = await signSession("u_header_user");
    const ac = new AbortController();
    const res = await open("cp_ABCDE", { "x-cp-session": token }, ac.signal);
    await readUntil(res, /connected/);
    expect(await getRealtimeServer().countParticipants("cp_ABCDE")).toBe(1);
    ac.abort();
  });

  it("counts distinct users, not streams, and stops counting after the client goes away", async () => {
    const t1 = await signSession("u_count_1");
    const t2 = await signSession("u_count_2");
    const acs = [new AbortController(), new AbortController(), new AbortController(), new AbortController()];
    const streams = [
      await open("cp_ABCDE", { cookie: `cp_session=${t1}` }, acs[0].signal),
      await open("cp_ABCDE", { cookie: `cp_session=${t1}` }, acs[1].signal), // same user, second tab
      await open("cp_ABCDE", { cookie: `cp_session=${t2}` }, acs[2].signal),
      await open("cp_ABCDE", {}, acs[3].signal), // /screen: anonymous, not a player
    ];
    for (const s of streams) await readUntil(s, /connected/);
    const server = getRealtimeServer();
    expect(await server.countParticipants("cp_ABCDE")).toBe(2);
    acs[0].abort();
    expect(await server.countParticipants("cp_ABCDE")).toBe(2); // second tab keeps u_count_1
    acs[1].abort();
    expect(await server.countParticipants("cp_ABCDE")).toBe(1);
    acs[2].abort();
    acs[3].abort();
    expect(await server.countParticipants("cp_ABCDE")).toBe(0);
    // Publishing to a channel whose listeners all left is harmless.
    await expect(server.publishState("cp_ABCDE", state(9), { phaseChanged: false })).resolves.toBeUndefined();
  });

  it("sends a heartbeat comment every 15 s", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const ac = new AbortController();
    const res = await open("cp_ABCDE", {}, ac.signal);
    const acc = { text: "" };
    await readUntil(res, /connected/, acc);
    expect(acc.text).not.toMatch(/: hb/);
    await vi.advanceTimersByTimeAsync(14_999);
    const before = acc.text;
    await vi.advanceTimersByTimeAsync(1);
    const text = await readUntil(res, /: hb\n\n/, acc);
    expect(text.length).toBeGreaterThan(before.length);
    ac.abort();
  });

  it("closes the stream when the channel is destroyed", async () => {
    const res = await open("cp_ABCDE");
    await readUntil(res, /connected/);
    await getRealtimeServer().destroyChannel("cp_ABCDE");
    const reader = res.body!.getReader();
    const next = await Promise.race([reader.read(), new Promise<{ done: false }>((r) => setTimeout(() => r({ done: false }), 1500))]);
    expect(next.done).toBe(true);
  });
});
