// Nexconn server adapter: RealtimeServer on top of @nexconn/server-sdk. With nexconn.client.ts this is the only
// code that imports Nexconn packages (CLAUDE.md hard rule 2). Every call below was checked against the installed
// typings (node_modules/@nexconn/server-sdk/dist/api.d.ts); docs/NEXCONN_FINDINGS.md lists what is still unverified live.
//
// Failure policy: every call has a 4 s timeout and is wrapped, HTTP-200 business errors (`code !== 0`) are treated
// as failures, and nothing throws into the engine except where the interface implies failure (ensureUser needs a
// token, ensureChannel must tell the room-creation path the channel is not there). Clients fall back to HTTP.
import { createHash, timingSafeEqual } from "node:crypto";
import type * as ServerSdk from "@nexconn/server-sdk";
import { env } from "../config";
import { blocklistWords } from "../ingest/blocklist";
import { log } from "../log";
import {
  encodeEnvelope,
  encodeStateMessage,
  isNarratorOnly,
  objectNameForRoomMessage,
  parseWebhookEnvelope,
  wireMetadata,
  wireTallyMetadata,
  type EnvelopeMode,
} from "./nexconn.codec";
import {
  NARRATOR_USER_ID,
  OBJECT_NAMES,
  type IncomingMessage,
  type PublicState,
  type RealtimeServer,
  type ReceiptPayload,
  type RoomMessage,
} from "./types";

type Sdk = typeof ServerSdk;

const CALL_TIMEOUT_MS = 4000;
/** Longest documented auto-destroy: inactivity mode, 10,080 minutes (7 days). Docs: platform-chat-api/open-channel/set-destroy-type. */
const KEEP_ALIVE = { destroyType: 0, ttlMinutes: 10_080 } as const;
/** Mute and ban durations are mandatory; 43,200 minutes (30 days) is the documented maximum. */
const MAX_MODERATION_MINUTES = 43_200;
const WEBHOOK_MAX_AGE_MS = 5 * 60_000;
const SENDER_RETRY_MS = 60_000;
const NARRATOR_NAME = "CrowdPlay Narrator";
const PROFANITY_BATCH = 50;
/** Business codes from docs.nexconn.ai/platform-chat-api/code. */
const CODE = { CHANNEL_MISSING: 23410, CHANNEL_EXISTS: 23435, SERVICE_NOT_ENABLED: 1009 } as const;

const PRIORITY_TYPES: readonly string[] = [OBJECT_NAMES.state, OBJECT_NAMES.moderation];
const LOW_PRIORITY_TYPES: readonly string[] = [OBJECT_NAMES.idea, OBJECT_NAMES.cheer];

// ---------- per-process state (route bundles and instrumentation do not share modules) ----------

type Apis = {
  users: InstanceType<Sdk["UserManagementApi"]>;
  channels: InstanceType<Sdk["OpenChannelManagementApi"]>;
  messages: InstanceType<Sdk["MessageManagementApi"]>;
  metadata: InstanceType<Sdk["OpenChannelMetadataApi"]>;
  priority: InstanceType<Sdk["OpenChannelPriorityControlsApi"]>;
  lowPriority: InstanceType<Sdk["OpenChannelMessagePriorityApi"]>;
  participants: InstanceType<Sdk["OpenChannelParticipantsModerationApi"]>;
  system: InstanceType<Sdk["SystemMessagesApi"]>;
  profanity: InstanceType<Sdk["ModerationApi"]>;
};
type SenderState = { ok: boolean; at: number; pending?: Promise<void> };
type Proc = {
  key: string;
  apis: Promise<Apis>;
  senders: Map<string, SenderState>;
  channels: Set<string>;
  prioritiesDone: boolean;
  configuring: Promise<void> | null;
  profanityTried: boolean;
};
const g = globalThis as unknown as { __cpNexconn?: Proc };

type Creds = { appKey: string; appSecret: string; primary: string; secondary: string; webhookSecret: string };

