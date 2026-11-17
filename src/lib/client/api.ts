// Typed fetch helpers for every endpoint in src/lib/api/contracts.ts. Browser only.
//
// Every helper RETURNS a Result and never throws:
//   { ok: true, ...payload }  |  { ok: false, code, message, status?, retryInMs? }
// Network failures and timeouts come back as { ok:false, code:'NETWORK' }. `message` is always
// friendly copy (src/lib/copy.ts); the server's own wording is only used for codes we don't know.
// When a session token is in localStorage (cookies-blocked fallback) it is sent as x-cp-session.
import type {
  CreateRoomInput,
  CreateRoomRes,
  Err,
  HealthRes,
  HostActionInput,
  HostFeedRes,
  HostRes,
  IdeaRes,
  ImpactRes,
  JoinRes,
  MeInRoom,
  MeRes,
  RoomInfoRes,
  SessionRes,
  StateRes,
  StoryRes,
  TryRes,
  VoteRes,
} from "@/lib/api/contracts";
import { friendlyError } from "@/lib/copy";
import { MOCK_SESSION_STORAGE_KEY } from "@/lib/realtime/mock.client";

export type ClientErr = Err & { status?: number; retryInMs?: number };
export type Result<R extends { ok: true }> = R | ClientErr;
type IdeaOk = Extract<IdeaRes, { ok: true }>;

// Same key the mock transport reads for its own sends, so both carry the one fallback token.
const TOKEN_KEY = MOCK_SESSION_STORAGE_KEY;
const REQUEST_TIMEOUT_MS = 10_000;

// ---------- Session token storage (cookies-blocked fallback) ----------

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setStoredToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage blocked: cookies are then the only carrier */
  }
}
export function clearStoredToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

// ---------- Core request ----------

type RequestOpts = { method?: "GET" | "POST" | "DELETE"; body?: unknown; headers?: Record<string, string>; timeoutMs?: number };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(code: string, serverMessage?: string, status?: number, retryInMs?: number): ClientErr {
  const err: ClientErr = { ok: false, code, message: friendlyError(code, serverMessage) };
  if (status !== undefined) err.status = status;
  if (retryInMs !== undefined) err.retryInMs = retryInMs;
  return err;
}

async function request<R extends { ok: true }>(path: string, opts: RequestOpts = {}): Promise<Result<R>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { accept: "application/json", ...opts.headers };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const token = getStoredToken();
    if (token) headers["x-cp-session"] = token;

    const res = await fetch(path, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: ctrl.signal,
    });

    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON body: handled below */
    }

    if (res.ok && isRecord(data) && data.ok !== false) return { ...data, ok: true } as unknown as R;
    if (isRecord(data) && data.ok === false && typeof data.code === "string") {
      const retry = typeof data.retryInMs === "number" ? data.retryInMs : undefined;
      return fail(data.code, typeof data.message === "string" ? data.message : undefined, res.status, retry);
    }
    return fail(res.status === 404 ? "NOT_FOUND" : "INTERNAL", undefined, res.status);
  } catch {
    return fail("NETWORK");
  } finally {
    clearTimeout(timer);
  }
}

const enc = encodeURIComponent;

// ---------- Endpoints ----------

export const createSession = (displayName: string, lang?: string) =>
  request<SessionRes>("/api/session", { method: "POST", body: { displayName, ...(lang ? { lang } : {}) } });

/** Delete my data (DELETE /api/session). Also forgets the local token. */
export async function deleteMyData(): Promise<Result<{ ok: true }>> {
  const r = await request<{ ok: true }>("/api/session", { method: "DELETE" });
  if (r.ok) clearStoredToken();
  return r;
}

export const createRoom = (body: CreateRoomInput) => request<CreateRoomRes>("/api/rooms", { method: "POST", body });
export const getRoom = (code: string) => request<RoomInfoRes>(`/api/rooms/${enc(code)}`);
export const joinRoom = (code: string, lang?: string) =>
  request<JoinRes>(`/api/rooms/${enc(code)}/join`, { method: "POST", body: lang ? { lang } : {} });
export const getState = (code: string) => request<StateRes>(`/api/rooms/${enc(code)}/state`);
/** Just my own view of the room (GET .../me): the cheap refresh for phase changes, no join side effects. */
export const getRoomMe = (code: string) => request<{ ok: true; me: MeInRoom }>(`/api/rooms/${enc(code)}/me`);

export const postIdea = (code: string, body: { roundNo: number; text: string; clientMsgId: string }) =>
  request<IdeaOk>(`/api/rooms/${enc(code)}/ideas`, { method: "POST", body });
export const postVote = (code: string, body: { roundNo: number; optionId: string }) =>
  request<VoteRes>(`/api/rooms/${enc(code)}/vote`, { method: "POST", body });

export const hostAction = (code: string, hostKey: string, action: HostActionInput) =>
  request<HostRes>(`/api/rooms/${enc(code)}/host`, { method: "POST", body: action, headers: { "x-host-key": hostKey } });
export const getHostFeed = (code: string, hostKey: string) =>
  request<HostFeedRes>(`/api/rooms/${enc(code)}/host/feed`, { headers: { "x-host-key": hostKey } });

export const startTry = (displayName?: string) =>
  request<TryRes>("/api/try", { method: "POST", body: displayName ? { displayName } : {} });
export const getMe = () => request<MeRes>("/api/me");
export const getStory = (showId: string) => request<StoryRes>(`/api/story/${enc(showId)}`);
export const getImpact = () => request<ImpactRes>("/api/impact");

export const getTime = () => request<{ ok: true; now: number }>("/api/time", { timeoutMs: 4_000 });
export const getHealth = () => request<{ ok: true } & Omit<HealthRes, "ok">>("/api/health", { timeoutMs: 4_000 });
