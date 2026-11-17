// Pure helpers shared by the storm desk and the distill slide (no React, no DOM), so layout and capping
// are unit-testable. The screen never holds more than RAIN_CAP idea nodes (TECH_SPEC §14).
import type { FeedIdea } from "@/lib/client/store";
import { isClean } from "@/lib/ingest/filter";

export const RAIN_CAP = 40;
export const DISTILL_CARDS = 24;
/** Vertical position of the three stacks, as a share of the slide area (0 = centre). */
export const PILE_Y = 0.04;

/** FNV-1a: small, stable, good enough to scatter cards and pick a tilt. */
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

export type Pt = { x: number; y: number; r: number };
export type SlidePath = { pile: 0 | 1 | 2; from: Pt; to: Pt };

/**
 * Where a distill card starts and where it lands. Coordinates are offsets from the centre of a w x h
 * area. Cards deal out to the three stacks in turn, so the stacks end up even.
 */
export function slidePath(key: string, index: number, w: number, h: number): SlidePath {
  const pile = (index % 3) as 0 | 1 | 2;
  const fx = (unit(key, "fx") - 0.5) * w * 0.86;
  const fy = (unit(key, "fy") - 0.5) * h * 0.62;
  const fr = (unit(key, "fr") - 0.5) * 8;
  const stack = Math.floor(index / 3);
  const px = (pile - 1) * w * 0.3 + (unit(key, "px") - 0.5) * 22;
  const py = PILE_Y * h - stack * 9 + (unit(key, "py") - 0.5) * 8;
  return {
    pile,
    from: { x: fx, y: fy, r: fr },
    to: { x: px, y: py, r: (unit(key, "pr") - 0.5) * 6 },
  };
}
