// Pure encode/decode helpers shared by the Nexconn adapters and their tests.
// No Nexconn imports and no Node-only imports: the browser adapter bundles this file.
//
// Two wire encodings carry every CP:* payload (docs/NEXCONN_INTEGRATION.md U4):
//   custom  messageType = "CP:State" etc., content = the payload as a JSON string (default)
//   text    messageType = "RC:TxtMsg", content = {"content": <human line>, "extra": {"cp":1,"o":<objectName>,"p":<payload>}}
// Receivers decode both, so the sender can fall back to `text` (NEXCONN_TEXT_ENVELOPE=1) without a client change.
import { z } from "zod";
import {
  NARRATOR_USER_ID,
  OBJECT_NAMES,
  decodeMetadata,
  encodeMetadata,
  type ClientEvents,
  type IncomingMessage,
  type ObjectName,
  type PublicState,
  type RoomMessage,
} from "./types";

export const TEXT_MESSAGE_TYPE = "RC:TxtMsg";
/** Channel type numbers used by webhooks and by the Web SDK's ChannelType (docs/NEXCONN_SDK_NOTES.md §3.7, §4). */
export const CHANNEL_TYPE = { DIRECT: 1, OPEN: 4, SYSTEM: 6 } as const;
/** Documented metadata value limit is 4,096 characters; keep a margin. */
export const METADATA_VALUE_MAX_CHARS = 4000;
/** Documented open-channel message content limit is 10 KB; keep a margin. */
export const MESSAGE_MAX_BYTES = 9000;
const MAX_RECEIVED_CONTENT_CHARS = 20_000;
const MAX_WEBHOOK_ITEMS = 100;

export type EnvelopeMode = "custom" | "text";

const OBJECT_NAME_SET: ReadonlySet<string> = new Set(Object.values(OBJECT_NAMES));
export const isObjectName = (s: unknown): s is ObjectName => typeof s === "string" && OBJECT_NAME_SET.has(s);

/** Only the narrator may publish these; clients ignore them from anyone else (other players can send any registered type). */
const NARRATOR_ONLY: ReadonlySet<ObjectName> = new Set([
  OBJECT_NAMES.state,
  OBJECT_NAMES.tally,
  OBJECT_NAMES.moderation,
  OBJECT_NAMES.notice,
  OBJECT_NAMES.receipt,
]);
export const isNarratorOnly = (name: ObjectName): boolean => NARRATOR_ONLY.has(name);

/** Registration table for NCEngine.registerCustomMessages (same shape as the SDK's CustomMessageRegistration). */
export const CP_MESSAGE_REGISTRATIONS: readonly { messageType: string; isPersisted: boolean; isCounted: boolean; isStatusMessage?: boolean }[] = [
  { messageType: OBJECT_NAMES.idea, isPersisted: false, isCounted: false },
  { messageType: OBJECT_NAMES.cheer, isPersisted: false, isCounted: false, isStatusMessage: true },
  { messageType: OBJECT_NAMES.state, isPersisted: false, isCounted: false },
  { messageType: OBJECT_NAMES.tally, isPersisted: false, isCounted: false, isStatusMessage: true },
  { messageType: OBJECT_NAMES.moderation, isPersisted: false, isCounted: false },
  { messageType: OBJECT_NAMES.notice, isPersisted: false, isCounted: false },
  { messageType: OBJECT_NAMES.receipt, isPersisted: false, isCounted: false },
];

// ---------- outbound ----------

