// Mock realtime transport (server side): an in-memory bus. Used by tests and credential-less dev only;
// production runs on Nexconn (config.assertBootable refuses the mock there).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../config";
import { AppError } from "../errors";
import { log } from "../log";
import {
  OBJECT_NAMES,
  type IncomingMessage,
  type PublicState,
  type ReceiptPayload,
  type RealtimeServer,
  type RoomMessage,
} from "./types";

// ---------- Bus (process singleton: route bundles and instrumentation share it) ----------

/** One open SSE stream. userId is null for anonymous observers such as /screen. */
export type MockSubscriber = {
  userId: string | null;
  push(event: string, data: unknown): void;
  close(): void;
};

type Bus = {
  channels: Map<string, Set<MockSubscriber>>;
  users: Map<string, Set<MockSubscriber>>;
  muted: Map<string, Set<string>>;
  banned: Map<string, Set<string>>;
  names: Map<string, string>;
};

const g = globalThis as unknown as { __cpMockBus?: Bus };

function bus(): Bus {
  return (g.__cpMockBus ??= { channels: new Map(), users: new Map(), muted: new Map(), banned: new Map(), names: new Map() });
}

function deliver(sub: MockSubscriber, event: string, data: unknown): boolean {
  try {
    sub.push(event, data);
    return true;
  } catch (err) {
    log.debug({ err }, "mock bus: dropping dead subscriber");
    return false;
  }
}

function addTo<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const set = map.get(key) ?? new Set<V>();
  set.add(value);
  map.set(key, set);
}

function removeFrom<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const set = map.get(key);
  if (!set) return;
  set.delete(value);
  if (set.size === 0) map.delete(key);
}

export const mockBus = {
  /** Register a stream on a channel (and on its user's receipt feed). Returns the unsubscribe function. */
  subscribe(channelId: string, sub: MockSubscriber): () => void {
    const b = bus();
    addTo(b.channels, channelId, sub);
    if (sub.userId) addTo(b.users, sub.userId, sub);
    return () => {
      removeFrom(b.channels, channelId, sub);
      if (sub.userId) removeFrom(b.users, sub.userId, sub);
    };
  },
  /** Send to everyone on the channel except `exceptUserId` (providers do not echo to the sender). */
  broadcast(channelId: string, event: string, data: unknown, exceptUserId?: string): void {
    for (const sub of [...(bus().channels.get(channelId) ?? [])]) {
      if (exceptUserId && sub.userId === exceptUserId) continue;
      if (!deliver(sub, event, data)) mockBus.drop(channelId, sub);
    }
  },
  /** Send to every open stream of one user. Returns whether anyone received it. */
  toUser(userId: string, event: string, data: unknown): boolean {
    let delivered = false;
    for (const sub of [...(bus().users.get(userId) ?? [])]) {
      if (deliver(sub, event, data)) delivered = true;
    }
    return delivered;
  },
  drop(channelId: string, sub: MockSubscriber): void {
    removeFrom(bus().channels, channelId, sub);
    if (sub.userId) removeFrom(bus().users, sub.userId, sub);
  },
  isMuted: (channelId: string, userId: string): boolean => bus().muted.get(channelId)?.has(userId) ?? false,
  isBanned: (channelId: string, userId: string): boolean => bus().banned.get(channelId)?.has(userId) ?? false,
  /** Tests: close every stream and forget all state. */
  reset(): void {
    const b = bus();
    for (const subs of b.channels.values()) for (const sub of subs) sub.close();
    g.__cpMockBus = undefined;
  },
};

/** Mock-only routes answer 404 in any other mode, as if they did not exist. */
export function assertMockMode(): void {
  if (env().REALTIME_MODE !== "mock") throw new AppError("NOT_FOUND", "Not found.", 404);
}

// ---------- Webhook signing (documented scheme, mock only) ----------
//
//   x-cp-timestamp: epoch milliseconds when the request was signed
//   x-cp-signature: hex( HMAC-SHA256( secret, `${timestamp}.${rawBody}` ) )
//   secret:         NEXCONN_WEBHOOK_SECRET, or a fixed dev secret when unset
//   body:           {"messages":[IncomingMessage, ...]}
//
// Requests with a bad signature, or a timestamp more than 5 minutes from now, are rejected.
// The real Nexconn scheme is implemented separately by the Nexconn adapter.

export const MOCK_WEBHOOK_TIMESTAMP_HEADER = "x-cp-timestamp";
export const MOCK_WEBHOOK_SIGNATURE_HEADER = "x-cp-signature";
export const MOCK_WEBHOOK_MAX_AGE_MS = 5 * 60_000;
const DEV_WEBHOOK_SECRET = "crowdplay-dev-only-webhook-secret";

