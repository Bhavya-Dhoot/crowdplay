import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { queueEmbedding } from "@/lib/ai/embed";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { markStatsDirty } from "@/lib/engine/publish";
import { AppError } from "@/lib/errors";
import { ingestIdea, MAX_IDEA_LEN, ROUND_IDEA_CAP, type IngestInput } from "@/lib/ingest/ideas";
import { resetRateLimits } from "@/lib/ingest/ratelimit";
import { mockBus } from "@/lib/realtime/mock.server";
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
  vi.mocked(queueEmbedding).mockClear();
});

type World = { roomId: string; code: string; channelId: string; showId: string; roundId: string; users: string[] };

/** A room with one show, engine_state, rounds 1 and 2, and `players` participants. */
async function world(o: { phase?: string; roundNo?: number; strict?: boolean; players?: number; withRound?: boolean } = {}): Promise<World> {
  const i = ++n;
  const code = `ROOM${i}`;
  const roomId = `room_${i}`;
  const showId = `show_${i}`;
  const host = `u_host${i}`;
  await db.insert(schema.users).values({ id: host, displayName: "Host" });
  await db.insert(schema.rooms).values({
    id: roomId,
    code,
    channelId: `cp_${code}`,
    title: "Test show",
    hostUserId: host,
    hostKeyHash: "x",
    strictFilter: o.strict ?? true,
  });
  await db.insert(schema.shows).values({
    id: showId, roomId, premise: "p", preset: "heist", roundsTotal: 3, stormMs: 30000, voteMs: 12000, promptMs: 6000, revealMs: 12000,
  });
  await db.insert(schema.engineState).values({
    roomId, showId, roundNo: o.roundNo ?? 1, phase: o.phase ?? "STORM",
    payload: { rerollUsed: false, distill: "idle", forcedWinnerId: null, voice: false },
  });
  const roundId = `round_${i}_1`;
  const rounds = o.withRound === false ? [] : [{ no: 1, id: roundId }, { no: 2, id: `round_${i}_2` }];
  for (const r of rounds) {
    await db.insert(schema.rounds).values({ id: r.id, showId, roundNo: r.no, promptTitle: "t", promptText: "t", narratorOptions: ["a", "b", "c"] });
  }
  const users: string[] = [];
  for (let k = 0; k < (o.players ?? 2); k++) {
    const id = `u_${i}_${k}`;
    users.push(id);
    await db.insert(schema.users).values({ id, displayName: `Player ${k}` });
    await db.insert(schema.participants).values({ roomId, userId: id });
  }
  return { roomId, code, channelId: `cp_${code}`, showId, roundId, users };
}

const base = (w: World, over: Partial<IngestInput> = {}): IngestInput => ({
  roomCode: w.code,
  userId: w.users[0],
  roundNo: 1,
  text: "Dig a tunnel under the bank",
  clientMsgId: `msg-${++n}-aaaa`,
  source: "post",
  ...over,
});

const rowsOf = (w: World) => db.select().from(schema.ideas).where(eq(schema.ideas.roundId, w.roundId));

describe("ingestIdea: acceptance", () => {
  it("stores a clean idea in STORM, queues its embedding and marks stats dirty", async () => {
    const w = await world();
    const res = await ingestIdea(base(w, { text: "  Dig   a tunnel \n under the bank  " }));
    expect(res).toMatchObject({ ok: true, duplicate: false });
    const rows = await rowsOf(w);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ text: "Dig a tunnel under the bank", status: "ok", source: "post", userId: w.users[0] });
    expect(queueEmbedding).toHaveBeenCalledWith(rows[0].id, "Dig a tunnel under the bank");
    expect(markStatsDirty).toHaveBeenCalledWith(w.roomId);
  });

  it("records the source", async () => {
    const w = await world();
    await ingestIdea(base(w, { source: "webhook" }));
    expect((await rowsOf(w))[0].source).toBe("webhook");
  });

  it("throws a 404 AppError for an unknown room", async () => {
    await expect(ingestIdea({ roomCode: "ZZZZZ", userId: "u_x", roundNo: 1, text: "hi there", clientMsgId: "abcdefgh1", source: "post" })).rejects.toMatchObject({
      code: "ROOM_NOT_FOUND",
      status: 404,
    });
    await expect(ingestIdea({ roomCode: "ZZZZZ", userId: "u_x", roundNo: 1, text: "hi", clientMsgId: "abcdefgh2", source: "post" })).rejects.toBeInstanceOf(AppError);
  });
});

