"use client";
// useRoom(code, role): one hook that gives /play, /screen, /host and /try the live room.
//
//   const { state, me, feed, cheers, connection, offsetMs, unreachable, loading, error, features,
//           cooldownUntil, sendIdea, vote, sendCheer, onReceipt, onNotice, refresh } = useRoom(code, "player");
//
//   state          PublicState | null   (null until the first load; render skeletons for <= 2 s)
//   me             MeInRoom | null      (players only: my vote, my option ids, muted/banned flags)
//   feed           FeedIdea[]           current round's ideas, own bubbles flagged mine/pending/rejected
//   cheers         CheerItem[]          recent cheers, newest last
//   connection     "connected" | "connecting" | "disconnected"  (feed it to <ConnectionBanner/>); stays
//                  "connecting" until the transport reports its first status
//   offsetMs       server clock offset  (feed it to <PhaseHeader/> / <Countdown/> / useCountdown)
//   unreachable    our server can't be reached -> show <FullScreenMessage/> (polling retries itself)
//   error          fatal, say-it-to-the-user problem: { code, message }. NO_SESSION on a player means
//                  "go to /join/CODE"; NOT_FOUND / ROOM_FULL / BANNED are shown as-is.
//   cooldownUntil  epoch ms (local clock) when the next idea may be sent; 0 = ready.
//                  useCountdown({ endsAt: cooldownUntil || null, startedAt: cooldownUntil - 2000 })
//   sendIdea(text) validates (empty, 140 chars, STORM only, 2 s cooldown, isClean), shows an optimistic
//                  bubble, sends over the transport and, when ingest is "dual"/"post", also HTTP.
//                  Resolves { ok } or { ok:false, code, message } with friendly copy.
//   vote(optionId) optimistic; rolls back and resolves { ok:false } if the server says no.
//   sendCheer(e)   fire-and-forget; echoes locally. onReceipt(cb) / onNotice(cb) return an unsubscribe.
//
// Transport rules: the state comes from HTTP first, then realtime events merge by highest v. HTTP
// polls state every 2 s ONLY while the transport is not connected (or our server looks unreachable).
// On reconnect the room is re-joined and state/me are refetched. Roles: "player" joins over HTTP;
// "screen" and "host" only read state.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MeInRoom } from "@/lib/api/contracts";
import type { Features } from "@/lib/config";
import { friendlyError } from "@/lib/copy";
import { isClean } from "@/lib/ingest/filter";
import { createRealtimeClient } from "@/lib/realtime/client";
import {
  channelIdForRoom,
  type ConnectionStatus,
  type IdeaPayload,
  type PublicState,
  type RealtimeClient,
  type ReceiptPayload,
  type Unsub,
} from "@/lib/realtime/types";
import { getMe, getRoomMe, getState, joinRoom as httpJoin, postIdea, postVote, type ClientErr } from "./api";
import { getOffsetMs, seedOffset, startClockSync, subscribeOffset } from "./clock";
import { ensureSession, getStoredName, type SessionInfo } from "./session";
import { initialStore, needsResync, reduce, type CheerItem, type FeedIdea, type IncomingIdea, type RoomAction, type RoomStore } from "./store";

export type RoomRole = "player" | "screen" | "host";
export type RoomError = { code: string; message: string };
export type SendResult = { ok: true } | { ok: false; code: string; message: string };

export const IDEA_MAX_CHARS = 140;
export const IDEA_COOLDOWN_MS = 2000;
const POLL_MS = 2000;
const FLUSH_MS = 120;
/** Phase-change refresh of "my options" is spread over this window so 300 phones do not ask in the same instant. */
const ME_JITTER_MS = 1500;
const CHEER_GAP_MS = 400;
const RETRY_MS = 3000;
const WATCHDOG_MS = 20_000;
const TRANSPORT_BACKOFF_MS = [2000, 4000, 8000, 15000];

type View = {
  store: RoomStore;
  connection: ConnectionStatus;
  unreachable: boolean;
  loading: boolean;
  error: RoomError | null;
  features: Features | null;
  cookiesBlocked: boolean;
  cooldownUntil: number;
  channelId: string;
};

type Bus = { receipt: Set<(r: ReceiptPayload) => void>; notice: Set<(text: string) => void> };

