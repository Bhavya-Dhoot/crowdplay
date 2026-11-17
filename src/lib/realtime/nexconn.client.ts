// Nexconn browser adapter: RealtimeClient on top of @nexconn/chat (+ its peer @nexconn/engine). With
// nexconn.server.ts this is the only code that imports Nexconn packages (CLAUDE.md hard rule 2).
//
// The SDK is imported dynamically inside connect(): importing is SSR-safe but NCEngine.initialize needs `window`.
// Order matters (docs/NEXCONN_SDK_NOTES.md §3.1): initialize -> registerCustomMessages -> handlers -> connect.
//
// Trust model: server-stamped sender ids are reliable, message bodies and metadata are not. State, tally,
// moderation, notice and receipt are accepted only from the narrator; idea/cheer carry the sender id as userId;
// metadata (which other clients can overwrite) is only a fast path, bounded against the last narrator version
// seen, and HTTP join/state stays authoritative.
import type * as ChatSdk from "@nexconn/chat";
import {
  CP_MESSAGE_REGISTRATIONS,
  decodeIncoming,
  decodeWireMetadata,
  mapConnectionStatus,
  resolveAreaCode,
  type ClientMessage,
} from "./nexconn.codec";
import { OBJECT_NAMES, type ClientCreds, type ClientEvents, type ConnectionStatus, type IdeaPayload, type RealtimeClient, type Unsub } from "./types";

type Chat = typeof ChatSdk;
type AnyListener = (payload: never) => void;
type Room = { channel: ChatSdk.OpenChannel; meta: Map<string, string>; dirty: Set<string>; timer: ReturnType<typeof setTimeout> | null };

const SEEN_LIMIT = 1000;
/** Metadata patches may not jump further than this past the last version the narrator itself sent. */
const MAX_PATCH_VERSION_JUMP = 500;
const PATCH_COALESCE_MS = 40;

let clientSeq = 0;