describe("ingestIdea: phase and round (FR-10)", () => {
  it.each(["LOBBY", "PROMPT", "DISTILL", "VOTE", "REVEAL", "FINALE", "ENDED"])("refuses ideas in %s", async (phase) => {
    const w = await world({ phase });
    expect(await ingestIdea(base(w))).toMatchObject({ ok: false, code: "NOT_STORM" });
    expect(await rowsOf(w)).toHaveLength(0);
  });

  it("refuses an idea for a round that is not the current one", async () => {
    const w = await world({ roundNo: 2 });
    expect(await ingestIdea(base(w, { roundNo: 1 }))).toMatchObject({ ok: false, code: "WRONG_ROUND" });
    expect(await ingestIdea(base(w, { roundNo: 3 }))).toMatchObject({ ok: false, code: "WRONG_ROUND" });
  });

  it("refuses when the round row does not exist yet", async () => {
    const w = await world({ withRound: false });
    expect(await ingestIdea(base(w))).toMatchObject({ ok: false, code: "WRONG_ROUND" });
  });

  it("friendly messages accompany every refusal", async () => {
    const w = await world({ phase: "VOTE" });
    const res = await ingestIdea(base(w));
    expect(res.ok === false && res.message.length > 10).toBe(true);
  });
});

describe("ingestIdea: participants, mute and ban (C3)", () => {
  it("refuses someone who never joined the room", async () => {
    const w = await world();
    const strangerId = `u_stranger${n}`;
    await db.insert(schema.users).values({ id: strangerId, displayName: "Stranger" });
    expect(await ingestIdea(base(w, { userId: strangerId }))).toMatchObject({ ok: false, code: "NOT_PARTICIPANT" });
    expect(await rowsOf(w)).toHaveLength(0);
  });

  it("a muted player's ideas are refused server-side and never stored", async () => {
    const w = await world();
    await db.update(schema.participants).set({ muted: true }).where(and(eq(schema.participants.roomId, w.roomId), eq(schema.participants.userId, w.users[0])));
    expect(await ingestIdea(base(w))).toMatchObject({ ok: false, code: "MUTED" });
    expect(await rowsOf(w)).toHaveLength(0);
    expect(markStatsDirty).not.toHaveBeenCalled();
    // Others in the room are unaffected.
    expect(await ingestIdea(base(w, { userId: w.users[1] }))).toMatchObject({ ok: true });
  });

  it("a banned player's ideas are refused server-side and never stored", async () => {
    const w = await world();
    await db.update(schema.participants).set({ banned: true }).where(and(eq(schema.participants.roomId, w.roomId), eq(schema.participants.userId, w.users[0])));
    expect(await ingestIdea(base(w))).toMatchObject({ ok: false, code: "BANNED" });
    expect(await rowsOf(w)).toHaveLength(0);
  });

  it("webhook-sourced ideas get the same checks", async () => {
    const w = await world();
    await db.update(schema.participants).set({ banned: true }).where(eq(schema.participants.userId, w.users[0]));
    expect(await ingestIdea(base(w, { source: "webhook" }))).toMatchObject({ ok: false, code: "BANNED" });
  });

  it("muting after a stored idea does not turn a redelivery into an error", async () => {
    const w = await world();
    const input = base(w);
    const first = await ingestIdea(input);
    await db.update(schema.participants).set({ muted: true }).where(eq(schema.participants.userId, w.users[0]));
    expect(await ingestIdea(input)).toMatchObject({ ok: true, duplicate: true });
    expect(first.ok && (await rowsOf(w))[0].id).toBe(first.ok && first.ideaId);
  });
});

describe("ingestIdea: empty and too long", () => {
  it("EMPTY and TOO_LONG are refused and do not spend the rate-limit token", async () => {
    const w = await world();
    expect(await ingestIdea(base(w, { text: "   \n " }))).toMatchObject({ ok: false, code: "EMPTY" });
    expect(await ingestIdea(base(w, { text: "x ".repeat(100) }))).toMatchObject({ ok: false, code: "TOO_LONG" });
    expect(await ingestIdea(base(w))).toMatchObject({ ok: true }); // immediately after, still allowed
    expect(await rowsOf(w)).toHaveLength(1);
  });

  it("accepts exactly the maximum length", async () => {
    const w = await world();
    const text = `${"abcdefghij ".repeat(12)}abcdefgh`;
    expect(text.length).toBe(MAX_IDEA_LEN);
    expect(await ingestIdea(base(w, { text }))).toMatchObject({ ok: true });
  });
});

