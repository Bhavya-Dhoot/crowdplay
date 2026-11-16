"use client";
// useCountdown({ endsAt, startedAt, offsetMs, paused }): remaining time to a SERVER timestamp.
//   remainingMs  null when there is nothing to count (LOBBY, FINALE, first paint before hydration)
//   seconds      whole seconds left, rounded up ("12 seconds left")
//   fraction     1 -> 0 over the phase, for rings and bars
//   warn         last 5 seconds (and not paused)
//   done         reached zero
// Pass offsetMs from useRoom() so every phone agrees with the server clock. While `paused` the value
// freezes at what it was when the pause began; a new endsAt on resume starts the count again.
// All countdowns share one 250 ms ticker, so a screen full of rings costs one timer.
import { useState, useSyncExternalStore } from "react";

export const WARN_SECONDS = 5;
const TICK_MS = 250;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), TICK_MS);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
const getTick = (): number => Math.floor(Date.now() / TICK_MS);

export type CountdownOpts = {
  endsAt: number | null;
  startedAt?: number | null;
  offsetMs?: number;
  paused?: boolean;
};
export type CountdownValue = {
  remainingMs: number | null;
  seconds: number | null;
  fraction: number;
  warn: boolean;
  done: boolean;
  paused: boolean;
};

type Snap = { endsAt: number | null; totalMs: number; frozenMs: number | null };

/** Pure: how the displayed numbers follow from the remaining time. */
export function describeRemaining(remainingMs: number | null, totalMs: number, paused: boolean): CountdownValue {
  if (remainingMs === null) return { remainingMs: null, seconds: null, fraction: 0, warn: false, done: false, paused };
  const left = Math.max(0, remainingMs);
  const fraction = totalMs > 0 ? Math.min(1, left / totalMs) : 0;
  return {
    remainingMs: left,
    seconds: Math.ceil(left / 1000),
    fraction,
    warn: !paused && left > 0 && left <= WARN_SECONDS * 1000,
    done: left === 0,
    paused,
  };
}

export function useCountdown({ endsAt, startedAt = null, offsetMs = 0, paused = false }: CountdownOpts): CountdownValue {
  const tick = useSyncExternalStore(subscribe, getTick, () => 0);
  const [snap, setSnap] = useState<Snap>({ endsAt: null, totalMs: 0, frozenMs: null });

  // tick 0 is the server/hydration snapshot: nothing to show yet.
  if (tick === 0) return describeRemaining(null, 0, paused);
  const nowServer = tick * TICK_MS + offsetMs;

  // Adjust remembered state while rendering (React's sanctioned alternative to an effect).
  let next = snap;
  if (endsAt !== null && endsAt !== snap.endsAt) {
    const totalMs = startedAt !== null ? endsAt - startedAt : Math.max(0, endsAt - nowServer);
    next = { endsAt, totalMs: Math.max(totalMs, 1), frozenMs: null };
  }
  if (paused && next.frozenMs === null && next.endsAt !== null) {
    next = { ...next, frozenMs: Math.max(0, next.endsAt - nowServer) };
  } else if (!paused && next.frozenMs !== null) {
    next = { ...next, frozenMs: null };
  }
  if (next !== snap) setSnap(next);

  const remaining = paused ? next.frozenMs : endsAt === null ? null : endsAt - nowServer;
  return describeRemaining(remaining, next.totalMs, paused);
}
