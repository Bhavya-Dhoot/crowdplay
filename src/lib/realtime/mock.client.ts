// Mock realtime transport (browser side): Server-Sent Events down, fetch up. Tests and credential-less dev only.
// Bundled into the client: no Node imports.
import type {
  ClientCreds,
  ClientEvents,
  ConnectionStatus,
  IdeaPayload,
  RealtimeClient,
  Unsub,
} from "./types";

/** localStorage key holding the cookies-blocked session fallback (sent as x-cp-session on mock sends). */
export const MOCK_SESSION_STORAGE_KEY = "cp_session";

const EVENT_NAMES = ["state", "tally", "idea", "cheer", "moderation", "receipt", "notice"] as const satisfies readonly (keyof ClientEvents)[];
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 8000;
const FIRST_OPEN_WAIT_MS = 4000;

type Stream = { channelId: string; es: EventSource | null; attempts: number; timer: ReturnType<typeof setTimeout> | null; status: ConnectionStatus };
type AnyListener = (payload: never) => void;

declare global {
  interface Window {
    /** Test hook: simulate a transport outage lasting `ms` (used by e2e for the reconnect banner). */
    __cpMock?: { drop(ms: number): void };
  }
}

function storedSessionToken(): string | null {
  try {
    return globalThis.localStorage?.getItem(MOCK_SESSION_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function createMockClient(): RealtimeClient {
  const listeners = new Map<keyof ClientEvents, Set<AnyListener>>();
  const streams = new Map<string, Stream>();
  let creds: ClientCreds | null = null;
  let status: ConnectionStatus | null = null;
  let blockedUntil = 0; // window.__cpMock.drop(): refuse to connect until this time

  const emit = <K extends keyof ClientEvents>(ev: K, payload: ClientEvents[K]): void => {
    for (const cb of [...(listeners.get(ev) ?? [])]) {
      try {
        (cb as (p: ClientEvents[K]) => void)(payload);
      } catch {
        // a faulty subscriber must not break the stream
      }
    }
  };

  const recompute = (): void => {
    if (streams.size === 0) return;
    const all = [...streams.values()].map((s) => s.status);
    const next: ConnectionStatus = all.includes("disconnected") ? "disconnected" : all.includes("connecting") ? "connecting" : "connected";
    if (next === status) return;
    status = next;
    emit("connection", next);
  };

  const setStatus = (s: Stream, next: ConnectionStatus): void => {
    s.status = next;
    recompute();
  };

  const closeEs = (s: Stream): void => {
    if (s.es) {
      s.es.onopen = null;
      s.es.onerror = null;
      s.es.close();
      s.es = null;
    }
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
  };

  const open = (s: Stream, onFirstOpen?: () => void): void => {
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    const wait = blockedUntil - Date.now();
    if (wait > 0) {
      s.timer = setTimeout(() => open(s, onFirstOpen), wait);
      return;
    }
    setStatus(s, "connecting");
    const es = new EventSource(`/api/mock/stream?channel=${encodeURIComponent(s.channelId)}`);
    s.es = es;
    es.onopen = () => {
      s.attempts = 0;
      setStatus(s, "connected");
      onFirstOpen?.();
    };
    es.onerror = () => {
      closeEs(s);
      setStatus(s, "disconnected");
      const backoff = Math.min(BACKOFF_BASE_MS * 2 ** s.attempts, BACKOFF_MAX_MS);
      s.attempts += 1;
      s.timer = setTimeout(() => open(s, onFirstOpen), backoff + Math.floor(Math.random() * 250));
    };
    for (const name of EVENT_NAMES) {
      es.addEventListener(name, (e) => {
        try {
          emit(name, JSON.parse((e as MessageEvent<string>).data) as never);
        } catch {
          // ignore a malformed frame
        }
      });
    }
  };

  const post = async (channelId: string, objectName: string, payload: unknown): Promise<void> => {
    if (!creds) throw new Error("Not connected");
    if (Date.now() < blockedUntil) throw new Error("Offline");
    const headers: Record<string, string> = { "content-type": "application/json" };
    const fallback = storedSessionToken();
    if (fallback) headers["x-cp-session"] = fallback;
    const res = await fetch("/api/mock/send", { method: "POST", headers, body: JSON.stringify({ channelId, objectName, payload }) });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
      throw Object.assign(new Error(body?.message ?? `Send failed (${res.status})`), { code: body?.code });
    }
  };

  const hook = {
    drop(ms: number): void {
      blockedUntil = Date.now() + ms;
      for (const s of streams.values()) {
        closeEs(s);
        setStatus(s, "disconnected");
        s.timer = setTimeout(() => open(s), ms);
      }
    },
  };

  return {
    async connect(c: ClientCreds): Promise<void> {
      creds = c;
      const w = (typeof window !== "undefined" ? window : globalThis) as unknown as Window;
      w.__cpMock = hook;
    },

    joinRoom(channelId: string): Promise<void> {
      const existing = streams.get(channelId);
      if (existing) closeEs(existing);
      const s: Stream = { channelId, es: null, attempts: 0, timer: null, status: "connecting" };
      streams.set(channelId, s);
      // Resolve on first open, or after a short wait: the stream keeps retrying in the background.
      return new Promise<void>((resolve) => {
        const giveUp = setTimeout(resolve, FIRST_OPEN_WAIT_MS);
        open(s, () => {
          clearTimeout(giveUp);
          resolve();
        });
      });
    },

    async leaveRoom(channelId: string): Promise<void> {
      const s = streams.get(channelId);
      if (!s) return;
      closeEs(s);
      streams.delete(channelId);
    },

    sendIdea(channelId: string, p: IdeaPayload): Promise<void> {
      return post(channelId, "CP:Idea", p);
    },

    sendCheer(channelId: string, emoji: string): Promise<void> {
      return post(channelId, "CP:Cheer", { t: "cheer", emoji });
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
      for (const s of streams.values()) closeEs(s);
      streams.clear();
      creds = null;
      if (status !== null && status !== "disconnected") {
        status = "disconnected";
        emit("connection", "disconnected");
      }
      const w = (typeof window !== "undefined" ? window : globalThis) as unknown as Window;
      if (w.__cpMock === hook) delete w.__cpMock;
    },
  };
}
