// Helpers for the bots integration tests (not a test file: the vitest include only matches *.test.ts).
//
// Bot ideas and votes are fake-timer callbacks that finish with real database I/O. `advanceTimersByTimeAsync`
// does not wait for that I/O, so on a loaded machine a callback can still be in flight when the test looks at
// the result or moves the engine clock. These helpers wait for conditions on the real clock (Date.now and
// setImmediate are never faked here) instead of assuming the work finished.
import { vi } from "vitest";
import { clock, fakeRealtime } from "./engine-harness";

const immediate = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Poll `check` until it is true. Fails with `what` after `timeoutMs` of real time. */
export async function until(check: () => Promise<boolean> | boolean, what: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await immediate();
  }
}

/** Wait until `read()` has returned the same value several times in a row: nothing is in flight any more. */
export async function drain(read: () => Promise<number> | number, timeoutMs = 60_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = Number.NaN;
  let same = 0;
  while (same < 5) {
    const v = await read();
    same = v === last ? same + 1 : 0;
    last = v;
    if (Date.now() > deadline) throw new Error("timed out waiting for in-flight bot work to finish");
    for (let i = 0; i < 20; i++) await immediate();
  }
  return last;
}

/** How many bot timers (ideas, cheers, votes) are scheduled right now, across every room. Other timers (embedding
 * batches, coalesced publishes) are not the bots' business, so tests count only these. */
export function botTimers(): number {
  const state = (globalThis as unknown as { __cpBots?: { runs: Map<string, { timers: Set<unknown> }> } }).__cpBots;
  let n = 0;
  for (const run of state?.runs.values() ?? []) n += run.timers.size;
  return n;
}

/** Tests: forget every scheduled bot timer and run marker, as a process restart would. */
export function resetBotState(): void {
  const g = globalThis as unknown as { __cpBots?: { runs: Map<string, { timers: Set<ReturnType<typeof setTimeout>> }> } };
  for (const r of g.__cpBots?.runs.values() ?? []) for (const t of r.timers) clearTimeout(t);
  g.__cpBots = undefined;
}

/** Move the engine clock and the fake timers forward together, in small steps so each timer sees its own time. */
export async function run(ms: number, step = 100): Promise<void> {
  for (let left = ms; left > 0; left -= step) {
    const d = Math.min(step, left);
    clock.now += d;
    await vi.advanceTimersByTimeAsync(d);
  }
}

/** Records the engine-clock time at which each bot idea message reaches the transport. */
export function stampIdeaMessages(): { stamps: number[]; restore: () => void } {
  const stamps: number[] = [];
  const original = fakeRealtime.sendRoomMessage;
  fakeRealtime.sendRoomMessage = async (channelId, from, msg) => {
    if (msg.t === "idea") stamps.push(clock.now);
    return original.call(fakeRealtime, channelId, from, msg);
  };
  return {
    stamps,
    restore: () => {
      fakeRealtime.sendRoomMessage = original;
    },
  };
}