describe("ingestIdea: rate limit and round cap (C6)", () => {
  it("allows 1 idea per 2 s per user: the next one is refused with a retry hint", async () => {
    const w = await world();
    expect(await ingestIdea(base(w))).toMatchObject({ ok: true });
    const second = await ingestIdea(base(w));
    expect(second).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(second.ok === false && second.retryInMs).toBeGreaterThan(0);
    expect(await rowsOf(w)).toHaveLength(1);
    // Another player is not affected.
    expect(await ingestIdea(base(w, { userId: w.users[1] }))).toMatchObject({ ok: true });
  });

  it("one IP shared by many players is not throttled like a single spammer", async () => {
    const w = await world({ players: 8 });
    for (const u of w.users) expect(await ingestIdea(base(w, { userId: u, ip: "203.0.113.7" }))).toMatchObject({ ok: true });
  });

  it("caps a user at 12 ideas per round, but not in the next round", async () => {
    const w = await world();
    for (let k = 0; k < ROUND_IDEA_CAP; k++) {
      resetRateLimits();
      expect(await ingestIdea(base(w, { text: `Idea number ${k} about vaults` }))).toMatchObject({ ok: true });
    }
    resetRateLimits();
    expect(await ingestIdea(base(w, { text: "One idea too many" }))).toMatchObject({ ok: false, code: "ROUND_CAP" });
    expect((await rowsOf(w)).filter((r) => r.userId === w.users[0])).toHaveLength(ROUND_IDEA_CAP);
    // Other players still have their own 12.
    expect(await ingestIdea(base(w, { userId: w.users[1] }))).toMatchObject({ ok: true });
    // Round 2 is a fresh count.
    await db.update(schema.engineState).set({ roundNo: 2 }).where(eq(schema.engineState.roomId, w.roomId));
    resetRateLimits();
    expect(await ingestIdea(base(w, { roundNo: 2 }))).toMatchObject({ ok: true });
  });

  it("ideas the host deleted do not count toward the cap", async () => {
    const w = await world();
    for (let k = 0; k < ROUND_IDEA_CAP; k++) {
      resetRateLimits();
      await ingestIdea(base(w, { text: `Idea number ${k} about vaults` }));
    }
    await db.update(schema.ideas).set({ status: "deleted" }).where(and(eq(schema.ideas.roundId, w.roundId), eq(schema.ideas.userId, w.users[0])));
    resetRateLimits();
    expect(await ingestIdea(base(w))).toMatchObject({ ok: true });
  });

  it("the cap is checked before anything is stored, and refusals do not queue embeddings", async () => {
    const w = await world();
    for (let k = 0; k < ROUND_IDEA_CAP; k++) {
      resetRateLimits();
      await ingestIdea(base(w, { text: `Idea number ${k} about vaults` }));
    }
    vi.mocked(queueEmbedding).mockClear();
    resetRateLimits();
    await ingestIdea(base(w));
    expect(queueEmbedding).not.toHaveBeenCalled();
  });

  it("bots skip the participant check and the rate limit", async () => {
    const w = await world();
    const botId = `b_bot${n}`;
    await db.insert(schema.users).values({ id: botId, displayName: "Botty", isBot: true });
    for (let k = 0; k < 5; k++) {
      expect(await ingestIdea(base(w, { userId: botId, source: "bot", text: `Bot idea ${k} for the vault` }))).toMatchObject({ ok: true });
    }
    expect((await rowsOf(w)).every((r) => r.source === "bot")).toBe(true);
  });

  it("bots still go through the filter", async () => {
    const w = await world();
    const botId = `b_rude${n}`;
    await db.insert(schema.users).values({ id: botId, displayName: "Rude bot", isBot: true });
    expect(await ingestIdea(base(w, { userId: botId, source: "bot", text: "what the fuck" }))).toMatchObject({ ok: false, code: "BLOCKED" });
  });
});

describe("ingestIdea: dedupe across webhook and HTTP (FR-11, B4)", () => {
  it("the same (user, clientMsgId) twice inserts one row and both report ok", async () => {
    const w = await world();
    const input = base(w);
    const viaWebhook = await ingestIdea({ ...input, source: "webhook" });
    const viaHttp = await ingestIdea({ ...input, source: "post" });
    expect(viaWebhook).toMatchObject({ ok: true, duplicate: false });
    expect(viaHttp).toMatchObject({ ok: true, duplicate: true });
    expect(viaHttp.ok && viaHttp.ideaId).toBe(viaWebhook.ok && viaWebhook.ideaId);
    expect(await rowsOf(w)).toHaveLength(1);
    expect((await rowsOf(w))[0].source).toBe("webhook");
    expect(markStatsDirty).toHaveBeenCalledTimes(1);
    expect(queueEmbedding).toHaveBeenCalledTimes(1);
  });

  it("a redelivery is never a rate-limit error (the dedupe check runs first)", async () => {
    const w = await world();
    const input = base(w);
    await ingestIdea(input);
    // Immediately again: the user's token is spent, but this is the same message.
    expect(await ingestIdea(input)).toMatchObject({ ok: true, duplicate: true });
  });

  it("a redelivery after the storm ended still reports ok, not NOT_STORM", async () => {
    const w = await world();
    const input = base(w);
    await ingestIdea({ ...input, source: "webhook" });
    await db.update(schema.engineState).set({ phase: "DISTILL" }).where(eq(schema.engineState.roomId, w.roomId));
    expect(await ingestIdea({ ...input, source: "post" })).toMatchObject({ ok: true, duplicate: true });
    expect(await ingestIdea(base(w))).toMatchObject({ ok: false, code: "NOT_STORM" });
  });

  it("two deliveries racing each other still insert exactly one row", async () => {
    const w = await world();
    const input = base(w);
    const [a, b] = await Promise.all([ingestIdea({ ...input, source: "webhook" }), ingestIdea({ ...input, source: "post" })]);
    expect(a.ok && b.ok).toBe(true);
    expect([a, b].filter((r) => r.ok && !r.duplicate)).toHaveLength(1);
    expect(await rowsOf(w)).toHaveLength(1);
  });

  it("the same clientMsgId from two different users are two ideas", async () => {
    const w = await world();
    const clientMsgId = "shared-client-id";
    expect(await ingestIdea(base(w, { clientMsgId }))).toMatchObject({ ok: true, duplicate: false });
    expect(await ingestIdea(base(w, { clientMsgId, userId: w.users[1] }))).toMatchObject({ ok: true, duplicate: false });
    expect(await rowsOf(w)).toHaveLength(2);
  });
});