const withScheme = (d: string): string => (/^https?:\/\//i.test(d) ? d : `https://${d}`).replace(/\/+$/, "");

function creds(): Creds {
  const e = env();
  const missing = (
    [
      ["NEXCONN_APP_KEY", e.NEXCONN_APP_KEY],
      ["NEXCONN_APP_SECRET", e.NEXCONN_APP_SECRET],
      ["NEXCONN_PRIMARY_API_DOMAIN", e.NEXCONN_PRIMARY_API_DOMAIN],
      ["NEXCONN_SECONDARY_API_DOMAIN", e.NEXCONN_SECONDARY_API_DOMAIN],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`Nexconn adapter needs ${missing.join(", ")}`);
  const appSecret = e.NEXCONN_APP_SECRET as string;
  return {
    appKey: e.NEXCONN_APP_KEY as string,
    appSecret,
    primary: withScheme(e.NEXCONN_PRIMARY_API_DOMAIN as string),
    secondary: withScheme(e.NEXCONN_SECONDARY_API_DOMAIN as string),
    // The documented webhook scheme signs with the App Secret; NEXCONN_WEBHOOK_SECRET only overrides it when set.
    webhookSecret: e.NEXCONN_WEBHOOK_SECRET ?? appSecret,
  };
}

async function buildApis(c: Creds): Promise<Apis> {
  const sdk = await import("@nexconn/server-sdk");
  // One Configuration per process: it holds the primary/backup failover counters.
  const cfg = new sdk.Configuration({ baseOptions: { timeout: CALL_TIMEOUT_MS } });
  cfg.setNexconnCredentials(c.appKey, c.appSecret);
  cfg.setPrimaryBackupDomains(c.primary, c.secondary);
  return {
    users: new sdk.UserManagementApi(cfg),
    channels: new sdk.OpenChannelManagementApi(cfg),
    messages: new sdk.MessageManagementApi(cfg),
    metadata: new sdk.OpenChannelMetadataApi(cfg),
    priority: new sdk.OpenChannelPriorityControlsApi(cfg),
    lowPriority: new sdk.OpenChannelMessagePriorityApi(cfg),
    participants: new sdk.OpenChannelParticipantsModerationApi(cfg),
    system: new sdk.SystemMessagesApi(cfg),
    profanity: new sdk.ModerationApi(cfg),
  };
}

function proc(): Proc {
  const c = creds();
  const key = createHash("sha256").update([c.appKey, c.appSecret, c.primary, c.secondary].join("\n")).digest("hex");
  if (g.__cpNexconn?.key !== key) {
    const apis = buildApis(c);
    apis.catch(() => {}); // surfaced where it is awaited; do not also report it as unhandled
    g.__cpNexconn = { key, apis, senders: new Map(), channels: new Set(), prioritiesDone: false, configuring: null, profanityTried: false };
  }
  return g.__cpNexconn;
}

/** Tests: forget the cached SDK clients and per-process memos. */
export function resetNexconnServer(): void {
  g.__cpNexconn = undefined;
}

// ---------- one wrapper for every SDK call ----------

type Reply = { code: number };
type ReqOpts = { timeout: number; signal: AbortSignal };
type Outcome<T extends Reply> = { ok: boolean; code: number; message: string; data: T | null };

function describeError(err: unknown): { code: number; httpStatus?: number; message: string } {
  const e = err as { errorCode?: unknown; httpStatus?: unknown; errorMessage?: unknown; message?: unknown } | null;
  const message = typeof e?.errorMessage === "string" ? e.errorMessage : typeof e?.message === "string" ? e.message : String(err);
  return {
    code: typeof e?.errorCode === "number" ? e.errorCode : -1,
    httpStatus: typeof e?.httpStatus === "number" ? e.httpStatus : undefined,
    message,
  };
}

/**
 * Run one SDK call with a 4 s timeout. Never throws. Thrown ApiExceptions (non-2xx) and HTTP-200 replies with
 * `code !== 0` both come back as `ok: false` with the business code; `tolerate` lists codes that are expected.
 */
async function call<T extends Reply>(
  op: string,
  send: (o: ReqOpts) => Promise<{ data: T }>,
  ctx: Record<string, unknown> = {},
  tolerate: readonly number[] = [],
): Promise<Outcome<T>> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new Error(`timed out after ${CALL_TIMEOUT_MS} ms`));
    }, CALL_TIMEOUT_MS);
  });
  let out: Outcome<T>;
  try {
    const res = await Promise.race([send({ timeout: CALL_TIMEOUT_MS, signal: ctl.signal }), expired]);
    const code = res?.data?.code;
    if (typeof code !== "number") out = { ok: false, code: -1, message: "unexpected response shape", data: null };
    else out = { ok: code === 0, code, message: code === 0 ? "" : `business code ${code}`, data: res.data };
  } catch (err) {
    const d = describeError(err);
    out = { ok: false, code: d.code, message: d.message, data: null };
    if (!tolerate.includes(d.code)) log.warn({ op, code: d.code, httpStatus: d.httpStatus, message: d.message, ...ctx }, "nexconn call failed");
    return out;
  } finally {
    clearTimeout(timer);
  }
  if (!out.ok) {
    const fields = { op, code: out.code, ...ctx };
    if (tolerate.includes(out.code)) log.debug(fields, "nexconn call returned an expected business code");
    else log.warn(fields, "nexconn call returned a business error");
  }
  return out;
}