export function createNexconnClient(): RealtimeClient {
  const id = ++clientSeq;
  const ids = { message: `cp-msg-${id}`, connection: `cp-conn-${id}`, open: `cp-open-${id}` };
  const listeners = new Map<keyof ClientEvents, Set<AnyListener>>();
  const rooms = new Map<string, Room>();
  const seen = new Set<string>();
  let chat: Chat | null = null;
  let status: ConnectionStatus | null = null;
  let trustedV = -1;

  const fire = (ev: keyof ClientEvents, payload: unknown): void => {
    for (const cb of [...(listeners.get(ev) ?? [])]) {
      try {
        (cb as (p: unknown) => void)(payload);
      } catch {
        // a faulty subscriber must not break message delivery
      }
    }
  };

  const setStatus = (next: ConnectionStatus): void => {
    if (next === status) return;
    status = next;
    fire("connection", next);
  };

  const patch = (decoded: ReturnType<typeof decodeWireMetadata>): void => {
    if (!decoded) return;
    if (trustedV >= 0 && decoded.v > trustedV + MAX_PATCH_VERSION_JUMP) return; // a forged or corrupt version would freeze the UI
    fire("patch", decoded);
  };

  const seed = async (room: Room): Promise<void> => {
    try {
      const res = await room.channel.getMetadata();
      if (!res.isOk || !res.data) return;
      room.meta = new Map(Object.entries(res.data).filter((e): e is [string, string] => typeof e[1] === "string"));
      patch(decodeWireMetadata(Object.fromEntries(room.meta)));
    } catch {
      // metadata is only a fast path; HTTP state keeps the room correct
    }
  };

  const flush = (room: Room): void => {
    room.timer = null;
    const dirty = [...room.dirty];
    room.dirty.clear();
    const wantsOptions = dirty.some((k) => k.startsWith("cp_options"));
    const kv: Record<string, string> = {};
    // Only keys that changed: an unchanged key still holds an older version and must not overwrite newer fields.
    for (const [k, v] of room.meta) if (dirty.includes(k) || (wantsOptions && k.startsWith("cp_options"))) kv[k] = v;
    patch(decodeWireMetadata(kv));
  };

  const onMessages = (messages: readonly ChatSdk.Message[]): void => {
    for (const m of messages) {
      if (m.messageId) {
        if (seen.has(m.messageId)) continue;
        seen.add(m.messageId);
        if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string);
      }
      const ch = m.channelIdentifier; // the flat m.channelId / m.channelType fields are undefined at runtime
      const decoded = decodeIncoming({
        messageType: m.messageType,
        content: m.content as unknown,
        senderUserId: m.senderUserId,
        channelType: ch.channelType,
        channelId: ch.channelId,
      });
      if (!decoded) continue;
      if (decoded.event !== "receipt" && !rooms.has(decoded.channelId)) continue;
      const msg: ClientMessage = decoded;
      if (msg.event === "state" || msg.event === "tally") trustedV = Math.max(trustedV, msg.payload.v);
      fire(msg.event, msg.payload);
    }
  };

  const removeHandlers = (): void => {
    if (!chat) return;
    chat.NCEngine.removeConnectionStatusHandler(ids.connection);
    chat.NCEngine.removeMessageHandler(ids.message);
    chat.NCEngine.removeOpenChannelHandler(ids.open);
  };

  const forget = (channelId: string): void => {
    const room = rooms.get(channelId);
    if (room?.timer) clearTimeout(room.timer);
    rooms.delete(channelId);
  };

  const send = async (channelId: string, objectName: string, payload: Record<string, unknown>): Promise<void> => {
    const room = rooms.get(channelId);
    if (!chat || !room) throw new Error("Not in the room");
    const res = await room.channel.sendMessage(new chat.SendMessageParams(payload, objectName));
    if (!res.isOk) throw Object.assign(new Error(`Nexconn send failed (${res.code}${res.msg ? `: ${res.msg}` : ""})`), { code: res.code });
  };

  return {
    async connect(creds: ClientCreds): Promise<void> {
      if (creds.mode !== "nexconn" || !creds.appKey || !creds.token) throw new Error("Nexconn connect needs appKey and token");
      if (typeof window === "undefined") throw new Error("The Nexconn Web SDK runs in the browser only");
      const sdk = await import("@nexconn/chat");
      chat = sdk;
      const areaCode = resolveAreaCode(creds.area, sdk.AreaCode);
      if (creds.area && areaCode === undefined) console.warn(`[crowdplay] unknown Nexconn area "${creds.area}", using the SDK default`);
      sdk.NCEngine.initialize({ appKey: creds.appKey, areaCode, logLevel: sdk.LogLevel.ERROR }); // WARN prints routine connect-status lines as console warnings
      sdk.NCEngine.registerCustomMessages([...CP_MESSAGE_REGISTRATIONS]);
      sdk.NCEngine.addConnectionStatusHandler(
        ids.connection,
        new sdk.ConnectionStatusHandler({ onConnectionStatusChanged: ({ status: s }) => setStatus(mapConnectionStatus(s)) }),
      );
      sdk.NCEngine.addMessageHandler(ids.message, new sdk.MessageHandler({ onMessageReceived: ({ messages }) => onMessages(messages) }));
      sdk.NCEngine.addOpenChannelHandler(
        ids.open,
        new sdk.OpenChannelHandler({
          onMetadataChanged: ({ changeInfo }) => {
            for (const c of changeInfo) {
              const room = rooms.get(c.channelId);
              if (!room) continue;
              if (c.operationType === sdk.OpenChannelMetadataOperationType.REMOVE) room.meta.delete(c.key);
              else room.meta.set(c.key, c.value);
              room.dirty.add(c.key);
              room.timer ??= setTimeout(() => flush(room), PATCH_COALESCE_MS);
            }
          },
          onMetadataSynced: ({ channelId }) => {
            const room = rooms.get(channelId);
            if (room) void seed(room);
          },
          onChannelDestroyed: ({ channelId }) => forget(channelId),
        }),
      );
      setStatus("connecting");
      const res = await sdk.NCEngine.connect({ token: creds.token });
      if (!res.isOk) {
        removeHandlers();
        setStatus("disconnected");
        throw Object.assign(new Error(`Nexconn connect failed (${res.code}${res.msg ? `: ${res.msg}` : ""})`), { code: res.code });
      }
      setStatus("connected");
    },

    async joinRoom(channelId: string): Promise<void> {
      if (!chat) throw new Error("Not connected");
      const rejoin = rooms.get(channelId);
      const room: Room = rejoin ?? { channel: new chat.OpenChannel(channelId), meta: new Map(), dirty: new Set(), timer: null };
      rooms.set(channelId, room); // before entering, so the first messages after the join are not dropped
      // The engine turns messageCount 0 into 10; nothing is persisted server-side (shouldPersist 0), so no history comes back.
      const res = await room.channel.enterChannel({ messageCount: 0 });
      // A repeat join after a reconnect may fail because the SDK already re-entered by itself; a first join must succeed.
      if (!res.isOk && !rejoin) {
        forget(channelId);
        throw Object.assign(new Error(`Nexconn could not enter ${channelId} (${res.code}${res.msg ? `: ${res.msg}` : ""})`), { code: res.code });
      }
      await seed(room);
    },

    async leaveRoom(channelId: string): Promise<void> {
      const room = rooms.get(channelId);
      if (!room) return;
      forget(channelId);
      await room.channel.exitChannel().catch(() => undefined);
    },

    sendIdea(channelId: string, p: IdeaPayload): Promise<void> {
      return send(channelId, OBJECT_NAMES.idea, p);
    },

    sendCheer(channelId: string, emoji: string): Promise<void> {
      return send(channelId, OBJECT_NAMES.cheer, { t: "cheer", emoji });
    },

    on<K extends keyof ClientEvents>(ev: K, cb: (p: ClientEvents[K]) => void): Unsub {
      const set = listeners.get(ev) ?? new Set<AnyListener>();
      set.add(cb as AnyListener);
      listeners.set(ev, set);
      return () => {
        set.delete(cb as AnyListener);
      };
    },

    async disconnect(): Promise<void> {
      for (const channelId of [...rooms.keys()]) {
        const room = rooms.get(channelId);
        forget(channelId);
        await room?.channel.exitChannel().catch(() => undefined);
      }
      removeHandlers();
      if (chat) await chat.NCEngine.disconnect().catch(() => undefined);
      seen.clear();
      trustedV = -1;
      if (status !== null && status !== "disconnected") setStatus("disconnected");
    },
  };
}