export type RoomApi = {
  state: PublicState | null;
  me: MeInRoom | null;
  feed: FeedIdea[];
  cheers: CheerItem[];
  connection: ConnectionStatus;
  offsetMs: number;
  unreachable: boolean;
  loading: boolean;
  error: RoomError | null;
  features: Features | null;
  cookiesBlocked: boolean;
  cooldownUntil: number;
  channelId: string;
  sendIdea(text: string): Promise<SendResult>;
  vote(optionId: string): Promise<SendResult>;
  sendCheer(emoji: string): void;
  onReceipt(cb: (r: ReceiptPayload) => void): Unsub;
  onNotice(cb: (text: string) => void): Unsub;
  refresh(): Promise<void>;
};

/**
 * Leading-edge batching for the idea feed: the first item after a quiet gap is delivered at once (an isolated
 * idea renders immediately), the rest of a burst is delivered together, at most once per `gapMs`.
 */
export function createLeadingBatcher<T>(deliver: (items: T[]) => void, gapMs: number): { push(item: T): void; clear(): void } {
  let buf: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastAt = Number.NEGATIVE_INFINITY;
  const fire = (): void => {
    timer = null;
    if (buf.length === 0) return;
    const items = buf;
    buf = [];
    lastAt = Date.now();
    deliver(items);
  };
  return {
    push(item) {
      buf.push(item);
      if (timer) return;
      const wait = lastAt + gapMs - Date.now();
      if (wait <= 0) fire();
      else timer = setTimeout(fire, wait);
    },
    clear() {
      if (timer) clearTimeout(timer);
      timer = null;
      buf = [];
    },
  };
}

const bad = (code: string, message?: string): SendResult => ({ ok: false, code, message: friendlyError(code, message) });
const OK: SendResult = { ok: true };
const noop = () => {};
const transient = (code: string) => code === "NETWORK" || code === "INTERNAL";

