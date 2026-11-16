import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as webhookRoute } from "@/app/api/nexconn/webhook/route";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { ingestIdea } from "@/lib/ingest/ideas";
import { resetRateLimits } from "@/lib/ingest/ratelimit";
import { handleWebhook } from "@/lib/ingest/webhook";
import { MOCK_WEBHOOK_MAX_AGE_MS, signMockWebhook } from "@/lib/realtime/mock.server";
import type { IncomingMessage } from "@/lib/realtime/types";

vi.mock("@/lib/engine/publish", () => ({ markStatsDirty: vi.fn(), markTallyDirty: vi.fn(), buildPublicState: vi.fn() }));
vi.mock("@/lib/ai/embed", () => ({ queueEmbedding: vi.fn() }));
// Wrap (not replace) the real ingest so one test can make it fail.
vi.mock("@/lib/ingest/ideas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ingest/ideas")>();
  return { ...actual, ingestIdea: vi.fn(actual.ingestIdea) };
});

let db: Db;
let close: () => Promise<void>;
let n = 0;

beforeAll(async () => {
  ({ db, close } = await useTestDb());
});
afterAll(() => close());
beforeEach(() => resetRateLimits());

type World = { roomId: string; code: string; channelId: string; roundId: string; users: string[] };

async function world(phase = "STORM"): Promise<World> {
  const i = ++n;
  const code = Array.from({ length: 5 }, (_, k) => String.fromCharCode(65 + (Math.floor(i / 26 ** k) % 26))).join("");
  const roomId = `room_${i}`;
  const showId = `show_${i}`;
  await db.insert(schema.users).values({ id: `u_host${i}`, displayName: "Host" });
  await db.insert(schema.rooms).values({ id: roomId, code, channelId: `cp_${code}`, title: "T", hostUserId: `u_host${i}`, hostKeyHash: "x" });
  await db.insert(schema.shows).values({ id: showId, roomId, premise: "p", preset: "heist", roundsTotal: 3, stormMs: 30000, voteMs: 12000, promptMs: 6000, revealMs: 12000 });
  await db.insert(schema.engineState).values({ roomId, showId, roundNo: 1, phase, payload: { rerollUsed: false, distill: "idle", forcedWinnerId: null, voice: false } });
  const roundId = `round_${i}`;
  await db.insert(schema.rounds).values({ id: roundId, showId, roundNo: 1, promptTitle: "t", promptText: "t", narratorOptions: ["a", "b", "c"] });
  const users: string[] = [];
  for (let k = 0; k < 3; k++) {
    const id = `u_${i}_${k}`;
    users.push(id);
    await db.insert(schema.users).values({ id, displayName: `P${k}` });
    await db.insert(schema.participants).values({ roomId, userId: id });
  }
  return { roomId, code, channelId: `cp_${code}`, roundId, users };
}

let msgSeq = 0;
const message = (w: World, over: Partial<IncomingMessage> & { clientMsgId?: string; text?: string } = {}): IncomingMessage => {
  const { clientMsgId, text, ...rest } = over;
  return {
    providerMsgId: `prov-${++msgSeq}`,
    channelId: w.channelId,
    fromUserId: w.users[0],
    objectName: "CP:Idea",
    payload: { t: "idea", roundNo: 1, text: text ?? "Dig a tunnel under the bank", clientMsgId: clientMsgId ?? `client-${msgSeq}-xx`, name: "P0" },
    sentAt: Date.now(),
    ...rest,
  };
};

const signedRequest = (messages: IncomingMessage[], opts?: { timestamp?: number; secret?: string }) => {
  const raw = JSON.stringify({ messages });
  return new Request("http://localhost/api/nexconn/webhook", { method: "POST", headers: signMockWebhook(raw, opts), body: raw });
};

