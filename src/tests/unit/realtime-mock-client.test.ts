import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockClient } from "@/lib/realtime/mock.client";
import type { ClientCreds, ConnectionStatus, PublicState } from "@/lib/realtime/types";

// A just-enough EventSource: tests drive open/error/message by hand.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private handlers = new Map<string, ((e: { data: string }) => void)[]>();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(name: string, cb: (e: { data: string }) => void) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), cb]);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  fail() {
    this.onerror?.();
  }
  emit(name: string, data: unknown) {
    for (const cb of this.handlers.get(name) ?? []) cb({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
}

const creds: ClientCreds = { mode: "mock", userId: "u_me" };
const CHANNEL = "cp_ABCDE";
const hook = () => (globalThis as unknown as { __cpMock?: { drop(ms: number): void } }).__cpMock;
const last = () => FakeEventSource.instances[FakeEventSource.instances.length - 1];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  fetchMock = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as { __cpMock?: unknown }).__cpMock;
});

async function joined() {
  const client = createMockClient();
  const statuses: ConnectionStatus[] = [];
  client.on("connection", (s) => statuses.push(s));
  await client.connect(creds);
  const p = client.joinRoom(CHANNEL);
  last().open();
  await p;
  return { client, statuses };
}

describe("mock realtime client", () => {
  it("opens the channel stream and reports connecting then connected", async () => {
    const { statuses } = await joined();
    expect(last().url).toBe(`/api/mock/stream?channel=${CHANNEL}`);
    expect(statuses).toEqual(["connecting", "connected"]);
  });

  it("re-joining a live channel after a drop does not reopen the stream (no reconnect loop, B5)", async () => {
    const { client, statuses } = await joined();
    hook()!.drop(1000);
    await vi.advanceTimersByTimeAsync(1000);
    last().open(); // stream back: useRoom re-joins on "connected"
    const before = FakeEventSource.instances.length;
    await client.joinRoom(CHANNEL);
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeEventSource.instances.length).toBe(before);
    expect(last().closed).toBe(false);
    expect(statuses).toEqual(["connecting", "connected", "disconnected", "connecting", "connected"]);
  });

  it("joinRoom does not hang when the server never answers", async () => {
    const client = createMockClient();
    await client.connect(creds);
    const p = client.joinRoom(CHANNEL);
    await vi.advanceTimersByTimeAsync(4100);
    await expect(p).resolves.toBeUndefined();
  });

  it("delivers server events to subscribers and stops after unsubscribe", async () => {
    const { client } = await joined();
    const states: PublicState[] = [];
    const ideas: unknown[] = [];
    const off = client.on("state", (s) => states.push(s));
    client.on("idea", (i) => ideas.push(i));
    last().emit("state", { v: 3, phase: "STORM" });
    last().emit("idea", { t: "idea", roundNo: 1, text: "hi", clientMsgId: "abcdefgh", name: "A", userId: "u_a" });
    expect(states).toHaveLength(1);
    expect(states[0].v).toBe(3);
    expect(ideas).toHaveLength(1);
    off();
    last().emit("state", { v: 4 });
    expect(states).toHaveLength(1);
  });

  it("covers every event the contract lists and survives a malformed frame", async () => {
    const { client } = await joined();
    const seen: string[] = [];
    for (const ev of ["tally", "cheer", "moderation", "receipt", "notice"] as const) client.on(ev, () => seen.push(ev));
    for (const ev of ["tally", "cheer", "moderation", "receipt", "notice"]) last().emit(ev, { t: ev });
    last().emit("state", "{not json");
    expect(seen).toEqual(["tally", "cheer", "moderation", "receipt", "notice"]);
  });

  it("reconnects with exponential backoff after a stream error, and resets once connected", async () => {
    const { statuses } = await joined();
    const first = last();
    first.fail();
    expect(first.closed).toBe(true);
    expect(statuses.at(-1)).toBe("disconnected");

    await vi.advanceTimersByTimeAsync(499);
    expect(FakeEventSource.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeEventSource.instances).toHaveLength(2); // after 500 ms
    expect(statuses.at(-1)).toBe("connecting");

    last().fail();
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeEventSource.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeEventSource.instances).toHaveLength(3); // after 1000 ms

    last().fail();
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeEventSource.instances).toHaveLength(4); // after 2000 ms

    last().open();
    expect(statuses.at(-1)).toBe("connected");
    last().fail();
    await vi.advanceTimersByTimeAsync(500);
    expect(FakeEventSource.instances).toHaveLength(5); // backoff reset to 500 ms
  });

  it("caps the backoff at 8 s", async () => {
    await joined();
    for (let i = 0; i < 8; i++) {
      last().fail();
      await vi.advanceTimersByTimeAsync(8000);
    }
    const before = FakeEventSource.instances.length;
    last().fail();
    await vi.advanceTimersByTimeAsync(7999);
    expect(FakeEventSource.instances).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeEventSource.instances).toHaveLength(before + 1);
  });

  describe("window.__cpMock.drop (B5 test hook)", () => {
    it("closes the stream, goes disconnected, stays down for the duration, then reconnects", async () => {
      const { statuses } = await joined();
      const dropped = last();
      expect(hook()).toBeDefined();

      hook()!.drop(3000);
      expect(dropped.closed).toBe(true);
      expect(statuses.at(-1)).toBe("disconnected");

      await vi.advanceTimersByTimeAsync(2900);
      expect(FakeEventSource.instances).toHaveLength(1);
      expect(statuses.at(-1)).toBe("disconnected");

      await vi.advanceTimersByTimeAsync(100);
      expect(FakeEventSource.instances).toHaveLength(2);
      expect(statuses.at(-1)).toBe("connecting");
      last().open();
      expect(statuses.at(-1)).toBe("connected");
      expect(statuses.slice(-3)).toEqual(["disconnected", "connecting", "connected"]);
    });

    it("sends fail while dropped, as they would on a dead connection", async () => {
      const { client } = await joined();
      hook()!.drop(2000);
      await expect(client.sendCheer(CHANNEL, "🔥")).rejects.toThrow(/offline/i);
      expect(fetchMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);
      await expect(client.sendCheer(CHANNEL, "🔥")).resolves.toBeUndefined();
    });

    it("an error during the outage does not bring the stream back early", async () => {
      await joined();
      hook()!.drop(5000);
      await vi.advanceTimersByTimeAsync(4000);
      expect(FakeEventSource.instances).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(FakeEventSource.instances).toHaveLength(2);
    });
  });

  describe("sending", () => {
    it("posts ideas and cheers to /api/mock/send", async () => {
      const { client } = await joined();
      const idea = { t: "idea" as const, roundNo: 2, text: "Dig a tunnel", clientMsgId: "client-msg-0001", name: "Me" };
      await client.sendIdea(CHANNEL, idea);
      await client.sendCheer(CHANNEL, "🎉");
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      expect(calls[0][0]).toBe("/api/mock/send");
      expect(JSON.parse(String(calls[0][1].body))).toEqual({ channelId: CHANNEL, objectName: "CP:Idea", payload: idea });
      expect(JSON.parse(String(calls[1][1].body))).toEqual({ channelId: CHANNEL, objectName: "CP:Cheer", payload: { t: "cheer", emoji: "🎉" } });
    });

    it("surfaces the server's code and message when a send is refused", async () => {
      const { client } = await joined();
      fetchMock.mockResolvedValueOnce(Response.json({ ok: false, code: "MUTED", message: "The host has muted you for now." }, { status: 403 }));
      await expect(client.sendCheer(CHANNEL, "🎉")).rejects.toMatchObject({ message: "The host has muted you for now.", code: "MUTED" });
    });

    it("refuses to send before connect()", async () => {
      const client = createMockClient();
      await expect(client.sendCheer(CHANNEL, "🎉")).rejects.toThrow(/not connected/i);
    });
  });

  it("leaveRoom closes the stream without reconnecting", async () => {
    const { client } = await joined();
    const es = last();
    await client.leaveRoom(CHANNEL);
    expect(es.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("disconnect closes everything, reports disconnected and removes the test hook", async () => {
    const { client, statuses } = await joined();
    const es = last();
    await client.disconnect();
    expect(es.closed).toBe(true);
    expect(statuses.at(-1)).toBe("disconnected");
    expect(hook()).toBeUndefined();
  });
});
