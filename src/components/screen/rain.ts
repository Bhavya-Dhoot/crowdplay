// Pure helpers shared by the storm desk and the distill boxes (no React, no DOM), so layout and capping
// are unit-testable. The screen never holds more than RAIN_CAP idea nodes (TECH_SPEC §14).
import type { FeedIdea } from "@/lib/client/store";
import { isClean } from "@/lib/ingest/filter";

export const RAIN_CAP = 40;
export const DISTILL_CARDS = 24;

/** FNV-1a: small, stable, good enough to scatter notes and pick a tilt. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 0..1 from a key and a salt (deterministic). */
export function unit(key: string, salt: string): number {
  return (hash(`${salt}:${key}`) % 10007) / 10007;
}

/** What the desk may show: not rejected, and clean (defence in depth: the store already filtered). */
export function usableIdeas(feed: readonly FeedIdea[]): FeedIdea[] {
  return feed.filter((f) => f.status !== "rejected" && isClean(f.text));
}

/** Where a distill note lands: which of the three boxes, and its little tilt (degrees). */
type Deal = { pile: 0 | 1 | 2; tilt: number };

/** Notes are dealt to the three boxes in turn, so the stacks end up even. Deterministic per key. */
export function deal(key: string, index: number): Deal {
  return { pile: (index % 3) as 0 | 1 | 2, tilt: Math.round((unit(key, "pr") - 0.5) * 60) / 10 };
}
