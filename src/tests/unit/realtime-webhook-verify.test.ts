import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfig } from "@/lib/config";
import {
  MOCK_WEBHOOK_MAX_AGE_MS,
  MockRealtimeServer,
  signMockWebhook,
} from "@/lib/realtime/mock.server";
import type { IncomingMessage } from "@/lib/realtime/types";

const server = new MockRealtimeServer();

const msg: IncomingMessage = {
  providerMsgId: "m_1",
  channelId: "cp_ABCDE",
  fromUserId: "u_alice",
  objectName: "CP:Idea",
  payload: { t: "idea", roundNo: 1, text: "hello", clientMsgId: "client-msg-1", name: "Alice" },
  sentAt: 1_700_000_000_000,
};
const body = JSON.stringify({ messages: [msg] });

const request = (headers: Record<string, string>) => new Request("http://x/api/nexconn/webhook", { method: "POST", headers, body });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetConfig();
});

describe("mock webhook verification (C5)", () => {
  it("accepts a correctly signed, fresh request and returns the messages", async () => {
    const out = await server.verifyWebhook(request(signMockWebhook(body)), body);
    expect(out).toEqual([msg]);
  });

  it("rejects a bad signature", async () => {
    const headers = signMockWebhook(body);
    headers["x-cp-signature"] = "0".repeat(64);
    expect(await server.verifyWebhook(request(headers), body)).toBeNull();
  });

  it("rejects a signature made with the wrong secret", async () => {
    const headers = signMockWebhook(body, { secret: "not-the-secret" });
    expect(await server.verifyWebhook(request(headers), body)).toBeNull();
  });

  it("rejects a body that was changed after signing", async () => {
    const headers = signMockWebhook(body);
    const tampered = body.replace("hello", "hullo");
    expect(await server.verifyWebhook(request(headers), tampered)).toBeNull();
  });

  it("rejects a timestamp that was changed after signing", async () => {
    const headers = signMockWebhook(body);
    headers["x-cp-timestamp"] = String(Date.now() + 1);
    expect(await server.verifyWebhook(request(headers), body)).toBeNull();
  });

  it("rejects a stale timestamp even when the signature is valid", async () => {
    const stale = signMockWebhook(body, { timestamp: Date.now() - MOCK_WEBHOOK_MAX_AGE_MS - 1000 });
    expect(await server.verifyWebhook(request(stale), body)).toBeNull();
  });

  it("rejects a timestamp too far in the future", async () => {
    const future = signMockWebhook(body, { timestamp: Date.now() + MOCK_WEBHOOK_MAX_AGE_MS + 1000 });
    expect(await server.verifyWebhook(request(future), body)).toBeNull();
  });

  it("accepts a timestamp just inside the 5 minute window", async () => {
    const recent = signMockWebhook(body, { timestamp: Date.now() - (MOCK_WEBHOOK_MAX_AGE_MS - 5000) });
    expect(await server.verifyWebhook(request(recent), body)).toEqual([msg]);
  });

  it("rejects missing headers, a non-numeric timestamp and a non-hex signature", async () => {
    expect(await server.verifyWebhook(request({}), body)).toBeNull();
    const good = signMockWebhook(body);
    expect(await server.verifyWebhook(request({ "x-cp-timestamp": good["x-cp-timestamp"] }), body)).toBeNull();
    expect(await server.verifyWebhook(request({ "x-cp-signature": good["x-cp-signature"] }), body)).toBeNull();
    expect(await server.verifyWebhook(request({ ...good, "x-cp-timestamp": "yesterday" }), body)).toBeNull();
    expect(await server.verifyWebhook(request({ ...good, "x-cp-signature": "zz" }), body)).toBeNull();
  });

  it("rejects a validly signed body that is not the documented shape", async () => {
    for (const raw of ["not json", JSON.stringify({ messages: "nope" }), JSON.stringify([msg]), JSON.stringify({ messages: [{ providerMsgId: "x" }] })]) {
      expect(await server.verifyWebhook(request(signMockWebhook(raw)), raw)).toBeNull();
    }
  });

  it("signs with NEXCONN_WEBHOOK_SECRET when it is set", async () => {
    vi.stubEnv("NEXCONN_WEBHOOK_SECRET", "s3cret-from-the-console");
    resetConfig();
    const headers = signMockWebhook(body);
    expect(await server.verifyWebhook(request(headers), body)).toEqual([msg]);
    // A signature made with the dev default no longer verifies.
    const dev = signMockWebhook(body, { secret: "crowdplay-dev-only-webhook-secret" });
    expect(await server.verifyWebhook(request(dev), body)).toBeNull();
  });

  it("uses the injected clock for the age check", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T10:00:00Z"));
    const headers = signMockWebhook(body);
    vi.setSystemTime(new Date("2026-11-17T10:04:00Z"));
    expect(await server.verifyWebhook(request(headers), body)).toEqual([msg]);
    vi.setSystemTime(new Date("2026-11-17T10:06:00Z"));
    expect(await server.verifyWebhook(request(headers), body)).toBeNull();
  });
});
