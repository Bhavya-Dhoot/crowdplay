/* eslint-disable @typescript-eslint/no-explicit-any -- the fake SDK records and answers arbitrary request shapes */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeEnvelope } from "@/lib/realtime/nexconn.codec";
import { createNexconnClient } from "@/lib/realtime/nexconn.client";
import { NARRATOR_USER_ID, encodeMetadata, type ClientEvents, type PublicState, type RealtimeClient } from "@/lib/realtime/types";

// A fake @nexconn/chat: records the call order and lets a test push messages and handler events in.
const fake = vi.hoisted(() => {
  type Fn = (e: any) => void;
  const order: string[] = [];
  const handlers = { message: new Map<string, Record<string, Fn>>(), connection: new Map<string, Record<string, Fn>>(), open: new Map<string, Record<string, Fn>>() };
  const channels = new Map<string, any>();
  const s = {
    order,
    handlers,
    channels,
    initialized: [] as unknown[],
    registered: [] as any[],
    connectResult: { isOk: true, code: 0, msg: "" } as { isOk: boolean; code: number; msg: string },
    connectToken: "",
    enterResult: { isOk: true, code: 0, msg: "" } as { isOk: boolean; code: number; msg: string },
    metadata: {} as Record<string, string>,
    sendResult: { isOk: true, code: 0, msg: "" } as { isOk: boolean; code: number; msg: string },
    sent: [] as { channelId: string; content: unknown; messageType: string }[],
    enterCalls: [] as { channelId: string; params: unknown }[],
    disconnected: 0,
    exited: [] as string[],
  };
  const first = (m: Map<string, Record<string, Fn>>) => [...m.values()][0];
  return { ...s, s, first };
});

vi.mock("@nexconn/chat", () => {
  const f = fake.s;
  class Handler {
    constructor(public _invoker: Record<string, (e: any) => void>) {}
  }
  class OpenChannel {
    constructor(public channelId: string) {
      f.channels.set(channelId, this);
    }
    async enterChannel(params: unknown) {
      f.enterCalls.push({ channelId: this.channelId, params });
      f.order.push("enterChannel");
      return f.enterResult;
    }
    async exitChannel() {
      f.exited.push(this.channelId);
      return { isOk: true, code: 0, msg: "" };
    }
    async getMetadata() {
      return { isOk: true, code: 0, msg: "", data: { ...f.metadata } };
    }
    async sendMessage(p: { content: unknown; messageType: string }) {
      f.sent.push({ channelId: this.channelId, content: p.content, messageType: p.messageType });
      return f.sendResult;
    }
  }
  return {
    AreaCode: { BJ: 1, SG: 2, NA: 3, SA: 5, OM: 6 },
    LogLevel: { DEBUG: 4, INFO: 3, WARN: 2, ERROR: 1 },
    OpenChannelMetadataOperationType: { UPDATE: 0, REMOVE: 1 },
    ConnectionStatusHandler: Handler,
    MessageHandler: Handler,
    OpenChannelHandler: Handler,
    OpenChannel,
    SendMessageParams: class {
      constructor(
        public content: unknown,
        public messageType: string,
      ) {}
    },
    NCEngine: {
      initialize(p: unknown) {
        f.order.push("initialize");
        f.initialized.push(p);
      },
      registerCustomMessages(r: unknown[]) {
        f.order.push("registerCustomMessages");
        f.registered.push(...r);
      },
      addConnectionStatusHandler(id: string, h: Handler) {
        f.order.push("addConnectionStatusHandler");
        f.handlers.connection.set(id, h._invoker);
      },
      addMessageHandler(id: string, h: Handler) {
        f.order.push("addMessageHandler");
        f.handlers.message.set(id, h._invoker);
      },
      addOpenChannelHandler(id: string, h: Handler) {
        f.order.push("addOpenChannelHandler");
        f.handlers.open.set(id, h._invoker);
      },
      removeConnectionStatusHandler: (id: string) => void f.handlers.connection.delete(id),
      removeMessageHandler: (id: string) => void f.handlers.message.delete(id),
      removeOpenChannelHandler: (id: string) => void f.handlers.open.delete(id),
      async connect(p: { token: string }) {
        f.order.push("connect");
        f.connectToken = p.token;
        return f.connectResult;
      },
      async disconnect() {
        f.disconnected++;
      },
    },
  };
});