const webhookSecret = (): string => env().NEXCONN_WEBHOOK_SECRET ?? DEV_WEBHOOK_SECRET;

function signature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Headers a provider would send for `rawBody`. Tests use `timestamp`/`secret` to forge stale or wrong ones. */
export function signMockWebhook(rawBody: string, opts: { timestamp?: number; secret?: string } = {}): Record<string, string> {
  const timestamp = String(opts.timestamp ?? Date.now());
  return {
    [MOCK_WEBHOOK_TIMESTAMP_HEADER]: timestamp,
    [MOCK_WEBHOOK_SIGNATURE_HEADER]: signature(opts.secret ?? webhookSecret(), timestamp, rawBody),
  };
}

const WireBody = z.object({
  messages: z
    .array(
      z.object({
        providerMsgId: z.string().min(1).max(200),
        channelId: z.string().min(1).max(100),
        fromUserId: z.string().min(1).max(100),
        objectName: z.string().min(1).max(50),
        payload: z.unknown(),
        sentAt: z.number(),
      }),
    )
    .max(500),
});

function signatureMatches(expectedHex: string, givenHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(givenHex)) return false;
  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(givenHex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- RealtimeServer ----------

export class MockRealtimeServer implements RealtimeServer {
  readonly kind = "mock" as const;

  async ensureUser(_u: { id: string; name: string }): Promise<{ token: string }> {
    return { token: `mock_${randomBytes(16).toString("hex")}` };
  }

  async ensureChannel(channelId: string, name: string): Promise<void> {
    bus().names.set(channelId, name);
  }

  async configurePriorities(): Promise<void> {}

  async publishState(channelId: string, state: PublicState, _opts: { phaseChanged: boolean }): Promise<void> {
    mockBus.broadcast(channelId, "state", state);
  }

  async publishTally(channelId: string, v: number, roundNo: number, tally: Record<string, number>, total: number): Promise<void> {
    mockBus.broadcast(channelId, "tally", { t: "tally", v, roundNo, tally, total });
  }

  async sendRoomMessage(channelId: string, fromUserId: string, msg: RoomMessage): Promise<void> {
    switch (msg.t) {
      case "idea":
        mockBus.broadcast(channelId, "idea", { ...msg, userId: fromUserId });
        break;
      case "cheer":
        mockBus.broadcast(channelId, "cheer", { ...msg, userId: fromUserId });
        break;
      case "notice":
        mockBus.broadcast(channelId, "notice", msg);
        break;
      case "mod":
        mockBus.broadcast(channelId, "moderation", msg);
        break;
    }
  }

  async sendReceipt(toUserId: string, receipt: ReceiptPayload): Promise<boolean> {
    return mockBus.toUser(toUserId, "receipt", receipt);
  }

  async moderate(channelId: string, userId: string, action: "mute" | "ban" | "unmute" | "unban"): Promise<void> {
    const b = bus();
    const map = action === "mute" || action === "unmute" ? b.muted : b.banned;
    if (action === "mute" || action === "ban") addTo(map, channelId, userId);
    else removeFrom(map, channelId, userId);
  }

  async countParticipants(channelId: string): Promise<number | null> {
    const users = new Set<string>();
    for (const sub of bus().channels.get(channelId) ?? []) if (sub.userId) users.add(sub.userId);
    return users.size;
  }

  async verifyWebhook(req: Request, rawBody: string): Promise<IncomingMessage[] | null> {
    const timestamp = req.headers.get(MOCK_WEBHOOK_TIMESTAMP_HEADER);
    const given = req.headers.get(MOCK_WEBHOOK_SIGNATURE_HEADER);
    if (!timestamp || !given) return null;
    const signedAt = Number(timestamp);
    if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > MOCK_WEBHOOK_MAX_AGE_MS) return null;
    if (!signatureMatches(signature(webhookSecret(), timestamp, rawBody), given)) return null;
    try {
      return WireBody.parse(JSON.parse(rawBody)).messages;
    } catch {
      return null;
    }
  }

  async destroyChannel(channelId: string): Promise<void> {
    const b = bus();
    for (const sub of [...(b.channels.get(channelId) ?? [])]) {
      mockBus.drop(channelId, sub);
      sub.close();
    }
    b.muted.delete(channelId);
    b.banned.delete(channelId);
    b.names.delete(channelId);
  }
}

/** Object names clients may publish to a room (everything else is server-only). */
export const CLIENT_OBJECT_NAMES: readonly string[] = [OBJECT_NAMES.idea, OBJECT_NAMES.cheer];
