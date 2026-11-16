// In-memory token buckets keyed by user and by IP (single container; see TECH_SPEC §6).
// State lives on globalThis so route bundles and the webhook pipeline share it.

export type LimitResult = { ok: boolean; retryInMs: number };
/** graceMs: arrival jitter we forgive, so a client honouring its 2 s cooldown is never refused. */
type Spec = { capacity: number; refillMs: number; graceMs?: number };
type Bucket = { tokens: number; at: number };

/** Ideas: 1 per 2 s per user. The IP bucket is loose because a whole room can share one wifi. */
export const IDEA_USER: Spec = { capacity: 1, refillMs: 2000, graceMs: 150 };
export const IDEA_IP: Spec = { capacity: 40, refillMs: 100 };
export const CHEER_USER: Spec = { capacity: 6, refillMs: 500 };
export const CHEER_IP: Spec = { capacity: 120, refillMs: 40 };

const g = globalThis as unknown as { __cpBuckets?: Map<string, Bucket> };
const buckets = (): Map<string, Bucket> => (g.__cpBuckets ??= new Map());

const SWEEP_AT = 5000;

function refilled(b: Bucket | undefined, spec: Spec, now: number): Bucket {
  if (!b) return { tokens: spec.capacity, at: now };
  const tokens = Math.min(spec.capacity, b.tokens + Math.max(0, now - b.at) / spec.refillMs);
  return { tokens, at: now };
}

function sweep(map: Map<string, Bucket>, now: number): void {
  if (map.size < SWEEP_AT) return;
  // A bucket idle for a minute is full again, so dropping it changes nothing.
  for (const [k, b] of map) if (now - b.at > 60_000) map.delete(k);
}

/**
 * Take one token from every bucket, or none: a request refused by the IP bucket must not burn the
 * user's token. retryInMs is how long until the slowest refused bucket has a token.
 */
function takeAll(entries: [key: string, spec: Spec][], now: number): LimitResult {
  const map = buckets();
  const next = entries.map(([key, spec]) => [key, spec, refilled(map.get(key), spec, now)] as const);
  let retryInMs = 0;
  for (const [, spec, b] of next) {
    const need = 1 - (spec.graceMs ?? 0) / spec.refillMs;
    if (b.tokens < need) retryInMs = Math.max(retryInMs, Math.ceil((need - b.tokens) * spec.refillMs));
  }
  if (retryInMs > 0) return { ok: false, retryInMs };
  for (const [key, , b] of next) map.set(key, { tokens: b.tokens - 1, at: b.at });
  sweep(map, now);
  return { ok: true, retryInMs: 0 };
}

export function limitIdea(userId: string, ip?: string | null, now = Date.now()): LimitResult {
  const entries: [string, Spec][] = [[`idea:u:${userId}`, IDEA_USER]];
  if (ip) entries.push([`idea:ip:${ip}`, IDEA_IP]);
  return takeAll(entries, now);
}

export function limitCheer(userId: string, ip?: string | null, now = Date.now()): LimitResult {
  const entries: [string, Spec][] = [[`cheer:u:${userId}`, CHEER_USER]];
  if (ip) entries.push([`cheer:ip:${ip}`, CHEER_IP]);
  return takeAll(entries, now);
}

export function resetRateLimits(): void {
  g.__cpBuckets = undefined;
}