const CH = "cp_ABCDE";
let client: RealtimeClient;
let events: { [K in keyof ClientEvents]?: ClientEvents[K][] };

function record(c: RealtimeClient): void {
  events = {};
  const listen = <K extends keyof ClientEvents>(ev: K): void => {
    c.on(ev, (p) => {
      ((events[ev] ??= []) as ClientEvents[K][]).push(p);
    });
  };
  for (const ev of ["state", "patch", "tally", "idea", "cheer", "moderation", "receipt", "notice", "connection"] as const) listen(ev);
}

const state = (v: number): PublicState => ({
  v,
  roomCode: "ABCDE",
  showId: "show_1",
  phase: "STORM",
  roundNo: 1,
  roundsTotal: 3,
  phaseStartedAt: 1,
  phaseEndsAt: 2,
  serverNow: 1,
  paused: false,
  title: "T",
  premise: "P",
  preset: "heist",
  isDemo: false,
  stats: { players: 1, ideasThisRound: 0, ideasTotal: 0, canonMakers: 0 },
  storySoFar: [],
});

let msgSeq = 0;
function deliver(m: { type: string; content: unknown; from: string; channelType?: number; channelId?: string; id?: string | null }): void {
  const handler = fake.first(fake.handlers.message);
  handler.onMessageReceived({
    messages: [
      {
        messageId: m.id === null ? "" : (m.id ?? `m${++msgSeq}`),
        messageType: m.type,
        content: m.content,
        senderUserId: m.from,
        channelIdentifier: { channelType: m.channelType ?? 4, channelId: m.channelId ?? CH },
      },
    ],
  });
}
const narrator = (name: "CP:State" | "CP:Tally" | "CP:Notice" | "CP:Moderation", payload: unknown) => {
  const enc = encodeEnvelope(name, payload, "custom");
  deliver({ type: enc.messageType, content: JSON.parse(enc.content), from: NARRATOR_USER_ID });
};

async function connected(area?: string): Promise<void> {
  client = createNexconnClient();
  record(client);
  await client.connect({ mode: "nexconn", userId: "u_me", appKey: "key1", token: "tok1", area });
}