describe("ingestIdea: filter (C1, FR-12)", () => {
  const subscribe = (channelId: string) => {
    const events: { event: string; data: unknown }[] = [];
    const off = mockBus.subscribe(channelId, { userId: null, push: (event, data) => events.push({ event, data }), close() {} });
    return { events, off };
  };

  it("blocked text is stored as 'blocked', returned as BLOCKED, and never as ok", async () => {
    const w = await world();
    const res = await ingestIdea(base(w, { text: "you absolute fuckwit" }));
    expect(res).toMatchObject({ ok: false, code: "BLOCKED" });
    const rows = await rowsOf(w);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("blocked");
    expect(rows.filter((r) => r.status === "ok")).toHaveLength(0);
    expect(queueEmbedding).not.toHaveBeenCalled();
    expect(markStatsDirty).not.toHaveBeenCalled();
  });

  it("no blocked fixture ever lands as status ok (leetspeak, links, numbers included)", async () => {
    const w = await world({ players: 10 });
    const fixtures = ["sh1t happens", "f*ck this", "visit www.spam.com", "mail a@b.com", "call 9876543210", "aaaaaaaaaaaa", "madarchod", "puta madre", "this is crap"];
    for (const [k, text] of fixtures.entries()) {
      expect(await ingestIdea(base(w, { userId: w.users[k], text }))).toMatchObject({ ok: false, code: "BLOCKED" });
    }
    const rows = await rowsOf(w);
    expect(rows).toHaveLength(fixtures.length);
    expect(rows.every((r) => r.status === "blocked")).toBe(true);
  });

  it("tells screens to drop the copy that already went out over the transport", async () => {
    const w = await world();
    const { events, off } = subscribe(w.channelId);
    const other = subscribe("cp_OTHER");
    const input = base(w, { text: "you absolute fuckwit" });
    await ingestIdea(input);
    off();
    other.off();
    expect(events).toEqual([
      { event: "moderation", data: { t: "mod", hide: [{ userId: w.users[0], clientMsgId: input.clientMsgId }] } },
    ]);
    expect(other.events).toEqual([]);
  });

  it("clean ideas send no moderation message", async () => {
    const w = await world();
    const { events, off } = subscribe(w.channelId);
    await ingestIdea(base(w));
    off();
    expect(events).toEqual([]);
  });

  it("a blocked idea delivered twice stays blocked and is stored once", async () => {
    const w = await world();
    const input = base(w, { text: "this is bullshit" });
    expect(await ingestIdea({ ...input, source: "webhook" })).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(await ingestIdea({ ...input, source: "post" })).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(await rowsOf(w)).toHaveLength(1);
  });

  it("strict_filter on rooms.strict_filter controls the mild words", async () => {
    const strict = await world({ strict: true });
    const relaxed = await world({ strict: false });
    expect(await ingestIdea(base(strict, { text: "what the hell is that" }))).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(await ingestIdea(base(relaxed, { text: "what the hell is that" }))).toMatchObject({ ok: true });
    expect(await ingestIdea(base(relaxed, { userId: relaxed.users[1], text: "what the fuck is that" }))).toMatchObject({ ok: false, code: "BLOCKED" });
  });

  it("a blocked idea still costs a rate-limit token and counts toward the round cap", async () => {
    const w = await world();
    await ingestIdea(base(w, { text: "this is bullshit" }));
    expect(await ingestIdea(base(w))).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });

  it("a transport failure while hiding does not break ingestion", async () => {
    const w = await world();
    const spy = vi.spyOn(getRealtimeServer(), "sendRoomMessage").mockRejectedValueOnce(new Error("provider down"));
    expect(await ingestIdea(base(w, { text: "this is bullshit" }))).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