async function guarded(op: string, ctx: Record<string, unknown>, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    log.error({ err, op, ...ctx }, "nexconn adapter call failed");
  }
}

const envelopeMode = (): EnvelopeMode => (/^(1|true)$/i.test(process.env.NEXCONN_TEXT_ENVELOPE ?? "") ? "text" : "custom");

const displayName = (n: string | undefined, fallback: string): string => (n?.trim() ? n.trim().slice(0, 64) : fallback.slice(0, 64));

// ---------- shared steps ----------

/** Message senders (narrator, bots) must exist as users; register each once per process (retry a failure after 60 s). */
async function ensureSender(a: Apis, p: Proc, userId: string, name?: string): Promise<void> {
  const known = p.senders.get(userId);
  if (known?.pending) return known.pending;
  if (known && (known.ok || Date.now() - known.at < SENDER_RETRY_MS)) return;
  const state: SenderState = { ok: false, at: Date.now() };
  state.pending = call("issueAccessToken", (o) => a.users.issueAccessToken({ userId, name: displayName(name, userId) }, o), { userId }).then((r) => {
    state.ok = r.ok;
    state.at = Date.now();
    state.pending = undefined;
  });
  p.senders.set(userId, state);
  return state.pending;
}

function sendToChannel(a: Apis, channelId: string, fromUserId: string, enc: { messageType: string; content: string }): Promise<Outcome<{ code: number }>> {
  return call(
    "sendOpenChannelMessage",
    // shouldPersist 0: the server archives in Postgres, and the cloud-retention service need not be enabled.
    (o) => a.messages.sendOpenChannelMessage({ fromUserId, toChannelIds: [channelId], messageType: enc.messageType, content: enc.content, shouldPersist: 0 }, o),
    { channelId, messageType: enc.messageType },
  );
}

async function setMetadata(a: Apis, channelId: string, entries: Record<string, string>): Promise<void> {
  const keys = Object.keys(entries);
  for (let i = 0; i < keys.length; i += 20) {
    const metadata: Record<string, string> = {};
    for (const k of keys.slice(i, i + 20)) metadata[k] = entries[k];
    // metadataOwnerId = narrator, shouldAutoDelete 0: the keys must outlive the narrator's (non-)presence in the channel.
    await call(
      "batchSetOpenChannelMetadata",
      (o) => a.metadata.batchSetOpenChannelMetadata({ channelId, metadataOwnerId: NARRATOR_USER_ID, metadata, shouldAutoDelete: 0 }, o),
      { channelId, keys: Object.keys(metadata).length },
    );
  }
}