function newClientMsgId(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function initialView(code: string): View {
  return {
    store: initialStore(),
    connection: "connecting",
    unreachable: false,
    loading: true,
    error: null,
    features: null,
    cookiesBlocked: false,
    cooldownUntil: 0,
    channelId: channelIdForRoom(code),
  };
}

type Controller = {
  start(): void;
  stop(): void;
  sendIdea(text: string): Promise<SendResult>;
  vote(optionId: string): Promise<SendResult>;
  sendCheer(emoji: string): void;
  refresh(): Promise<void>;
};

/** All the I/O and timers live here, outside React, so effects stay trivial and cleanup is one call. */
function createController(code: string, role: RoomRole, publish: (v: View) => void, bus: Bus): Controller {
  let view = initialView(code);
  let store = view.store;
  let stopped = false;
  let session: SessionInfo | null = null;
  let ingest: "dual" | "webhook" | "post" = "dual";
  let client: RealtimeClient | null = null;
  let joined = false;
  let failures = 0;
  let sessionRetried = false;
  let transportAttempt = 0;
  let lastCheerAt = 0;
  const ideaBatch = createLeadingBatcher<IncomingIdea>((items) => dispatch({ type: "ideas", items, now: Date.now() }), FLUSH_MS);
  let resyncTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let stopClock: () => void = noop;
  let unsubs: Unsub[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const delivered = new Set<string>();

  function commit(patch: Partial<View>): void {
    view = { ...view, ...patch };
    if (!stopped) publish(view);
  }

  function later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!stopped) fn();
    }, ms);
    timers.add(t);
  }

  // ---------- state ----------

  function dispatch(a: RoomAction): void {
    const before = store.state;
    store = reduce(store, a);
    const after = store.state;
    if (a.type === "state") seedOffset(a.state.serverNow);
    if (after && (!before || before.phase !== after.phase || before.roundNo !== after.roundNo)) onPhase(after);
    if (needsResync(store) && !resyncTimer) {
      resyncTimer = setTimeout(() => {
        resyncTimer = null;
        if (!stopped && needsResync(store)) void refreshState();
      }, 1500);
    }
    commit({ store });
  }

  /** Players refresh "which options carry my ideas" at VOTE and REVEAL, spread out so 300 phones don't stampede. */
  function onPhase(s: PublicState): void {
    if (role !== "player") return;
    if (s.phase === "VOTE" || s.phase === "REVEAL") later(200 + Math.random() * ME_JITTER_MS, () => void refreshMe());
    if (s.phase === "REVEAL") later(2500 + Math.random() * 2000, () => void pollReceipts(s.showId, s.roundNo));
  }

  function noteOk(): void {
    failures = 0;
    if (view.unreachable) commit({ unreachable: false });
  }
  function noteFail(r: ClientErr): void {
    if (!transient(r.code)) return;
    failures += 1;
    if (failures >= 2 && !view.unreachable) commit({ unreachable: true });
  }
  function fatal(r: { code: string; message: string }): void {
    commit({ error: { code: r.code, message: r.message }, loading: false });
  }

  // ---------- HTTP ----------

  async function refreshState(): Promise<void> {
    const r = await getState(code);
    if (stopped) return;
    if (r.ok) {
      noteOk();
      dispatch({ type: "state", state: r.state });
    } else if (transient(r.code)) noteFail(r);
    else if (r.code === "NOT_FOUND" || r.code === "ROOM_NOT_FOUND") fatal(r);
  }

  /** First load and every "give me everything again": join (players) or read state (screen/host). */
  async function load(): Promise<{ ok: true } | ClientErr> {
    if (role === "player") {
      const r = await httpJoin(code);
      if (stopped) return { ok: true };
      if (!r.ok) {
        noteFail(r);
        return r;
      }
      noteOk();
      dispatch({ type: "state", state: r.state });
      dispatch({ type: "me", me: r.me });
      if (r.channelId !== view.channelId) commit({ channelId: r.channelId });
      return { ok: true };
    }
    const r = await getState(code);
    if (stopped) return { ok: true };
    if (!r.ok) {
      noteFail(r);
      return r;
    }
    noteOk();
    dispatch({ type: "state", state: r.state });
    return { ok: true };
  }

  /** Only my own view (GET .../me): no join, no state build. A full join only when the server does not know me. */
  async function refreshMe(): Promise<void> {
    const r = await getRoomMe(code);
    if (stopped) return;
    if (r.ok) {
      noteOk();
      dispatch({ type: "me", me: r.me });
    } else if (transient(r.code)) noteFail(r);
    else void load();
  }

  /** Fallback for a receipt whose direct message never arrived: ask the server once per REVEAL. */
  async function pollReceipts(showId: string, roundNo: number): Promise<void> {
    // Cookie-blocked browsers get no receipt stream (an EventSource cannot send the fallback header),
    // so they always ask; everyone else asks only if they sent ideas this round.
    const sentIdeas = (store.me?.ideasThisRound ?? 0) > 0 || store.feed.some((f) => f.mine && f.status !== "rejected");
    if (!view.cookiesBlocked && !sentIdeas) return;
    const r = await getMe();
    if (stopped || !r.ok) return;
    for (const m of r.receipts) {
      if (m.showId !== showId || m.roundNo !== roundNo) continue;
      const key = `${m.type}:${m.showId}:${m.roundNo}:${m.optionLabel}`;
      if (delivered.has(key)) continue;
      delivered.add(key);
      bus.receipt.forEach((cb) => cb({ t: "receipt", type: m.type, showId: m.showId, roundNo: m.roundNo, optionId: "", optionLabel: m.optionLabel, ideaText: m.ideaText }));
    }
  }

  // ---------- bootstrap ----------

  function pickName(): string | null {
    const stored = getStoredName();
    if (role === "player") return stored;
    return stored ?? (role === "host" ? "Host" : "Big Screen");
  }

  async function bootstrap(): Promise<void> {
    if (stopped) return;
    const name = pickName();
    if (!name) return fatal({ code: "NO_SESSION", message: friendlyError("NO_SESSION") });

    const s = await ensureSession(name, { remember: role === "player", force: sessionRetried });
    if (stopped) return;
    if (!s.ok) {
      if (transient(s.code)) {
        noteFail(s);
        later(RETRY_MS, () => void bootstrap());
      } else fatal(s);
      return;
    }
    session = s.session;
    ingest = s.session.realtime.ingest;
    commit({ features: s.session.features, cookiesBlocked: s.session.cookiesBlocked });
    dispatch({ type: "identity", userId: s.session.userId, name: s.session.displayName });

    const loaded = await load();
    if (stopped) return;
    if (!loaded.ok) {
      if (transient(loaded.code)) later(RETRY_MS, () => void bootstrap());
      else if (loaded.code === "NO_SESSION" && !sessionRetried) {
        sessionRetried = true;
        void bootstrap();
      } else fatal(loaded);
      return;
    }
    commit({ loading: false });
    pollTimer = setInterval(() => {
      if (view.connection !== "connected" || view.unreachable) void refreshState();
    }, POLL_MS);
    void connectTransport();
  }

  // ---------- transport ----------

  function teardownClient(): void {
    unsubs.forEach((u) => u());
    unsubs = [];
    const c = client;
    client = null;
    joined = false;
    if (c) void c.disconnect().catch(noop);
  }

  function onConnection(status: ConnectionStatus): void {
    const was = view.connection;
    commit({ connection: status });
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
    if (status === "connected") {
      if (joined && was !== "connected") {
        void client?.joinRoom(view.channelId).catch(noop);
        void (role === "player" ? load() : refreshState());
      }
    } else {
      // The SDK normally reconnects by itself; if it has not within 20 s, start over with a fresh client.
      watchdog = setTimeout(() => {
        watchdog = null;
        if (stopped || view.connection === "connected") return;
        teardownClient();
        void connectTransport();
      }, WATCHDOG_MS);
    }
  }

  async function connectTransport(): Promise<void> {
    if (stopped || !session) return;
    try {
      const mode = session.realtime.mode;
      const c = await createRealtimeClient(mode);
      if (stopped) {
        void c.disconnect().catch(noop);
        return;
      }
      client = c;
      unsubs = [
        c.on("connection", onConnection),
        c.on("state", (state) => dispatch({ type: "state", state })),
        c.on("patch", (p) => dispatch({ type: "patch", v: p.v, fields: p.fields })),
        c.on("tally", (tally) => dispatch({ type: "tally", tally })),
        c.on("idea", (i) => ideaBatch.push(i)),
        c.on("cheer", (cheer) => {
          if (cheer.userId !== store.meId) dispatch({ type: "cheer", cheer, now: Date.now() });
        }),
        c.on("moderation", (mod) => {
          dispatch({ type: "moderation", mod });
          if (mod.notice) bus.notice.forEach((cb) => cb(mod.notice as string));
        }),
        c.on("receipt", (receipt) => {
          delivered.add(`${receipt.type}:${receipt.showId}:${receipt.roundNo}:${receipt.optionLabel}`);
          dispatch({ type: "receipt", receipt });
          bus.receipt.forEach((cb) => cb(receipt));
        }),
        c.on("notice", (n) => bus.notice.forEach((cb) => cb(n.text))),
      ];
      await c.connect({
        mode,
        userId: session.userId,
        appKey: session.realtime.appKey,
        token: session.realtime.token,
        area: session.realtime.area,
      });
      if (stopped) return;
      await c.joinRoom(view.channelId);
      if (stopped) return;
      joined = true;
      transportAttempt = 0;
    } catch {
      teardownClient();
      if (stopped) return;
      commit({ connection: "disconnected" });
      const wait = TRANSPORT_BACKOFF_MS[Math.min(transportAttempt, TRANSPORT_BACKOFF_MS.length - 1)];
      transportAttempt += 1;
      later(wait, () => void connectTransport());
    }
  }

  // ---------- actions ----------

  async function sendIdea(raw: string): Promise<SendResult> {
    const st = store.state;
    if (role !== "player" || !st || !session || !store.meId) return bad("NOT_PARTICIPANT");
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return bad("EMPTY");
    if (text.length > IDEA_MAX_CHARS) return bad("TOO_LONG");
    if (st.phase !== "STORM" || st.paused) return bad("NOT_STORM");
    if (store.me?.banned) return bad("BANNED");
    if (store.me?.muted) return bad("MUTED");
    const now = Date.now();
    if (now < view.cooldownUntil) return bad("RATE_LIMITED");
    if (!isClean(text)) return bad("BLOCKED");

    const clientMsgId = newClientMsgId();
    commit({ cooldownUntil: now + IDEA_COOLDOWN_MS });
    dispatch({ type: "ideaPending", clientMsgId, text, name: store.meName ?? "Player", now });
    const payload: IdeaPayload = { t: "idea", roundNo: st.roundNo, text, clientMsgId, name: store.meName ?? "Player" };

    const viaTransport = client && joined ? client.sendIdea(view.channelId, payload).then(() => true, () => false) : Promise.resolve(false);
    const settle = (res: SendResult): SendResult => {
      dispatch(res.ok ? { type: "ideaResult", clientMsgId, ok: true } : { type: "ideaResult", clientMsgId, ok: false, code: res.code });
      return res;
    };

    if (ingest === "webhook") return settle((await viaTransport) ? OK : bad("NETWORK"));

    const [viaOk, http] = await Promise.all([viaTransport, postIdea(code, { roundNo: st.roundNo, text, clientMsgId })]);
    if (stopped) return OK;
    if (http.ok) {
      noteOk();
      return settle(OK);
    }
    if (transient(http.code)) {
      noteFail(http);
      return settle(viaOk ? OK : bad(http.code));
    }
    if (http.retryInMs) commit({ cooldownUntil: Date.now() + http.retryInMs });
    return settle(bad(http.code, http.message));
  }

  async function vote(optionId: string): Promise<SendResult> {
    const st = store.state;
    if (role !== "player" || !st || st.phase !== "VOTE" || st.paused) return bad("BAD_REQUEST");
    const prev = store.me?.vote ?? null;
    if (prev === optionId) return OK;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(15);
    dispatch({ type: "vote", optionId });
    const r = await postVote(code, { roundNo: st.roundNo, optionId });
    if (stopped) return OK;
    if (r.ok) {
      noteOk();
      return OK;
    }
    noteFail(r);
    if (store.me?.vote === optionId) dispatch({ type: "vote", optionId: prev });
    return bad(r.code, r.message);
  }

  function sendCheer(emoji: string): void {
    if (role === "screen" || !client || !joined || emoji.length === 0 || emoji.length > 16) return;
    if (view.features && !view.features.cheers) return;
    const now = Date.now();
    if (now - lastCheerAt < CHEER_GAP_MS) return;
    lastCheerAt = now;
    dispatch({ type: "cheer", cheer: { t: "cheer", emoji, name: store.meName ?? undefined, userId: store.meId ?? "me" }, now });
    void client.sendCheer(view.channelId, emoji).catch(noop);
  }

  // ---------- lifecycle ----------

  const onVisible = (): void => {
    if (document.visibilityState === "visible") void refreshState();
  };
  const onOnline = (): void => void refreshState();

  return {
    start() {
      publish(view);
      stopClock = startClockSync();
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("online", onOnline);
      void bootstrap();
    },
    stop() {
      stopped = true;
      stopClock();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      timers.forEach(clearTimeout);
      timers.clear();
      ideaBatch.clear();
      for (const t of [resyncTimer, watchdog]) if (t) clearTimeout(t);
      if (pollTimer) clearInterval(pollTimer);
      const c = client;
      const ch = view.channelId;
      unsubs.forEach((u) => u());
      unsubs = [];
      client = null;
      if (c) void c.leaveRoom(ch).catch(noop).then(() => c.disconnect()).catch(noop);
    },
    sendIdea,
    vote,
    sendCheer,
    refresh: async () => {
      await (role === "player" ? load() : refreshState());
    },
  };
}