const ideasOf = (w: World) => db.select().from(schema.ideas).where(eq(schema.ideas.roundId, w.roundId));
const body = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe("webhook signature and freshness (C5)", () => {
  it("rejects a bad signature with 401 and ingests nothing", async () => {
    const w = await world();
    const raw = JSON.stringify({ messages: [message(w)] });
    const headers = { ...signMockWebhook(raw), "x-cp-signature": "a".repeat(64) };
    const res = await handleWebhook(new Request("http://localhost/api/nexconn/webhook", { method: "POST", headers, body: raw }));
    expect(res.status).toBe(401);
    expect(await body(res)).toMatchObject({ ok: false, code: "BAD_SIGNATURE" });
    expect(await ideasOf(w)).toHaveLength(0);
    expect(await db.select().from(schema.webhookEvents)).toHaveLength(0);
  });

  it("rejects a stale timestamp even with a valid signature", async () => {
    const w = await world();
    const res = await handleWebhook(signedRequest([message(w)], { timestamp: Date.now() - MOCK_WEBHOOK_MAX_AGE_MS - 60_000 }));
    expect(res.status).toBe(401);
    expect(await ideasOf(w)).toHaveLength(0);
  });

  it("rejects a request signed with a different secret, and one with no signature at all", async () => {
    const w = await world();
    expect((await handleWebhook(signedRequest([message(w)], { secret: "someone-else" }))).status).toBe(401);
    const raw = JSON.stringify({ messages: [message(w)] });
    expect((await handleWebhook(new Request("http://x", { method: "POST", body: raw }))).status).toBe(401);
    expect(await ideasOf(w)).toHaveLength(0);
  });

  it("the route handler is wired to the same pipeline", async () => {
    const w = await world();
    expect((await webhookRoute(signedRequest([message(w, { clientMsgId: "route-msg-001" })]))).status).toBe(200);
    expect(await ideasOf(w)).toHaveLength(1);
    expect((await webhookRoute(new Request("http://x", { method: "POST", body: "{}" }))).status).toBe(401);
  });
});