async function ensurePriorityTypes(a: Apis, kind: "priority" | "low"): Promise<boolean> {
  const wanted = kind === "priority" ? PRIORITY_TYPES : LOW_PRIORITY_TYPES;
  const list = await call(kind === "priority" ? "getOpenChannelPriorityMessageTypeList" : "getOpenChannelLowPriorityMessageTypeList", (o) =>
    kind === "priority" ? a.priority.getOpenChannelPriorityMessageTypeList(o) : a.lowPriority.getOpenChannelLowPriorityMessageTypeList(o),
  );
  if (!list.ok) return list.code === CODE.SERVICE_NOT_ENABLED; // not enabled in the Console: nothing to retry
  const have = new Set(list.data?.result?.messageTypes ?? []);
  const missing = wanted.filter((t) => !have.has(t));
  if (missing.length === 0) return true;
  const added = await call(
    kind === "priority" ? "addOpenChannelPriorityMessageTypeList" : "addOpenChannelLowPriorityMessageTypeList",
    (o) =>
      kind === "priority"
        ? a.priority.addOpenChannelPriorityMessageTypeList({ messageTypes: missing }, o)
        : a.lowPriority.addOpenChannelLowPriorityMessageTypeList({ messageTypes: missing }, o),
    { messageTypes: missing },
  );
  return added.ok;
}

/** Best effort: mirror the app's blocklist (English first) into the provider's profanity list, within its quota. */
async function syncProfanity(a: Apis): Promise<void> {
  const existing = await call("listProfanityWords", (o) => a.profanity.listProfanityWords({ filterType: "2" }, o));
  if (!existing.ok) return;
  const have = new Set((existing.data?.result?.words ?? []).map((w) => (w.word ?? "").toLowerCase()));
  let todo = blocklistWords(true).filter((w) => w.length > 0 && w.length <= 32 && !have.has(w.toLowerCase()));
  let quota: number | null = null;
  for (let round = 0; round < 12 && todo.length > 0; round++) {
    const size = Math.min(PROFANITY_BATCH, quota ?? PROFANITY_BATCH, todo.length);
    const batch = todo.slice(0, size);
    const r = await call("batchAddProfanityWords", (o) => a.profanity.batchAddProfanityWords({ words: batch.map((word) => ({ word })) }, o), { words: size });
    const remaining = r.data?.result?.remainingQuota;
    if (!r.ok) {
      // "If adding the batch exceeds the limit, the entire request fails and the response includes the remaining quota."
      if (typeof remaining === "number" && remaining > 0 && remaining < size) {
        quota = remaining;
        continue;
      }
      return;
    }
    todo = todo.slice(size);
    quota = typeof remaining === "number" ? remaining : null;
    if (quota === 0) return;
  }
}

const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Nexconn webhook signature: hex(sha1(AppSecret + Nonce + Timestamp)). The request body is not covered. */
export function webhookSignature(secret: string, nonce: string, timestamp: string): string {
  return createHash("sha1").update(secret + nonce + timestamp).digest("hex");
}

// ---------- RealtimeServer ----------

class NexconnRealtimeServer implements RealtimeServer {
  readonly kind = "nexconn" as const;

  async ensureUser(u: { id: string; name: string }): Promise<{ token: string }> {
    const p = proc();
    const a = await p.apis;
    const r = await call("issueAccessToken", (o) => a.users.issueAccessToken({ userId: u.id, name: displayName(u.name, u.id) }, o), { userId: u.id });
    const token = r.data?.result?.accessToken;
    if (!r.ok || !token) throw new Error(`Nexconn did not issue a token (code ${r.code}${r.message ? `: ${r.message}` : ""})`);
    p.senders.set(u.id, { ok: true, at: Date.now() });
    return { token };
  }

