/* eslint-disable @typescript-eslint/no-explicit-any -- the fake SDK records and answers arbitrary request shapes */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfig } from "@/lib/config";
import { createNexconnServer, resetNexconnServer, webhookSignature } from "@/lib/realtime/nexconn.server";
import { encodeEnvelope } from "@/lib/realtime/nexconn.codec";
import {
  NARRATOR_USER_ID,
  type PublicState,
  type ReceiptPayload,
  type RealtimeServer,
} from "@/lib/realtime/types";

// A fake @nexconn/server-sdk: every API method records its request and answers from `answers` (default {code: 0}).
const fake = vi.hoisted(() => {
  type Call = { method: string; req: any; opts: any };
  const calls: Call[] = [];
  const answers = new Map<string, (req: any) => unknown>();
  const hang = new Set<string>();
  const run = (method: string, req: unknown, opts: unknown): Promise<{ data: unknown }> => {
    calls.push({ method, req, opts });
    if (hang.has(method)) return new Promise(() => {});
    const answer = answers.get(method)?.(req) ?? { code: 0 };
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve({ data: answer });
  };
  const api = (methods: string[]) =>
    class {
      constructor(public cfg: unknown) {
        for (const m of methods) (this as any)[m] = (req: unknown, opts: unknown) => run(m, req, opts);
      }
    };
  class ApiError extends Error {
    constructor(
      message: string,
      public errorCode: number,
      public httpStatus: number,
    ) {
      super(message);
    }
  }
  return { calls, answers, hang, api, ApiError, configured: [] as unknown[] };
});

vi.mock("@nexconn/server-sdk", () => ({
  Configuration: class {
    constructor(public params?: unknown) {
      fake.configured.push(this);
    }
    setNexconnCredentials(appKey: string, secret: string) {
      (this as any).creds = { appKey, secret };
      return this;
    }
    setPrimaryBackupDomains(primary: string, backup: string) {
      (this as any).domains = { primary, backup };
      return this;
    }
  },
  UserManagementApi: fake.api(["issueAccessToken"]),
  OpenChannelManagementApi: fake.api(["createOpenChannel", "setOpenChannelDestroyType", "destroyOpenChannels"]),
  MessageManagementApi: fake.api(["sendOpenChannelMessage", "sendDirectChannelMessage"]),
  OpenChannelMetadataApi: fake.api(["batchSetOpenChannelMetadata"]),
  OpenChannelPriorityControlsApi: fake.api(["getOpenChannelPriorityMessageTypeList", "addOpenChannelPriorityMessageTypeList", "addOpenChannelPrioritySenderList"]),
  OpenChannelMessagePriorityApi: fake.api(["getOpenChannelLowPriorityMessageTypeList", "addOpenChannelLowPriorityMessageTypeList"]),
  OpenChannelParticipantsModerationApi: fake.api([
    "addOpenChannelParticipantMuteList",
    "removeOpenChannelParticipantMuteList",
    "addOpenChannelParticipantBanList",
    "removeOpenChannelParticipantBanList",
    "listOpenChannelParticipants",
  ]),
  SystemMessagesApi: fake.api(["sendSystemChannelMessage"]),
  ModerationApi: fake.api(["listProfanityWords", "batchAddProfanityWords"]),
}));

const APP_KEY = "appkey123";
const APP_SECRET = "test-secret";
const ENV = {
  NEXCONN_APP_KEY: APP_KEY,
  NEXCONN_APP_SECRET: APP_SECRET,
  NEXCONN_PRIMARY_API_DOMAIN: "api.sg-light-api.com",
  NEXCONN_SECONDARY_API_DOMAIN: "https://api-b.sg-light-api.com/",
};

let server: RealtimeServer;
const callsTo = (method: string) => fake.calls.filter((c) => c.method === method);

beforeEach(() => {
  fake.calls.length = 0;
  fake.answers.clear();
  fake.answers.set("issueAccessToken", (req) => ({ code: 0, result: { userId: req.userId, accessToken: `tok_${req.userId}` } }));
  fake.hang.clear();
  fake.configured.length = 0;
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  vi.stubEnv("NEXCONN_TEXT_ENVELOPE", "");
  vi.stubEnv("NEXCONN_WEBHOOK_SECRET", "");
  resetConfig();
  resetNexconnServer();
  server = createNexconnServer();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetConfig();
  resetNexconnServer();
});