export function objectNameForRoomMessage(msg: RoomMessage): ObjectName {
  switch (msg.t) {
    case "idea":
      return OBJECT_NAMES.idea;
    case "cheer":
      return OBJECT_NAMES.cheer;
    case "notice":
      return OBJECT_NAMES.notice;
    case "mod":
      return OBJECT_NAMES.moderation;
  }
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A readable one-liner for the text encoding (what a plain chat UI would show). */
function humanLine(name: ObjectName, p: unknown): string {
  const o = (p ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  switch (name) {
    case OBJECT_NAMES.idea:
      return clip(`${str(o.name) || "Player"}: ${str(o.text)}`, 140);
    case OBJECT_NAMES.cheer:
      return `${str(o.name) || "Someone"} cheered ${str(o.emoji)}`.trim();
    case OBJECT_NAMES.state:
      return clip(`CrowdPlay: ${str(o.title)} - ${str(o.phase)} (round ${String(o.roundNo)}/${String(o.roundsTotal)})`, 140);
    case OBJECT_NAMES.tally:
      return `Votes so far: ${String(o.total)}`;
    case OBJECT_NAMES.moderation:
      return str(o.notice) || "A moderator removed some messages.";
    case OBJECT_NAMES.notice:
      return clip(str(o.text), 140);
    case OBJECT_NAMES.receipt:
      return clip(`${o.type === "CANON" ? "Your idea became canon" : "Your idea made the ballot"}: ${str(o.ideaText)}`, 140);
  }
}

export function encodeEnvelope(name: ObjectName, payload: unknown, mode: EnvelopeMode): { messageType: string; content: string } {
  if (mode === "custom") return { messageType: name, content: JSON.stringify(payload) };
  const extra = JSON.stringify({ cp: 1, o: name, p: payload });
  return { messageType: TEXT_MESSAGE_TYPE, content: JSON.stringify({ content: humanLine(name, payload), extra }) };
}

const byteLength = (s: string): number => new TextEncoder().encode(s).length;

/** CP:State message body; drops the optional i18n bundles when too large, null when it still does not fit (HTTP/metadata carry it). */
export function encodeStateMessage(state: PublicState, mode: EnvelopeMode): { messageType: string; content: string } | null {
  const candidates: PublicState[] = state.i18n ? [state, { ...state, i18n: undefined }] : [state];
  for (const c of candidates) {
    const enc = encodeEnvelope(OBJECT_NAMES.state, c, mode);
    if (byteLength(enc.content) <= MESSAGE_MAX_BYTES) return enc;
  }
  return null;
}

// ---------- inbound ----------

function toRecord(content: unknown): Record<string, unknown> | null {
  let v = content;
  if (typeof v === "string") {
    if (v.length > MAX_RECEIVED_CONTENT_CHARS) return null;
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Find the CP object name and payload in either encoding. No schema validation here. */
export function unwrapEnvelope(messageType: string, content: unknown): { objectName: ObjectName; payload: unknown } | null {
  if (isObjectName(messageType)) {
    const payload = toRecord(content);
    return payload ? { objectName: messageType, payload } : null;
  }
  if (messageType !== TEXT_MESSAGE_TYPE) return null;
  const body = toRecord(content);
  const extra = body ? toRecord(body.extra) : null;
  if (!extra || extra.cp !== 1 || !isObjectName(extra.o)) return null;
  return { objectName: extra.o, payload: extra.p };
}

const Idea = z.object({
  t: z.literal("idea"),
  roundNo: z.number().int().min(0),
  text: z.string().min(1).max(1000),
  clientMsgId: z.string().min(1).max(100),
  name: z.string().max(64),
  isBot: z.boolean().optional(),
});
const Cheer = z.object({ t: z.literal("cheer"), emoji: z.string().min(1).max(32), name: z.string().max(64).optional(), isBot: z.boolean().optional() });
const Tally = z.object({ t: z.literal("tally"), v: z.number(), roundNo: z.number(), tally: z.record(z.string(), z.number()), total: z.number() });
const Moderation = z.object({
  t: z.literal("mod"),
  hide: z.array(z.object({ userId: z.string(), clientMsgId: z.string() })).max(200).optional(),
  hideUserIds: z.array(z.string()).max(200).optional(),
  notice: z.string().max(500).optional(),
});
const Notice = z.object({ t: z.literal("notice"), text: z.string().max(500) });
const Receipt = z.object({
  t: z.literal("receipt"),
  type: z.enum(["BALLOT", "CANON"]),
  showId: z.string(),
  roundNo: z.number(),
  optionId: z.string(),
  optionLabel: z.string(),
  ideaText: z.string(),
});
// The narrator is authenticated by sender id; the core fields are checked, optional sections pass through untouched.
const State = z.looseObject({
  v: z.number(),
  roomCode: z.string(),
  showId: z.string(),
  phase: z.enum(["LOBBY", "PROMPT", "STORM", "DISTILL", "VOTE", "REVEAL", "FINALE", "ENDED"]),
  roundNo: z.number(),
  roundsTotal: z.number(),
  phaseStartedAt: z.number(),
  phaseEndsAt: z.number().nullable(),
  serverNow: z.number(),
  paused: z.boolean(),
  title: z.string(),
  premise: z.string(),
  preset: z.string(),
  isDemo: z.boolean(),
  stats: z.object({ players: z.number(), ideasThisRound: z.number(), ideasTotal: z.number(), canonMakers: z.number() }),
  storySoFar: z.array(z.string()),
});

export type InboundMessage = { messageType: string; content: unknown; senderUserId: string; channelType: number; channelId: string };
type MessageEvent = Exclude<keyof ClientEvents, "connection" | "patch">;
export type ClientMessage = { [K in MessageEvent]: { event: K; payload: ClientEvents[K] } }[MessageEvent];

/**
 * Turn a message received by the Web SDK into a ClientEvents event, or null when it is not ours, is malformed,
 * came over the wrong channel type, or claims to be narrator output without being sent by the narrator.
 */
export function decodeIncoming(m: InboundMessage): (ClientMessage & { channelId: string }) | null {
  const u = unwrapEnvelope(m.messageType, m.content);
  if (!u) return null;
  const { objectName: name, payload } = u;
  if (isNarratorOnly(name) && m.senderUserId !== NARRATOR_USER_ID) return null;
  const fromChannelType = name === OBJECT_NAMES.receipt ? m.channelType === CHANNEL_TYPE.DIRECT || m.channelType === CHANNEL_TYPE.SYSTEM : m.channelType === CHANNEL_TYPE.OPEN;
  if (!fromChannelType) return null;
  const channelId = m.channelId;
  switch (name) {
    case OBJECT_NAMES.state: {
      const r = State.safeParse(payload);
      return r.success ? { event: "state", payload: r.data as unknown as PublicState, channelId } : null;
    }
    case OBJECT_NAMES.tally: {
      const r = Tally.safeParse(payload);
      return r.success ? { event: "tally", payload: r.data, channelId } : null;
    }
    case OBJECT_NAMES.idea: {
      const r = Idea.safeParse(payload);
      return r.success ? { event: "idea", payload: { ...r.data, userId: m.senderUserId }, channelId } : null;
    }
    case OBJECT_NAMES.cheer: {
      const r = Cheer.safeParse(payload);
      return r.success ? { event: "cheer", payload: { ...r.data, userId: m.senderUserId }, channelId } : null;
    }
    case OBJECT_NAMES.moderation: {
      const r = Moderation.safeParse(payload);
      return r.success ? { event: "moderation", payload: r.data, channelId } : null;
    }
    case OBJECT_NAMES.notice: {
      const r = Notice.safeParse(payload);
      return r.success ? { event: "notice", payload: r.data, channelId } : null;
    }
    case OBJECT_NAMES.receipt: {
      const r = Receipt.safeParse(payload);
      return r.success ? { event: "receipt", payload: r.data, channelId } : null;
    }
  }
}

// ---------- webhook body ----------

const WebhookEnvelope = z.object({ type: z.string(), data: z.array(z.unknown()) });
const MessageSendData = z.object({
  userId: z.string().min(1).max(100),
  channelId: z.string().min(1).max(100),
  channelType: z.number(),
  messageType: z.string().min(1).max(50),
  content: z.string().max(MAX_RECEIVED_CONTENT_CHARS),
  time: z.number(),
  messageId: z.string().min(1).max(200),
  os: z.string().optional(),
});

/**
 * Webhook body (already signature-checked) -> IncomingMessage[]. null = not a webhook envelope at all.
 * Events other than message:send, other channel types, messages sent by our own server (os "Server") and anything
 * that is not a CP:* message (in either encoding) are skipped; the payload is left unvalidated for ingest to check.
 */
export function parseWebhookEnvelope(body: unknown): IncomingMessage[] | null {
  const env = WebhookEnvelope.safeParse(body);
  if (!env.success) return null;
  if (env.data.type !== "message:send") return [];
  const out: IncomingMessage[] = [];
  for (const item of env.data.data.slice(0, MAX_WEBHOOK_ITEMS)) {
    const d = MessageSendData.safeParse(item);
    if (!d.success || d.data.channelType !== CHANNEL_TYPE.OPEN || d.data.os === "Server") continue;
    const u = unwrapEnvelope(d.data.messageType, d.data.content);
    if (!u) continue;
    out.push({
      providerMsgId: d.data.messageId,
      channelId: d.data.channelId,
      fromUserId: d.data.userId,
      objectName: u.objectName,
      payload: u.payload,
      sentAt: d.data.time,
    });
  }
  return out;
}

// ---------- metadata ----------

const OPTION_SLOT_KEY = /^cp_options_[ABC]$/;

function splitOptions(state: PublicState): Record<string, string> | null {
  const options = state.options ?? [];
  const out: Record<string, string> = {};
  for (const option of options) {
    const value = JSON.stringify({ v: state.v, n: options.length, option });
    if (value.length > METADATA_VALUE_MAX_CHARS) return null;
    out[`cp_options_${option.slot}`] = value;
  }
  return out;
}

/**
 * PublicState -> metadata entries ready for batchSetOpenChannelMetadata. Values over the documented size limit are
 * not written: cp_options is split per slot (cp_options_A/B/C, reassembled by assembleMetadata), anything else is
 * reported in `dropped` and left to HTTP / CP:State.
 */
export function wireMetadata(state: PublicState): { entries: Record<string, string>; dropped: string[] } {
  const entries: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(encodeMetadata(state))) {
    if (value.length <= METADATA_VALUE_MAX_CHARS) {
      entries[key] = value;
      continue;
    }
    const slots = key === "cp_options" ? splitOptions(state) : null;
    if (slots) Object.assign(entries, slots);
    else dropped.push(key);
  }
  return { entries, dropped };
}

/** The cp_tally entry as encodeMetadata writes it (publishTally rewrites only this key). */
export function wireTallyMetadata(v: number, tally: Record<string, number>, total: number): Record<string, string> {
  return { cp_tally: JSON.stringify({ v, tally, total }) };
}

function parseRecord(raw: string | undefined): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Rebuild cp_options from split slot keys when they are complete and newer than a whole cp_options entry. */
export function assembleMetadata(kv: Record<string, string>): Record<string, string> {
  const slots = Object.keys(kv)
    .filter((k) => OPTION_SLOT_KEY.test(k))
    .map((k) => ({ key: k, rec: parseRecord(kv[k]) }))
    .filter((s): s is { key: string; rec: Record<string, unknown> } => s.rec !== null && typeof s.rec.v === "number" && typeof s.rec.n === "number");
  if (slots.length === 0) return kv;
  const maxV = Math.max(...slots.map((s) => s.rec.v as number));
  const current = slots.filter((s) => s.rec.v === maxV).sort((a, b) => a.key.localeCompare(b.key));
  const n = current[0].rec.n as number;
  const whole = parseRecord(kv.cp_options);
  if (current.length !== n || (whole && typeof whole.v === "number" && whole.v >= maxV)) return kv;
  return { ...kv, cp_options: JSON.stringify({ v: maxV, options: current.map((s) => s.rec.option) }) };
}

/** decodeMetadata that understands split cp_options. */
export function decodeWireMetadata(kv: Record<string, string>): ReturnType<typeof decodeMetadata> {
  return decodeMetadata(assembleMetadata(kv));
}

// ---------- small client helpers ----------

export type ConnectionState = "connected" | "connecting" | "disconnected";

/** Web SDK ConnectionStatus (numeric enum): CONNECTED 0, CONNECTING 1, DISCONNECTED 2, SUSPENDED 3 (auto-reconnects after 5 s). */
export function mapConnectionStatus(status: number): ConnectionState {
  if (status === 0) return "connected";
  if (status === 1 || status === 3) return "connecting";
  return "disconnected";
}

/** "SG" / "sg" (a key of the SDK's AreaCode) or "2" (one of its values) -> the SDK value; undefined lets the SDK default (SG) apply. */
export function resolveAreaCode<T extends number>(area: string | undefined, table: Record<string, T>): T | undefined {
  const a = area?.trim();
  if (!a) return undefined;
  const byName = Object.entries(table).find(([k]) => k.toLowerCase() === a.toLowerCase());
  if (byName) return byName[1];
  const n = Number(a);
  return Object.values(table).find((v) => v === n);
}