beforeEach(() => {
  vi.stubGlobal("window", {});
  fake.order.length = 0;
  fake.handlers.message.clear();
  fake.handlers.connection.clear();
  fake.handlers.open.clear();
  fake.channels.clear();
  fake.initialized.length = 0;
  fake.registered.length = 0;
  fake.sent.length = 0;
  fake.enterCalls.length = 0;
  fake.exited.length = 0;
  fake.s.disconnected = 0;
  fake.s.connectResult = { isOk: true, code: 0, msg: "" };
  fake.s.enterResult = { isOk: true, code: 0, msg: "" };
  fake.s.sendResult = { isOk: true, code: 0, msg: "" };
  fake.s.metadata = {};
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("connect", () => {
  it("initialises, registers the CP:* types, adds handlers and only then connects (the SDK's required order)", async () => {
    await connected("NA");
    expect(fake.order).toEqual(["initialize", "registerCustomMessages", "addConnectionStatusHandler", "addMessageHandler", "addOpenChannelHandler", "connect"]);
    expect(fake.initialized[0]).toMatchObject({ appKey: "key1", areaCode: 3 });
    expect(fake.registered.map((r) => r.messageType).sort()).toEqual(["CP:Cheer", "CP:Idea", "CP:Moderation", "CP:Notice", "CP:Receipt", "CP:State", "CP:Tally"]);
    expect(fake.registered.every((r) => r.isPersisted === false && r.isCounted === false)).toBe(true);
    expect(fake.s.connectToken).toBe("tok1");
    expect(events.connection).toEqual(["connecting", "connected"]);
  });

  it("falls back to the SDK default area (and does not fail) when the area is unknown", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await connected("Mars");
    expect(fake.initialized[0]).toMatchObject({ appKey: "key1", areaCode: undefined });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("rejects, reports disconnected and removes its handlers when the SDK refuses the token", async () => {
    fake.s.connectResult = { isOk: false, code: 31004, msg: "token invalid" };
    client = createNexconnClient();
    record(client);
    await expect(client.connect({ mode: "nexconn", userId: "u_me", appKey: "key1", token: "bad" })).rejects.toMatchObject({ code: 31004 });
    expect(events.connection).toEqual(["connecting", "disconnected"]);
    expect(fake.handlers.message.size).toBe(0);
  });

  it("needs credentials and a browser", async () => {
    client = createNexconnClient();
    await expect(client.connect({ mode: "nexconn", userId: "u" })).rejects.toThrow(/appKey and token/);
    vi.stubGlobal("window", undefined);
    await expect(client.connect({ mode: "nexconn", userId: "u", appKey: "k", token: "t" })).rejects.toThrow(/browser/);
  });

  it("maps the numeric SDK status to connected / connecting / disconnected", async () => {
    await connected();
    const h = fake.first(fake.handlers.connection);
    for (const status of [2, 1, 0, 3, 2]) h.onConnectionStatusChanged({ status });
    expect(events.connection).toEqual(["connecting", "connected", "disconnected", "connecting", "connected", "connecting", "disconnected"]);
  });
});

describe("joinRoom", () => {
  it("enters the open channel and seeds a patch from its metadata", async () => {
    await connected();
    fake.s.metadata = encodeMetadata(state(5));
    await client.joinRoom(CH);
    expect(fake.enterCalls).toEqual([{ channelId: CH, params: { messageCount: 0 } }]);
    expect(events.patch?.[0]).toMatchObject({ v: 5, fields: { phase: "STORM", roundNo: 1, title: "T" } });
  });

  it("throws on a failed first join but tolerates a failed repeat join (the SDK re-enters by itself after a reconnect)", async () => {
    await connected();
    fake.s.enterResult = { isOk: false, code: 23410, msg: "channel does not exist" };
    await expect(client.joinRoom(CH)).rejects.toMatchObject({ code: 23410 });
    fake.s.enterResult = { isOk: true, code: 0, msg: "" };
    await client.joinRoom(CH);
    fake.s.enterResult = { isOk: false, code: 23406, msg: "already" };
    await expect(client.joinRoom(CH)).resolves.toBeUndefined();
  });

  it("needs a connection first", async () => {
    client = createNexconnClient();
    await expect(client.joinRoom(CH)).rejects.toThrow(/Not connected/);
  });
});

describe("receiving", () => {
  beforeEach(async () => {
    await connected();
    await client.joinRoom(CH);
  });

  it("turns narrator state and tally into events and keeps their versions", () => {
    narrator("CP:State", state(9));
    narrator("CP:Tally", { t: "tally", v: 10, roundNo: 1, tally: { a: 1 }, total: 1 });
    expect(events.state?.[0]).toMatchObject({ v: 9, phase: "STORM" });
    expect(events.tally?.[0]).toEqual({ t: "tally", v: 10, roundNo: 1, tally: { a: 1 }, total: 1 });
  });

  it("ignores state, tally, moderation and notices that a player sent, but still shows that player's idea with the sender id", () => {
    const forged = encodeEnvelope("CP:State", state(1_000_000), "custom");
    deliver({ type: forged.messageType, content: JSON.parse(forged.content), from: "u_mallory" });
    const fakeMod = encodeEnvelope("CP:Moderation", { t: "mod", hideUserIds: ["u_victim"] }, "custom");
    deliver({ type: fakeMod.messageType, content: JSON.parse(fakeMod.content), from: "u_mallory" });
    const idea = encodeEnvelope("CP:Idea", { t: "idea", roundNo: 1, text: "Dig", clientMsgId: "c1", name: "Mal" }, "custom");
    deliver({ type: idea.messageType, content: JSON.parse(idea.content), from: "u_mallory" });
    expect(events.state).toBeUndefined();
    expect(events.moderation).toBeUndefined();
    expect(events.idea).toEqual([{ t: "idea", roundNo: 1, text: "Dig", clientMsgId: "c1", name: "Mal", userId: "u_mallory" }]);
  });

  it("decodes cheers, notices, moderation and the RC:TxtMsg fallback envelope", () => {
    const cheer = encodeEnvelope("CP:Cheer", { t: "cheer", emoji: "🎉" }, "custom");
    deliver({ type: cheer.messageType, content: JSON.parse(cheer.content), from: "u_a" });
    narrator("CP:Notice", { t: "notice", text: "hi" });
    narrator("CP:Moderation", { t: "mod", hideUserIds: ["u_x"] });
    const text = encodeEnvelope("CP:Notice", { t: "notice", text: "via text" }, "text");
    const body = JSON.parse(text.content) as { content: string; extra: string };
    deliver({ type: text.messageType, content: { text: body.content, extra: body.extra }, from: NARRATOR_USER_ID });
    expect(events.cheer?.[0]).toMatchObject({ emoji: "🎉", userId: "u_a" });
    expect(events.notice?.map((n) => n.text)).toEqual(["hi", "via text"]);
    expect(events.moderation?.[0]).toEqual({ t: "mod", hideUserIds: ["u_x"] });
  });

  it("delivers a receipt from the direct channel even though it is not the joined room, and not from an open channel", () => {
    const r = { t: "receipt", type: "BALLOT", showId: "s", roundNo: 1, optionId: "o", optionLabel: "L", ideaText: "I" };
    deliver({ type: "CP:Receipt", content: r, from: NARRATOR_USER_ID, channelType: 1, channelId: "u_me" });
    deliver({ type: "CP:Receipt", content: r, from: NARRATOR_USER_ID, channelType: 6, channelId: "u_me" });
    deliver({ type: "CP:Receipt", content: r, from: NARRATOR_USER_ID, channelType: 4, channelId: CH });
    deliver({ type: "CP:Receipt", content: r, from: "u_mallory", channelType: 1, channelId: "u_mallory" });
    expect(events.receipt).toHaveLength(2);
  });

  it("ignores messages for other channels, non-CP messages and redeliveries of the same message id", () => {
    const n = encodeEnvelope("CP:Notice", { t: "notice", text: "x" }, "custom");
    deliver({ type: n.messageType, content: JSON.parse(n.content), from: NARRATOR_USER_ID, channelId: "cp_OTHER" });
    deliver({ type: "RC:TxtMsg", content: { text: "hello", extra: "" }, from: "u_a" });
    deliver({ type: n.messageType, content: JSON.parse(n.content), from: NARRATOR_USER_ID, id: "dup" });
    deliver({ type: n.messageType, content: JSON.parse(n.content), from: NARRATOR_USER_ID, id: "dup" });
    expect(events.notice).toHaveLength(1);
  });

  it("accepts content delivered as a JSON string as well as an object", () => {
    deliver({ type: "CP:Notice", content: JSON.stringify({ t: "notice", text: "string body" }), from: NARRATOR_USER_ID });
    expect(events.notice?.[0].text).toBe("string body");
  });
});

describe("metadata fast path", () => {
  const changed = (changeInfo: { key: string; value: string; operationType: number }[]) =>
    fake.first(fake.handlers.open).onMetadataChanged({ changeInfo: changeInfo.map((c) => ({ channelId: CH, ...c })) });

  beforeEach(async () => {
    vi.useFakeTimers();
    await connected();
    await client.joinRoom(CH);
  });

  it("emits one patch per burst, built only from the keys that changed", async () => {
    const meta = encodeMetadata({ ...state(12), tally: { a: 2 }, votesTotal: 2 });
    changed([
      { key: "cp_tally", value: meta.cp_tally, operationType: 0 },
      { key: "cp_stats", value: meta.cp_stats, operationType: 0 },
    ]);
    expect(events.patch).toBeUndefined();
    await vi.advanceTimersByTimeAsync(100);
    expect(events.patch).toHaveLength(1);
    expect(events.patch?.[0].v).toBe(12);
    expect(Object.keys(events.patch?.[0].fields ?? {}).sort()).toEqual(["stats", "tally", "votesTotal"]);
  });

  it("re-reads the whole metadata when the SDK reports it synced", async () => {
    fake.s.metadata = encodeMetadata(state(20));
    fake.first(fake.handlers.open).onMetadataSynced({ channelId: CH });
    await vi.advanceTimersByTimeAsync(10);
    expect(events.patch?.[0]).toMatchObject({ v: 20, fields: { phase: "STORM" } });
  });

  it("drops a patch whose version jumps far past what the narrator has sent (forged or corrupt metadata)", async () => {
    narrator("CP:State", state(30));
    const forged = encodeMetadata(state(999_999));
    changed([{ key: "cp_phase", value: forged.cp_phase, operationType: 0 }]);
    await vi.advanceTimersByTimeAsync(100);
    expect(events.patch).toBeUndefined();
    const plausible = encodeMetadata(state(31));
    changed([{ key: "cp_phase", value: plausible.cp_phase, operationType: 0 }]);
    await vi.advanceTimersByTimeAsync(100);
    expect(events.patch).toHaveLength(1);
  });
});

describe("sending", () => {
  it("sends ideas and cheers as the registered CP:* custom messages in the joined room", async () => {
    await connected();
    await client.joinRoom(CH);
    const idea = { t: "idea" as const, roundNo: 1, text: "Dig", clientMsgId: "c1", name: "Me" };
    await client.sendIdea(CH, idea);
    await client.sendCheer(CH, "🎉");
    expect(fake.sent).toEqual([
      { channelId: CH, messageType: "CP:Idea", content: idea },
      { channelId: CH, messageType: "CP:Cheer", content: { t: "cheer", emoji: "🎉" } },
    ]);
  });

  it("surfaces a failed send (the caller also posts over HTTP) and refuses to send outside a joined room", async () => {
    await connected();
    await expect(client.sendCheer(CH, "🎉")).rejects.toThrow(/Not in the room/);
    await client.joinRoom(CH);
    fake.s.sendResult = { isOk: false, code: 20604, msg: "too fast" };
    await expect(client.sendCheer(CH, "🎉")).rejects.toMatchObject({ code: 20604 });
  });
});

describe("leave and disconnect", () => {
  it("exits the room, removes its handlers, disconnects the engine and reports disconnected", async () => {
    await connected();
    await client.joinRoom(CH);
    await client.leaveRoom(CH);
    expect(fake.exited).toEqual([CH]);
    await client.joinRoom(CH);
    await client.disconnect();
    expect(fake.exited).toEqual([CH, CH]);
    expect(fake.s.disconnected).toBe(1);
    expect(fake.handlers.message.size + fake.handlers.connection.size + fake.handlers.open.size).toBe(0);
    expect(events.connection?.at(-1)).toBe("disconnected");
  });

  it("two clients in one page get separate handler ids and unsubscribed listeners stop receiving", async () => {
    await connected();
    const other = createNexconnClient();
    await other.connect({ mode: "nexconn", userId: "u_o", appKey: "key1", token: "t2" });
    expect(fake.handlers.message.size).toBe(2);
    const seen: string[] = [];
    const off = client.on("notice", (n) => seen.push(n.text));
    await client.joinRoom(CH);
    narrator("CP:Notice", { t: "notice", text: "one" });
    off();
    narrator("CP:Notice", { t: "notice", text: "two" });
    expect(seen).toEqual(["one"]);
  });
});
