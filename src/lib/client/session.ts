// Guest session on the client. Browser only.
//   ensureSession(name)  POST /api/session once (in-flight calls are shared), keep the result in memory
//                        and the token in localStorage for browsers that block cookies.
//   getSession()         the cached SessionInfo (realtime credentials, feature flags) or null.
//   getStoredName()      the last display name this browser used, for returning players.
// Assumption about the server: POSTing again with a valid cookie/x-cp-session reuses the same user
// and re-issues realtime credentials, so calling ensureSession on every page load is safe.
import type { SessionRes } from "@/lib/api/contracts";
import type { Features } from "@/lib/config";
import { clearStoredToken, createSession, setStoredToken, type ClientErr } from "./api";

export type SessionInfo = {
  userId: string;
  displayName: string;
  realtime: SessionRes["realtime"];
  features: Features;
  /** True when the browser dropped the session cookie: play continues on the localStorage token. */
  cookiesBlocked: boolean;
};

const NAME_KEY = "cp_display_name";
const SESSION_TTL_MS = 30 * 60_000;

let cached: { info: SessionInfo; at: number } | null = null;
let inflight: { name: string; promise: Promise<EnsureResult> } | null = null;

export type EnsureResult = { ok: true; session: SessionInfo } | ClientErr;

export function getSession(): SessionInfo | null {
  return cached ? cached.info : null;
}

export function getStoredName(): string | null {
  try {
    const n = window.localStorage.getItem(NAME_KEY);
    return n && n.trim() ? n : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  cached = null;
  inflight = null;
  clearStoredToken();
  try {
    window.localStorage.removeItem(NAME_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Did the browser keep our httpOnly cookie? Asks the server without the localStorage header. */
async function cookiesAreBlocked(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.cookieEnabled === false) return true;
  try {
    const res = await fetch("/api/me", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
    return !res.ok;
  } catch {
    return false; // can't tell: don't alarm the player
  }
}

async function establish(name: string, remember: boolean): Promise<EnsureResult> {
  const res = await createSession(name);
  if (!res.ok) return res;
  setStoredToken(res.sessionToken);
  if (remember) {
    try {
      window.localStorage.setItem(NAME_KEY, res.user.displayName);
    } catch {
      /* storage blocked */
    }
  }
  const info: SessionInfo = {
    userId: res.user.id,
    displayName: res.user.displayName,
    realtime: res.realtime,
    features: res.features,
    cookiesBlocked: await cookiesAreBlocked(),
  };
  cached = { info, at: Date.now() };
  return { ok: true, session: info };
}

/**
 * Make sure this browser has a session under `displayName`. Reuses the cached session while it is
 * fresh and the name matches. `remember: false` keeps the stored name untouched (screen/host roles).
 */
export function ensureSession(displayName: string, opts: { remember?: boolean; force?: boolean } = {}): Promise<EnsureResult> {
  const name = displayName.trim();
  if (!opts.force && cached && cached.info.displayName === name && Date.now() - cached.at < SESSION_TTL_MS) {
    return Promise.resolve({ ok: true, session: cached.info });
  }
  if (inflight && inflight.name === name) return inflight.promise;
  const promise = establish(name, opts.remember ?? true).finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  inflight = { name, promise };
  return promise;
}
