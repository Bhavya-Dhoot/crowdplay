// Server clock offset, so every phone counts down to the same instant (TECH_SPEC §5.5).
//   offset = serverNow - localNow, from 5 samples of GET /api/time (RTT/2 corrected), median taken,
//   re-sampled every 5 minutes.
//   medianOffset(samples)       pure: median of the finite samples (0 for none)
//   offsetFromSample(t0,t1,s)   pure: one sample's offset
//   startClockSync()            begin sampling (ref-counted); returns a stop function
//   serverNow() / getOffsetMs() / subscribeOffset(cb)   read and observe the current offset
//   seedOffset(serverNow)       first guess from any state payload, used only until a sample lands
import { getTime } from "./api";

export const SAMPLE_COUNT = 5;
export const RESYNC_MS = 5 * 60_000;

export function medianOffset(samples: readonly number[]): number {
  const xs = samples.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

/** The server stamped `serverNow` somewhere between our send (t0) and receive (t1); assume the middle. */
export function offsetFromSample(t0: number, t1: number, serverNow: number): number {
  return serverNow - (t0 + t1) / 2;
}

let offset = 0;
let sampled = false;
const listeners = new Set<() => void>();

function setOffset(next: number): void {
  const rounded = Math.round(next);
  if (rounded === offset) return;
  offset = rounded;
  listeners.forEach((cb) => cb());
}

export const getOffsetMs = (): number => offset;
export const serverNow = (): number => Date.now() + offset;

export function subscribeOffset(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function seedOffset(serverNowMs: number): void {
  if (!sampled && Number.isFinite(serverNowMs)) setOffset(serverNowMs - Date.now());
}

let running: Promise<number> | null = null;

/** Take SAMPLE_COUNT samples one after another; the offset improves as they arrive. */
export function syncClock(count = SAMPLE_COUNT): Promise<number> {
  if (running) return running;
  running = (async () => {
    const samples: number[] = [];
    for (let i = 0; i < count; i++) {
      const t0 = Date.now();
      const res = await getTime();
      const t1 = Date.now();
      if (res.ok && typeof res.now === "number") {
        samples.push(offsetFromSample(t0, t1, res.now));
        sampled = true;
        setOffset(medianOffset(samples));
      }
    }
    return offset;
  })().finally(() => {
    running = null;
  });
  return running;
}

let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export function startClockSync(): () => void {
  users += 1;
  if (users === 1) {
    void syncClock();
    timer = setInterval(() => void syncClock(), RESYNC_MS);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    users -= 1;
    if (users === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