describe("webhook ingestion", () => {
  it("ingests a signed CP:Idea as source 'webhook' and reports counts", async () => {
    const w = await world();
    const res = await handleWebhook(signedRequest([message(w, { clientMsgId: "client-aaaa-1" })]));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true, received: 1, ingested: 1, duplicates: 0, rejected: 0, ignored: 0, errors: 0 });
    const rows = await ideasOf(w);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "webhook", userId: w.users[0], status: "ok", clientMsgId: "client-aaaa-1" });
  });

  it("takes the sender from the provider, not from anything in the body", async () => {
    const w = await world();
    const msg = message(w, { fromUserId: w.users[1] });
    (msg.payload as Record<string, unknown>).userId = w.users[2];
    (msg.payload as Record<string, unknown>).name = "Someone Else";
    await handleWebhook(signedRequest([msg]));
    expect((await ideasOf(w))[0].userId).toBe(w.users[1]);
  });

  it("a replayed provider message id is skipped and counted as a duplicate", async () => {
    const w = await world();
    const msg = message(w);
    const first = await body(await handleWebhook(signedRequest([msg])));
    expect(first).toMatchObject({ ingested: 1, duplicates: 0 });
    const replay = await body(await handleWebhook(signedRequest([msg])));
    expect(replay).toMatchObject({ ingested: 0, duplicates: 1 });
    expect(await ideasOf(w)).toHaveLength(1);
    expect(await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.id, msg.providerMsgId))).toHaveLength(1);
  });

  it("a replayed provider id is skipped before ingestion even if the body was altered", async () => {
    const w = await world();
    const msg = message(w);
    await handleWebhook(signedRequest([msg]));
    resetRateLimits();
    const altered = { ...msg, payload: { ...(msg.payload as object), text: "A different idea", clientMsgId: "client-new-0001" } };
    expect(await body(await handleWebhook(signedRequest([altered])))).toMatchObject({ ingested: 0, duplicates: 1 });
    expect(await ideasOf(w)).toHaveLength(1);
  });

  it("webhook then HTTP double delivery inserts one idea and both report ok (B4)", async () => {
    const w = await world();
    const msg = message(w, { clientMsgId: "double-delivery-1" });
    const hook = await body(await handleWebhook(signedRequest([msg])));
    const http = await ingestIdea({ roomCode: w.code, userId: w.users[0], roundNo: 1, text: "Dig a tunnel under the bank", clientMsgId: "double-delivery-1", source: "post" });
    expect(hook).toMatchObject({ ingested: 1, rejected: 0 });
    expect(http).toMatchObject({ ok: true, duplicate: true });
    expect(await ideasOf(w)).toHaveLength(1);
  });

  it("HTTP then webhook double delivery inserts one idea; the webhook is not a rate-limit error", async () => {
    const w = await world();
    const http = await ingestIdea({ roomCode: w.code, userId: w.users[0], roundNo: 1, text: "Dig a tunnel under the bank", clientMsgId: "double-delivery-2", source: "post" });
    const hook = await body(await handleWebhook(signedRequest([message(w, { clientMsgId: "double-delivery-2" })])));
    expect(http).toMatchObject({ ok: true, duplicate: false });
    expect(hook).toMatchObject({ ingested: 0, duplicates: 1, rejected: 0 });
    expect(await ideasOf(w)).toHaveLength(1);
  });

  it("both paths at the same instant still leave exactly one row", async () => {
    const w = await world();
    const msg = message(w, { clientMsgId: "double-delivery-3" });
    const [hook, http] = await Promise.all([
      handleWebhook(signedRequest([msg])).then(body),
      ingestIdea({ roomCode: w.code, userId: w.users[0], roundNo: 1, text: "Dig a tunnel under the bank", clientMsgId: "double-delivery-3", source: "post" }),
    ]);
    expect(http.ok).toBe(true);
    expect(hook).toMatchObject({ rejected: 0, errors: 0 });
    expect(await ideasOf(w)).toHaveLength(1);
  });

  it("never trusts the body: a non-participant, a muted player and the wrong phase are all refused", async () => {
    const w = await world();
    await db.insert(schema.users).values({ id: `u_outsider${n}`, displayName: "Outsider" });
    await db.update(schema.participants).set({ muted: true }).where(eq(schema.participants.userId, w.users[1]));
    const res = await body(
      await handleWebhook(
        signedRequest([
          message(w, { fromUserId: `u_outsider${n}` }),
          message(w, { fromUserId: w.users[1] }),
          message(w, { fromUserId: "u_does_not_exist" }),
        ]),
      ),
    );
    expect(res).toMatchObject({ received: 3, ingested: 0, rejected: 3 });
    expect(await ideasOf(w)).toHaveLength(0);

    await db.update(schema.engineState).set({ phase: "VOTE" }).where(eq(schema.engineState.roomId, w.roomId));
    expect(await body(await handleWebhook(signedRequest([message(w)])))).toMatchObject({ ingested: 0, rejected: 1 });
    expect(await ideasOf(w)).toHaveLength(0);
  });

  it("runs the filter: blocked text is stored as blocked, never as ok", async () => {
    const w = await world();
    expect(await body(await handleWebhook(signedRequest([message(w, { text: "what the fuck" })])))).toMatchObject({ ingested: 0, rejected: 1 });
    const rows = await ideasOf(w);
    expect(rows.map((r) => r.status)).toEqual(["blocked"]);
  });

  it("ignores cheers, other channels, other apps and malformed payloads without touching the database", async () => {
    const w = await world();
    const res = await body(
      await handleWebhook(
        signedRequest([
          message(w, { objectName: "CP:Cheer", payload: { t: "cheer", emoji: "🎉" } }),
          message(w, { channelId: "someone_elses_channel" }),
          message(w, { channelId: "cp_lowercase" }),
          message(w, { objectName: "RC:TxtMsg" }),
          message(w, { payload: "not an object" }),
          message(w, { payload: { t: "idea", roundNo: "one", text: 5 } }),
          message(w, { payload: { t: "idea", roundNo: 1, text: "ok text", clientMsgId: "short" } }),
        ]),
      ),
    );
    expect(res).toMatchObject({ received: 7, ingested: 0, ignored: 4, rejected: 3 });
    expect(await ideasOf(w)).toHaveLength(0);
  });

  it("accepts a payload delivered as a JSON string", async () => {
    const w = await world();
    const msg = message(w, { clientMsgId: "stringified-1" });
    msg.payload = JSON.stringify(msg.payload);
    expect(await body(await handleWebhook(signedRequest([msg])))).toMatchObject({ ingested: 1 });
  });

  it("a room that does not exist is a rejection, not a server error", async () => {
    const w = await world();
    const res = await handleWebhook(signedRequest([message(w, { channelId: "cp_ZZZZZ" })]));
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ rejected: 1, errors: 0 });
  });

  it("processes a batch message by message", async () => {
    const w = await world();
    const msgs = w.users.map((u, k) => message(w, { fromUserId: u, clientMsgId: `batch-${k}-0001`, text: `Batch idea ${k} for the heist` }));
    msgs.push(msgs[0]); // provider redelivered the first one inside the same batch
    const res = await body(await handleWebhook(signedRequest(msgs)));
    expect(res).toMatchObject({ received: 4, ingested: 3, duplicates: 1, rejected: 0 });
    expect(await ideasOf(w)).toHaveLength(3);
  });

  it("an unexpected failure answers 500 and releases the claim so the provider's retry is processed", async () => {
    const w = await world();
    const msg = message(w, { clientMsgId: "retry-me-0001" });
    vi.mocked(ingestIdea).mockRejectedValueOnce(new Error("database went away"));
    const failed = await handleWebhook(signedRequest([msg]));
    expect(failed.status).toBe(500);
    expect(await body(failed)).toMatchObject({ ok: false, errors: 1 });
    expect(await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.id, msg.providerMsgId))).toHaveLength(0);

    const retried = await handleWebhook(signedRequest([msg]));
    expect(retried.status).toBe(200);
    expect(await body(retried)).toMatchObject({ ingested: 1, duplicates: 0 });
    expect(await ideasOf(w)).toHaveLength(1);
  });
});
