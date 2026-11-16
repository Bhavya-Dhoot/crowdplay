// Per-key in-process mutex. Lives on globalThis so route bundles and instrumentation share it (DECISIONS D11).
type Locks = { tails: Map<string, Promise<void>>; waiting: Map<string, number> };
const g = globalThis as unknown as { __cpLocks?: Locks };

function locks(): Locks {
  return (g.__cpLocks ??= { tails: new Map(), waiting: new Map() });
}

/** Run fn once every earlier holder of `key` has finished. Errors propagate to the caller only. */
export function withRoomLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const l = locks();
  const prev = l.tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const tail = prev.then(() => gate);
  l.tails.set(key, tail);
  l.waiting.set(key, (l.waiting.get(key) ?? 0) + 1);
  return prev.then(fn).finally(() => {
    const n = (l.waiting.get(key) ?? 1) - 1;
    if (n <= 0) l.waiting.delete(key);
    else l.waiting.set(key, n);
    if (l.tails.get(key) === tail) l.tails.delete(key);
    release();
  });
}

/** True while someone holds or waits for the lock (the ticker skips busy rooms). */
export function isRoomBusy(key: string): boolean {
  return (locks().waiting.get(key) ?? 0) > 0;
}

/** Tests: forget every lock, as a process restart would. */
export function resetLocks(): void {
  g.__cpLocks = undefined;
}