export function useRoom(code: string, role: RoomRole): RoomApi {
  const [view, setView] = useState<View>(() => initialView(code));
  const [bus] = useState<Bus>(() => ({ receipt: new Set(), notice: new Set() }));
  const ctrl = useRef<Controller | null>(null);
  const offsetMs = useSyncExternalStore(subscribeOffset, getOffsetMs, () => 0);

  useEffect(() => {
    const c = createController(code, role, setView, bus);
    ctrl.current = c;
    c.start();
    return () => {
      c.stop();
      if (ctrl.current === c) ctrl.current = null;
    };
  }, [code, role, bus]);

  const sendIdea = useCallback((t: string) => ctrl.current?.sendIdea(t) ?? Promise.resolve(bad("NETWORK")), []);
  const vote = useCallback((id: string) => ctrl.current?.vote(id) ?? Promise.resolve(bad("NETWORK")), []);
  const sendCheer = useCallback((e: string) => ctrl.current?.sendCheer(e), []);
  const refresh = useCallback(() => ctrl.current?.refresh() ?? Promise.resolve(), []);
  const onReceipt = useCallback((cb: (r: ReceiptPayload) => void): Unsub => {
    bus.receipt.add(cb);
    return () => void bus.receipt.delete(cb);
  }, [bus]);
  const onNotice = useCallback((cb: (text: string) => void): Unsub => {
    bus.notice.add(cb);
    return () => void bus.notice.delete(cb);
  }, [bus]);

  return {
    state: view.store.state,
    me: view.store.me,
    feed: view.store.feed,
    cheers: view.store.cheers,
    connection: view.connection,
    offsetMs,
    unreachable: view.unreachable,
    loading: view.loading,
    error: view.error,
    features: view.features,
    cookiesBlocked: view.cookiesBlocked,
    cooldownUntil: view.cooldownUntil,
    channelId: view.channelId,
    sendIdea,
    vote,
    sendCheer,
    onReceipt,
    onNotice,
    refresh,
  };
}