  async ensureChannel(channelId: string, _name: string): Promise<void> {
    const p = proc();
    if (p.channels.has(channelId)) return;
    const a = await p.apis;
    const [created] = await Promise.all([
      call("createOpenChannel", (o) => a.channels.createOpenChannel({ channelId }, o), { channelId }, [CODE.CHANNEL_EXISTS]),
      ensureSender(a, p, NARRATOR_USER_ID, NARRATOR_NAME),
    ]);
    if (!created.ok && created.code !== CODE.CHANNEL_EXISTS) {
      throw new Error(`Nexconn could not create channel ${channelId} (code ${created.code}${created.message ? `: ${created.message}` : ""})`);
    }
    // The destroy type is applied after creation so an app that rejects an explicit TTL at creation still gets its channel.
    await Promise.all([
      call("setOpenChannelDestroyType", (o) => a.channels.setOpenChannelDestroyType({ channelId, ...KEEP_ALIVE }, o), { channelId }),
      // Per-channel and never dropped under load: the narrator carries state, tally and moderation.
      call("addOpenChannelPrioritySenderList", (o) => a.priority.addOpenChannelPrioritySenderList({ channelId, participantIds: [NARRATOR_USER_ID] }, o), { channelId }, [CODE.SERVICE_NOT_ENABLED]),
    ]);
    p.channels.add(channelId);
  }

  async configurePriorities(): Promise<void> {
    try {
      const p = proc();
      if (!p.configuring) {
        p.configuring = (async () => {
          const a = await p.apis;
          if (!p.prioritiesDone) {
            const [prio, low] = await Promise.all([ensurePriorityTypes(a, "priority"), ensurePriorityTypes(a, "low")]);
            p.prioritiesDone = prio && low;
          }
          if (!p.profanityTried) {
            p.profanityTried = true;
            await syncProfanity(a);
          }
        })().finally(() => {
          p.configuring = null;
        });
      }
      await p.configuring;
    } catch (err) {
      log.warn({ err }, "nexconn priorities not configured");
    }
  }

  async publishState(channelId: string, state: PublicState, opts: { phaseChanged: boolean }): Promise<void> {
    await guarded("publishState", { channelId, v: state.v }, async () => {
      const p = proc();
      const a = await p.apis;
      await ensureSender(a, p, NARRATOR_USER_ID, NARRATOR_NAME);
      const { entries, dropped } = wireMetadata(state);
      if (dropped.length) log.warn({ channelId, dropped }, "metadata value too large; left to HTTP and CP:State");
      const steps: Promise<unknown>[] = [setMetadata(a, channelId, entries)];
      if (opts.phaseChanged) {
        const enc = encodeStateMessage(state, envelopeMode());
        if (enc) steps.push(sendToChannel(a, channelId, NARRATOR_USER_ID, enc));
        else log.warn({ channelId, v: state.v }, "CP:State too large for one message; clients use metadata and HTTP");
      }
      await Promise.all(steps);
    });
  }

  async publishTally(channelId: string, v: number, roundNo: number, tally: Record<string, number>, total: number): Promise<void> {
    await guarded("publishTally", { channelId, v }, async () => {
      const p = proc();
      const a = await p.apis;
      await ensureSender(a, p, NARRATOR_USER_ID, NARRATOR_NAME);
      const enc = encodeEnvelope(OBJECT_NAMES.tally, { t: "tally", v, roundNo, tally, total }, envelopeMode());
      await Promise.all([setMetadata(a, channelId, wireTallyMetadata(v, tally, total)), sendToChannel(a, channelId, NARRATOR_USER_ID, enc)]);
    });
  }

  async sendRoomMessage(channelId: string, fromUserId: string, msg: RoomMessage): Promise<void> {
    await guarded("sendRoomMessage", { channelId, t: msg.t }, async () => {
      const p = proc();
      const a = await p.apis;
      const name = objectNameForRoomMessage(msg);
      // Notices and moderation are narrator output: clients drop them from any other sender.
      const sender = isNarratorOnly(name) ? NARRATOR_USER_ID : fromUserId;
      await ensureSender(a, p, sender, sender === NARRATOR_USER_ID ? NARRATOR_NAME : msg.t === "idea" ? msg.name : undefined);
      await sendToChannel(a, channelId, sender, encodeEnvelope(name, msg, envelopeMode()));
    });
  }