const state = (v = 7): PublicState => ({
  v,
  roomCode: "ABCDE",
  showId: "show_1",
  phase: "STORM",
  roundNo: 1,
  roundsTotal: 3,
  phaseStartedAt: 1_700_000_000_000,
  phaseEndsAt: 1_700_000_030_000,
  serverNow: 1_700_000_001_000,
  paused: false,
  title: "The Heist",
  premise: "A bank",
  preset: "heist",
  isDemo: false,
  stats: { players: 2, ideasThisRound: 0, ideasTotal: 0, canonMakers: 0 },
  storySoFar: [],
});

const receipt: ReceiptPayload = { t: "receipt", type: "BALLOT", showId: "show_1", roundNo: 1, optionId: "opt_1", optionLabel: "Dig a tunnel", ideaText: "Dig a tunnel under the bank" };

describe("SDK setup", () => {
  it("passes credentials and https primary/backup domains, adding the scheme when it is missing", async () => {
    await server.ensureUser({ id: "u_a", name: "A" });
    const cfg = fake.configured[0] as { creds: unknown; domains: unknown; params: unknown };
    expect(cfg.creds).toEqual({ appKey: APP_KEY, secret: APP_SECRET });
    expect(cfg.domains).toEqual({ primary: "https://api.sg-light-api.com", backup: "https://api-b.sg-light-api.com" });
    expect(cfg.params).toMatchObject({ baseOptions: { timeout: 4000 } });
  });

  it("sends every request with a 4 s timeout and an abort signal", async () => {
    await server.ensureUser({ id: "u_a", name: "A" });
    expect(fake.calls[0].opts).toMatchObject({ timeout: 4000 });
    expect(fake.calls[0].opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("reuses one SDK client per process across adapter instances", async () => {
    await server.ensureUser({ id: "u_a", name: "A" });
    await createNexconnServer().ensureUser({ id: "u_b", name: "B" });
    expect(fake.configured).toHaveLength(1);
  });
});

describe("ensureUser", () => {
  it("returns the issued token", async () => {
    fake.answers.set("issueAccessToken", () => ({ code: 0, result: { userId: "u_a", accessToken: "tok_abc" } }));
    await expect(server.ensureUser({ id: "u_a", name: "Alice" })).resolves.toEqual({ token: "tok_abc" });
    expect(fake.calls[0].req).toEqual({ userId: "u_a", name: "Alice" });
  });

  it("throws on a business error, a missing token and a transport error", async () => {
    fake.answers.set("issueAccessToken", () => ({ code: 1004 }));
    await expect(server.ensureUser({ id: "u_a", name: "A" })).rejects.toThrow(/1004/);
    fake.answers.set("issueAccessToken", () => ({ code: 0, result: {} }));
    await expect(server.ensureUser({ id: "u_a", name: "A" })).rejects.toThrow(/token/);
    fake.answers.set("issueAccessToken", () => new fake.ApiError("down", -1, 503));
    await expect(server.ensureUser({ id: "u_a", name: "A" })).rejects.toThrow();
  });
});

describe("ensureChannel", () => {
  it("creates the channel, sets the longest inactivity keep-alive and makes the narrator a priority sender", async () => {
    await server.ensureChannel("cp_ABCDE", "Room");
    expect(callsTo("createOpenChannel")[0].req).toEqual({ channelId: "cp_ABCDE" });
    expect(callsTo("setOpenChannelDestroyType")[0].req).toEqual({ channelId: "cp_ABCDE", destroyType: 0, ttlMinutes: 10_080 });
    expect(callsTo("addOpenChannelPrioritySenderList")[0].req).toEqual({ channelId: "cp_ABCDE", participantIds: [NARRATOR_USER_ID] });
    expect(callsTo("issueAccessToken").map((c) => c.req.userId)).toContain(NARRATOR_USER_ID);
  });

  it("treats 'already exists' (business code 23435, as a 200 reply or an exception) as success", async () => {
    fake.answers.set("createOpenChannel", () => ({ code: 23435 }));
    await expect(server.ensureChannel("cp_ABCDE", "Room")).resolves.toBeUndefined();
    resetNexconnServer();
    fake.answers.set("createOpenChannel", () => new fake.ApiError("exists", 23435, 409));
    await expect(createNexconnServer().ensureChannel("cp_ABCDE", "Room")).resolves.toBeUndefined();
    expect(callsTo("setOpenChannelDestroyType").length).toBeGreaterThan(1);
  });

  it("fails when the channel cannot be created, and keeps going when the optional follow-ups fail", async () => {
    fake.answers.set("createOpenChannel", () => ({ code: 23426 }));
    await expect(server.ensureChannel("cp_ABCDE", "Room")).rejects.toThrow(/23426/);
    fake.answers.set("createOpenChannel", () => ({ code: 0 }));
    fake.answers.set("setOpenChannelDestroyType", () => ({ code: 23433 }));
    fake.answers.set("addOpenChannelPrioritySenderList", () => ({ code: 1009 }));
    await expect(server.ensureChannel("cp_ABCDE", "Room")).resolves.toBeUndefined();
  });

  it("does not repeat the calls for a channel it already ensured", async () => {
    await server.ensureChannel("cp_ABCDE", "Room");
    await server.ensureChannel("cp_ABCDE", "Room");
    expect(callsTo("createOpenChannel")).toHaveLength(1);
  });
});

describe("configurePriorities", () => {
  it("registers the priority and low-priority types, then syncs profanity within the provider quota", async () => {
    fake.answers.set("getOpenChannelPriorityMessageTypeList", () => ({ code: 0, result: { messageTypes: [] } }));
    fake.answers.set("getOpenChannelLowPriorityMessageTypeList", () => ({ code: 0, result: { messageTypes: [] } }));
    fake.answers.set("listProfanityWords", () => ({ code: 0, result: { words: [{ word: "fuck", filterType: "1" }] } }));
    fake.answers.set("batchAddProfanityWords", (req) => ({ code: 0, result: { remainingQuota: 0 * req.words.length } }));
    await server.configurePriorities();
    expect(callsTo("addOpenChannelPriorityMessageTypeList")[0].req).toEqual({ messageTypes: ["CP:State", "CP:Moderation"] });
    expect(callsTo("addOpenChannelLowPriorityMessageTypeList")[0].req).toEqual({ messageTypes: ["CP:Idea", "CP:Cheer"] });
    const add = callsTo("batchAddProfanityWords");
    expect(add).toHaveLength(1);
    expect(add[0].req.words.length).toBeLessThanOrEqual(50);
    expect(add[0].req.words.every((w: { word: string }) => w.word.length > 0 && w.word.length <= 32)).toBe(true);
    expect(add[0].req.words.map((w: { word: string }) => w.word)).not.toContain("fuck"); // already on the provider's list
  });

  it("is idempotent: a second run makes no further calls, and types that are already registered are not re-added", async () => {
    fake.answers.set("getOpenChannelPriorityMessageTypeList", () => ({ code: 0, result: { messageTypes: ["CP:State", "CP:Moderation"] } }));
    fake.answers.set("getOpenChannelLowPriorityMessageTypeList", () => ({ code: 0, result: { messageTypes: ["CP:Idea"] } }));
    fake.answers.set("listProfanityWords", () => ({ code: 0, result: { words: [] } }));
    await server.configurePriorities();
    const first = fake.calls.length;
    expect(callsTo("addOpenChannelPriorityMessageTypeList")).toHaveLength(0);
    expect(callsTo("addOpenChannelLowPriorityMessageTypeList")[0].req).toEqual({ messageTypes: ["CP:Cheer"] });
    await server.configurePriorities();
    expect(fake.calls.length).toBe(first);
  });

  it("never throws: service not enabled (1009), transport errors and quota errors only log", async () => {
    fake.answers.set("getOpenChannelPriorityMessageTypeList", () => ({ code: 1009 }));
    fake.answers.set("getOpenChannelLowPriorityMessageTypeList", () => new fake.ApiError("boom", -1, 500));
    fake.answers.set("listProfanityWords", () => ({ code: 0, result: { words: [] } }));
    fake.answers.set("batchAddProfanityWords", () => ({ code: 23999, result: { remainingQuota: 0 } }));
    await expect(server.configurePriorities()).resolves.toBeUndefined();
    expect(callsTo("batchAddProfanityWords")).toHaveLength(1);
  });

  it("retries the profanity batch with the remaining quota the provider reports", async () => {
    fake.answers.set("getOpenChannelPriorityMessageTypeList", () => ({ code: 0, result: { messageTypes: ["CP:State", "CP:Moderation"] } }));
    fake.answers.set("getOpenChannelLowPriorityMessageTypeList", () => ({ code: 0, result: { messageTypes: ["CP:Idea", "CP:Cheer"] } }));
    fake.answers.set("listProfanityWords", () => ({ code: 0, result: { words: [] } }));
    let n = 0;
    fake.answers.set("batchAddProfanityWords", () => (++n === 1 ? { code: 23999, result: { remainingQuota: 7 } } : { code: 0, result: { remainingQuota: 0 } }));
    await server.configurePriorities();
    const sizes = callsTo("batchAddProfanityWords").map((c) => c.req.words.length);
    expect(sizes).toEqual([50, 7]);
  });
});

describe("publishState", () => {
  it("writes every metadata key as the narrator and sends CP:State only when the phase changed", async () => {
    await server.publishState("cp_ABCDE", state(8), { phaseChanged: false });
    expect(callsTo("sendOpenChannelMessage")).toHaveLength(0);
    const set = callsTo("batchSetOpenChannelMetadata");
    expect(set).toHaveLength(1);
    expect(set[0].req).toMatchObject({ channelId: "cp_ABCDE", metadataOwnerId: NARRATOR_USER_ID, shouldAutoDelete: 0 });
    expect(Object.keys(set[0].req.metadata).sort()).toEqual(["cp_options", "cp_outcome", "cp_phase", "cp_prompt", "cp_stats", "cp_story", "cp_tally"]);
    expect(JSON.parse(set[0].req.metadata.cp_phase)).toMatchObject({ v: 8, phase: "STORM", roundNo: 1 });

    await server.publishState("cp_ABCDE", state(9), { phaseChanged: true });
    const sent = callsTo("sendOpenChannelMessage");
    expect(sent).toHaveLength(1);
    expect(sent[0].req).toMatchObject({ fromUserId: NARRATOR_USER_ID, toChannelIds: ["cp_ABCDE"], messageType: "CP:State", shouldPersist: 0 });
    expect(JSON.parse(sent[0].req.content)).toMatchObject({ v: 9, phase: "STORM" });
  });

  it("still sends CP:State when the metadata write is refused (service off, 23426) or throws", async () => {
    fake.answers.set("batchSetOpenChannelMetadata", () => ({ code: 23426 }));
    await expect(server.publishState("cp_ABCDE", state(), { phaseChanged: true })).resolves.toBeUndefined();
    expect(callsTo("sendOpenChannelMessage")).toHaveLength(1);
    fake.answers.set("batchSetOpenChannelMetadata", () => new fake.ApiError("boom", -1, 500));
    await expect(server.publishState("cp_ABCDE", state(), { phaseChanged: true })).resolves.toBeUndefined();
    expect(callsTo("sendOpenChannelMessage")).toHaveLength(2);
  });

  it("never throws on business errors from the message send either, nor when the SDK is unconfigured", async () => {
    fake.answers.set("sendOpenChannelMessage", () => ({ code: 23410 }));
    await expect(server.publishState("cp_ABCDE", state(), { phaseChanged: true })).resolves.toBeUndefined();
    vi.stubEnv("NEXCONN_APP_SECRET", "");
    resetConfig();
    resetNexconnServer();
    await expect(createNexconnServer().publishState("cp_ABCDE", state(), { phaseChanged: true })).resolves.toBeUndefined();
  });

  it("uses the RC:TxtMsg fallback envelope when NEXCONN_TEXT_ENVELOPE=1", async () => {
    vi.stubEnv("NEXCONN_TEXT_ENVELOPE", "1");
    await server.publishState("cp_ABCDE", state(10), { phaseChanged: true });
    const sent = callsTo("sendOpenChannelMessage")[0].req;
    expect(sent.messageType).toBe("RC:TxtMsg");
    const body = JSON.parse(sent.content) as { content: string; extra: string };
    expect(body.content).toMatch(/The Heist/);
    expect(JSON.parse(body.extra)).toMatchObject({ cp: 1, o: "CP:State", p: { v: 10 } });
  });
});

describe("publishTally", () => {
  it("writes cp_tally and sends CP:Tally", async () => {
    await server.publishTally("cp_ABCDE", 12, 2, { a: 3, b: 1 }, 4);
    const set = callsTo("batchSetOpenChannelMetadata")[0].req;
    expect(Object.keys(set.metadata)).toEqual(["cp_tally"]);
    expect(JSON.parse(set.metadata.cp_tally)).toEqual({ v: 12, tally: { a: 3, b: 1 }, total: 4 });
    const sent = callsTo("sendOpenChannelMessage")[0].req;
    expect(sent).toMatchObject({ fromUserId: NARRATOR_USER_ID, messageType: "CP:Tally" });
    expect(JSON.parse(sent.content)).toEqual({ t: "tally", v: 12, roundNo: 2, tally: { a: 3, b: 1 }, total: 4 });
  });
});

describe("sendRoomMessage", () => {
  it("picks the object name from the payload type and registers a bot sender once", async () => {
    const idea = (k: number) => ({ t: "idea" as const, roundNo: 1, text: `idea ${k}`, clientMsgId: `m${k}`, name: "Botty", isBot: true });
    await server.sendRoomMessage("cp_ABCDE", "b_bot1", idea(1));
    await server.sendRoomMessage("cp_ABCDE", "b_bot1", idea(2));
    await server.sendRoomMessage("cp_ABCDE", "u_alice", { t: "cheer", emoji: "🎉" });
    const sent = callsTo("sendOpenChannelMessage").map((c) => [c.req.fromUserId, c.req.messageType]);
    expect(sent).toEqual([["b_bot1", "CP:Idea"], ["b_bot1", "CP:Idea"], ["u_alice", "CP:Cheer"]]);
    expect(callsTo("issueAccessToken").filter((c) => c.req.userId === "b_bot1")).toHaveLength(1);
    expect(callsTo("issueAccessToken").find((c) => c.req.userId === "b_bot1")?.req.name).toBe("Botty");
  });

  it("sends notices and moderation as the narrator whoever the caller names", async () => {
    await server.sendRoomMessage("cp_ABCDE", "u_someone", { t: "notice", text: "hello" });
    await server.sendRoomMessage("cp_ABCDE", "u_someone", { t: "mod", hideUserIds: ["u_x"] });
    const sent = callsTo("sendOpenChannelMessage").map((c) => [c.req.fromUserId, c.req.messageType]);
    expect(sent).toEqual([[NARRATOR_USER_ID, "CP:Notice"], [NARRATOR_USER_ID, "CP:Moderation"]]);
  });

  it("does not throw when the provider refuses, and still sends if registering the sender failed", async () => {
    fake.answers.set("issueAccessToken", () => ({ code: 1004 }));
    fake.answers.set("sendOpenChannelMessage", () => ({ code: 1008 }));
    await expect(server.sendRoomMessage("cp_ABCDE", "b_bot1", { t: "cheer", emoji: "🎉" })).resolves.toBeUndefined();
    expect(callsTo("sendOpenChannelMessage")).toHaveLength(1);
  });
});

describe("sendReceipt fallback chain", () => {
  it("delivers over a direct channel from the narrator", async () => {
    await expect(server.sendReceipt("u_alice", receipt)).resolves.toBe(true);
    const direct = callsTo("sendDirectChannelMessage")[0].req;
    expect(direct).toMatchObject({ fromUserId: NARRATOR_USER_ID, toUserIds: ["u_alice"], messageType: "CP:Receipt" });
    expect(JSON.parse(direct.content)).toEqual(receipt);
    expect(callsTo("sendSystemChannelMessage")).toHaveLength(0);
  });

  it("falls back to a system channel message when the direct send is refused or throws", async () => {
    fake.answers.set("sendDirectChannelMessage", () => ({ code: 1016 }));
    await expect(server.sendReceipt("u_alice", receipt)).resolves.toBe(true);
    expect(callsTo("sendSystemChannelMessage")[0].req).toMatchObject({ fromUserId: NARRATOR_USER_ID, toUserIds: ["u_alice"], messageType: "CP:Receipt" });
    fake.answers.set("sendDirectChannelMessage", () => new fake.ApiError("down", -1, 503));
    await expect(server.sendReceipt("u_bob", receipt)).resolves.toBe(true);
    expect(callsTo("sendSystemChannelMessage")).toHaveLength(2);
  });

  it("reports false when both are refused or the transport fails, never throwing", async () => {
    fake.answers.set("sendDirectChannelMessage", () => ({ code: 1016 }));
    fake.answers.set("sendSystemChannelMessage", () => ({ code: 1009 }));
    await expect(server.sendReceipt("u_alice", receipt)).resolves.toBe(false);
    fake.answers.set("sendDirectChannelMessage", () => new fake.ApiError("down", -1, 503));
    fake.answers.set("sendSystemChannelMessage", () => new fake.ApiError("down", -1, 503));
    await expect(server.sendReceipt("u_alice", receipt)).resolves.toBe(false);
  });
});

describe("moderate", () => {
  it("maps each action to the mute/ban list endpoints with the maximum duration on adds", async () => {
    for (const action of ["mute", "unmute", "ban", "unban"] as const) await server.moderate("cp_ABCDE", "u_x", action);
    expect(callsTo("addOpenChannelParticipantMuteList")[0].req).toEqual({ channelId: "cp_ABCDE", participantIds: ["u_x"], durationMinutes: 43_200 });
    expect(callsTo("removeOpenChannelParticipantMuteList")[0].req).toEqual({ channelId: "cp_ABCDE", participantIds: ["u_x"] });
    expect(callsTo("addOpenChannelParticipantBanList")[0].req).toEqual({ channelId: "cp_ABCDE", participantIds: ["u_x"], durationMinutes: 43_200 });
    expect(callsTo("removeOpenChannelParticipantBanList")[0].req).toEqual({ channelId: "cp_ABCDE", participantIds: ["u_x"] });
  });

  it("does not throw on provider errors", async () => {
    fake.answers.set("addOpenChannelParticipantMuteList", () => ({ code: 23410 }));
    fake.answers.set("addOpenChannelParticipantBanList", () => new fake.ApiError("x", -1, 500));
    await expect(server.moderate("cp_ABCDE", "u_x", "mute")).resolves.toBeUndefined();
    await expect(server.moderate("cp_ABCDE", "u_x", "ban")).resolves.toBeUndefined();
  });
});

describe("countParticipants and destroyChannel", () => {
  it("reads the participant total, or null when the provider cannot say", async () => {
    fake.answers.set("listOpenChannelParticipants", () => ({ code: 0, result: { total: 37, participants: [] } }));
    await expect(server.countParticipants("cp_ABCDE")).resolves.toBe(37);
    expect(callsTo("listOpenChannelParticipants")[0].req).toEqual({ channelId: "cp_ABCDE", pageSize: 1 });
    fake.answers.set("listOpenChannelParticipants", () => ({ code: 23410 }));
    await expect(server.countParticipants("cp_ABCDE")).resolves.toBeNull();
    fake.answers.set("listOpenChannelParticipants", () => ({ code: 0, result: {} }));
    await expect(server.countParticipants("cp_ABCDE")).resolves.toBeNull();
    fake.answers.set("listOpenChannelParticipants", () => new fake.ApiError("x", -1, 500));
    await expect(server.countParticipants("cp_ABCDE")).resolves.toBeNull();
  });

  it("destroys the channel, forgets it, and accepts 'already gone'", async () => {
    await server.ensureChannel("cp_ABCDE", "Room");
    await server.destroyChannel("cp_ABCDE");
    expect(callsTo("destroyOpenChannels")[0].req).toEqual({ channelIds: ["cp_ABCDE"] });
    fake.answers.set("destroyOpenChannels", () => ({ code: 23410 }));
    await expect(server.destroyChannel("cp_ABCDE")).resolves.toBeUndefined();
    await server.ensureChannel("cp_ABCDE", "Room"); // forgotten: created again
    expect(callsTo("createOpenChannel")).toHaveLength(2);
  });
});

describe("timeouts", () => {
  it("gives up on a hung call after 4 s and degrades instead of hanging the engine", async () => {
    vi.useFakeTimers();
    fake.hang.add("listOpenChannelParticipants");
    fake.hang.add("sendDirectChannelMessage");
    fake.hang.add("sendSystemChannelMessage");
    fake.hang.add("batchSetOpenChannelMetadata");
    fake.hang.add("sendOpenChannelMessage");
    const results = Promise.all([
      server.countParticipants("cp_ABCDE"),
      server.sendReceipt("u_alice", receipt),
      server.publishState("cp_ABCDE", state(), { phaseChanged: true }),
    ]);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(4000);
    const [count, delivered] = await results;
    expect(count).toBeNull();
    expect(delivered).toBe(false);
  });
});

// ---------- webhook (C5, with the real Nexconn scheme) ----------

describe("verifyWebhook", () => {
  const ideaPayload = { t: "idea", roundNo: 1, text: "Dig a tunnel", clientMsgId: "cm-1", name: "Alice" };
  const envelope = (data: unknown[] = [wireMessage()], type = "message:send") => JSON.stringify({ type, id: "evt_1", time: Date.now(), data });
  function wireMessage(over: Record<string, unknown> = {}) {
    return { userId: "u_alice", channelId: "cp_ABCDE", channelType: 4, messageType: "CP:Idea", content: JSON.stringify(ideaPayload), time: 1_730_192_400_000, messageId: "msg_1", os: "Websocket", ...over };
  }
  const sign = (secret: string, nonce: string, ts: string) => createHash("sha1").update(secret + nonce + ts).digest("hex");
  function request(body: string, h: Partial<Record<"AppKey" | "Nonce" | "Timestamp" | "Signature", string>> = {}, over: { secret?: string; nonce?: string; ts?: string } = {}): Request {
    const nonce = over.nonce ?? "abc123";
    const ts = over.ts ?? String(Date.now());
    const headers: Record<string, string> = { AppKey: APP_KEY, Nonce: nonce, Timestamp: ts, Signature: sign(over.secret ?? APP_SECRET, nonce, ts), ...h };
    for (const k of Object.keys(headers)) if (headers[k] === undefined) delete headers[k];
    return new Request("http://localhost/api/nexconn/webhook", { method: "POST", headers, body });
  }

  it("webhookSignature is sha1(AppSecret + Nonce + Timestamp) in lowercase hex (independent vector)", () => {
    expect(webhookSignature("test-secret", "abc123", "1730192400000")).toBe("c0d849e54b4e9a9bafa6654491d00f4dc1ec7e5d");
  });

  it("accepts a good, fresh request and returns the incoming messages", async () => {
    const body = envelope();
    const out = await server.verifyWebhook(request(body), body);
    expect(out).toEqual([{ providerMsgId: "msg_1", channelId: "cp_ABCDE", fromUserId: "u_alice", objectName: "CP:Idea", payload: ideaPayload, sentAt: 1_730_192_400_000 }]);
  });

  it("accepts an upper-case hex signature and header names in any case", async () => {
    const body = envelope();
    const ts = String(Date.now());
    const req = new Request("http://x/", { method: "POST", body, headers: { appkey: APP_KEY, nonce: "n1", timestamp: ts, signature: sign(APP_SECRET, "n1", ts).toUpperCase() } });
    expect(await server.verifyWebhook(req, body)).toHaveLength(1);
  });

  it("rejects a bad signature", async () => {
    const body = envelope();
    expect(await server.verifyWebhook(request(body, { Signature: "0".repeat(40) }), body)).toBeNull();
    expect(await server.verifyWebhook(request(body, { Signature: "short" }), body)).toBeNull();
  });

  it("rejects a signature made with the wrong secret", async () => {
    const body = envelope();
    expect(await server.verifyWebhook(request(body, {}, { secret: "someone-elses-secret" }), body)).toBeNull();
  });

  it("rejects a nonce or timestamp changed after signing", async () => {
    const body = envelope();
    const ts = String(Date.now());
    expect(await server.verifyWebhook(request(body, { Nonce: "other" }, { nonce: "abc123", ts }), body)).toBeNull();
    expect(await server.verifyWebhook(request(body, { Timestamp: String(Date.now() + 1) }, { ts }), body)).toBeNull();
  });

  it("rejects the wrong AppKey even with a valid signature for our secret", async () => {
    const body = envelope();
    expect(await server.verifyWebhook(request(body, { AppKey: "other-app" }), body)).toBeNull();
  });

  it("rejects a stale timestamp (older than 5 min) and one from the future, even when the signature is valid", async () => {
    const body = envelope();
    const stale = String(Date.now() - 5 * 60_000 - 1000);
    const future = String(Date.now() + 5 * 60_000 + 1000);
    expect(await server.verifyWebhook(request(body, {}, { ts: stale }), body)).toBeNull();
    expect(await server.verifyWebhook(request(body, {}, { ts: future }), body)).toBeNull();
    const recent = String(Date.now() - 4 * 60_000);
    expect(await server.verifyWebhook(request(body, {}, { ts: recent }), body)).toHaveLength(1);
  });

  it("rejects missing headers, a non-numeric timestamp and a request with no signature at all", async () => {
    const body = envelope();
    expect(await server.verifyWebhook(new Request("http://x/", { method: "POST", body }), body)).toBeNull();
    for (const h of ["AppKey", "Nonce", "Timestamp", "Signature"] as const) {
      const headers: Record<string, string> = { AppKey: APP_KEY, Nonce: "n", Timestamp: String(Date.now()), Signature: "x" };
      delete headers[h];
      expect(await server.verifyWebhook(new Request("http://x/", { method: "POST", body, headers }), body), h).toBeNull();
    }
    expect(await server.verifyWebhook(request(body, { Timestamp: "yesterday" }), body)).toBeNull();
  });

  it("does not sign the body, so the message is still parsed strictly: a malformed body is rejected after a valid signature", async () => {
    expect(await server.verifyWebhook(request("not json"), "not json")).toBeNull();
    expect(await server.verifyWebhook(request('{"type":"message:send"}'), '{"type":"message:send"}')).toBeNull();
  });

  it("answers [] for events that are not messages, and filters our own server sends and other channel types", async () => {
    const op = JSON.stringify({ type: "open_channel:operation", id: "e", time: 1, data: [{ channelId: "cp_ABCDE", userIds: ["u"], operationType: 1 }] });
    expect(await server.verifyWebhook(request(op), op)).toEqual([]);
    const mixed = envelope([wireMessage({ os: "Server", messageId: "s1" }), wireMessage({ channelType: 1, messageId: "d1" }), wireMessage({ messageId: "ok1" })]);
    expect((await server.verifyWebhook(request(mixed), mixed))?.map((m) => m.providerMsgId)).toEqual(["ok1"]);
  });

  it("decodes an idea sent in the RC:TxtMsg fallback envelope", async () => {
    const enc = encodeEnvelope("CP:Idea", ideaPayload, "text");
    const body = envelope([wireMessage({ messageType: enc.messageType, content: enc.content })]);
    const out = await server.verifyWebhook(request(body), body);
    expect(out?.[0]).toMatchObject({ objectName: "CP:Idea", payload: ideaPayload, fromUserId: "u_alice" });
  });

  it("honours NEXCONN_WEBHOOK_SECRET as an override of the App Secret when it is set", async () => {
    vi.stubEnv("NEXCONN_WEBHOOK_SECRET", "separate-secret");
    resetConfig();
    resetNexconnServer();
    const s = createNexconnServer();
    const body = envelope();
    expect(await s.verifyWebhook(request(body), body)).toBeNull();
    expect(await s.verifyWebhook(request(body, {}, { secret: "separate-secret" }), body)).toHaveLength(1);
  });

  it("rejects everything (instead of throwing) when the adapter is not configured", async () => {
    vi.stubEnv("NEXCONN_APP_SECRET", "");
    resetConfig();
    resetNexconnServer();
    const body = envelope();
    expect(await createNexconnServer().verifyWebhook(request(body), body)).toBeNull();
  });
});