  async sendReceipt(toUserId: string, receipt: ReceiptPayload): Promise<boolean> {
    // "Accepted" is not "shown": the DB row exists regardless and /me lists the receipt for players who missed the toast.
    try {
      const p = proc();
      const a = await p.apis;
      await ensureSender(a, p, NARRATOR_USER_ID, NARRATOR_NAME);
      const enc = encodeEnvelope(OBJECT_NAMES.receipt, receipt, envelopeMode());
      const direct = await call(
        "sendDirectChannelMessage",
        (o) => a.messages.sendDirectChannelMessage({ fromUserId: NARRATOR_USER_ID, toUserIds: [toUserId], messageType: enc.messageType, content: enc.content, shouldPersist: 0, disablePush: true }, o),
        { toUserId },
      );
      if (direct.ok) return true;
      const system = await call(
        "sendSystemChannelMessage",
        (o) => a.system.sendSystemChannelMessage({ fromUserId: NARRATOR_USER_ID, toUserIds: [toUserId], messageType: enc.messageType, content: enc.content, shouldPersist: 0, disablePush: true }, o),
        { toUserId },
      );
      return system.ok;
    } catch (err) {
      log.warn({ err, toUserId }, "sendReceipt failed");
      return false;
    }
  }

  async moderate(channelId: string, userId: string, action: "mute" | "ban" | "unmute" | "unban"): Promise<void> {
    await guarded("moderate", { channelId, userId, action }, async () => {
      const a = await proc().apis;
      const ctx = { channelId, userId };
      const ids = [userId];
      const add = { channelId, participantIds: ids, durationMinutes: MAX_MODERATION_MINUTES };
      const remove = { channelId, participantIds: ids };
      switch (action) {
        case "mute":
          await call("addOpenChannelParticipantMuteList", (o) => a.participants.addOpenChannelParticipantMuteList(add, o), ctx);
          break;
        case "unmute":
          await call("removeOpenChannelParticipantMuteList", (o) => a.participants.removeOpenChannelParticipantMuteList(remove, o), ctx);
          break;
        case "ban":
          await call("addOpenChannelParticipantBanList", (o) => a.participants.addOpenChannelParticipantBanList(add, o), ctx);
          break;
        case "unban":
          await call("removeOpenChannelParticipantBanList", (o) => a.participants.removeOpenChannelParticipantBanList(remove, o), ctx);
          break;
      }
    });
  }

  async countParticipants(channelId: string): Promise<number | null> {
    try {
      const a = await proc().apis;
      const r = await call("listOpenChannelParticipants", (o) => a.participants.listOpenChannelParticipants({ channelId, pageSize: 1 }, o), { channelId });
      const total = r.data?.result?.total;
      return r.ok && typeof total === "number" ? total : null;
    } catch (err) {
      log.warn({ err, channelId }, "countParticipants failed");
      return null;
    }
  }

  async verifyWebhook(req: Request, rawBody: string): Promise<IncomingMessage[] | null> {
    try {
      const c = creds();
      const appKey = req.headers.get("AppKey");
      const nonce = req.headers.get("Nonce");
      const timestamp = req.headers.get("Timestamp");
      const given = req.headers.get("Signature");
      if (!appKey || !nonce || !timestamp || !given) return null;
      if (!safeEqual(appKey, c.appKey)) return null;
      if (nonce.length > 128 || !/^\d{10,16}$/.test(timestamp)) return null;
      if (Math.abs(Date.now() - Number(timestamp)) > WEBHOOK_MAX_AGE_MS) return null;
      if (!safeEqual(webhookSignature(c.webhookSecret, nonce, timestamp), given.toLowerCase())) return null;
      // The body is not signed: the messages are still untrusted and go through ingest's participant/phase/filter checks.
      return parseWebhookEnvelope(JSON.parse(rawBody));
    } catch (err) {
      log.warn({ err }, "webhook verification failed");
      return null;
    }
  }

  async destroyChannel(channelId: string): Promise<void> {
    await guarded("destroyChannel", { channelId }, async () => {
      const p = proc();
      const a = await p.apis;
      p.channels.delete(channelId);
      await call("destroyOpenChannels", (o) => a.channels.destroyOpenChannels({ channelIds: [channelId] }, o), { channelId }, [CODE.CHANNEL_MISSING]);
    });
  }
}

export function createNexconnServer(): RealtimeServer {
  return new NexconnRealtimeServer();
}
