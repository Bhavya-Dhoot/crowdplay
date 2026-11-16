// Pure helpers for the idea rain and the distill swirl (no React, no DOM), so layout and capping
// are unit-testable. The screen never holds more than RAIN_CAP idea nodes (TECH_SPEC §14).
import type { FeedIdea } from "@/lib/client/store";
import { isClean } from "@/lib/ingest/filter";

export const RAIN_CAP = 40;
export const DISTILL_CARDS = 24;
/** Vertical position of the three piles, as a share of the swirl area (0 = centre). */
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

export type RainCard = {
  key: string;
  name: string;
  text: string;
  isBot: boolean;
  col: number;
  /** 0 = newest card on the screen; used to fade older ones. */
  rank: number;
  /** Degrees, small and stable per idea. */
  tilt: number;
};
export type RainPlan = {
  /** One list per column, newest first (cards fall down the column as newer ones arrive). */
  columns: RainCard[][];
  count: number;
};

/** What the rain may show: not rejected, and clean (defence in depth: the store already filtered). */
export function usableIdeas(feed: readonly FeedIdea[]): FeedIdea[] {
  return feed.filter((f) => f.status !== "rejected" && isClean(f.text));
}

const estimateLines = (text: string, charsPerLine: number): number => Math.max(1, Math.ceil(text.length / Math.max(1, charsPerLine)));

/**
 * Cards keep their column for good: columns are assigned greedily (shortest estimated column first)
 * over the WHOLE usable feed, so a card never jumps columns when the window slides or a new one lands.
 * Only the newest `cap` cards are returned.
 */
export function planRain(feed: readonly FeedIdea[], cols: number, cap = RAIN_CAP, charsPerLine = 18): RainPlan {
  const n = Math.max(1, Math.floor(cols));
  const usable = usableIdeas(feed);
  const heights = new Array<number>(n).fill(0);
  const colOf: number[] = [];
  for (const idea of usable) {
    let best = 0;
    for (let c = 1; c < n; c++) if (heights[c] < heights[best]) best = c;
    colOf.push(best);
    heights[best] += estimateLines(idea.text, charsPerLine) + 1.4; // 1.4 = card padding + name line, in text lines
  }
  const columns: RainCard[][] = Array.from({ length: n }, () => []);
  const start = Math.max(0, usable.length - Math.max(0, cap));
  for (let i = usable.length - 1; i >= start; i--) {
    const idea = usable[i];
    columns[colOf[i]].push({
      key: idea.key,
      name: idea.name,
      text: idea.text,
      isBot: idea.isBot,
      col: colOf[i],
      rank: usable.length - 1 - i,
      tilt: (Math.floor(unit(idea.key, "tilt") * 5) - 2) * 0.6,
    });
  }
  return { columns, count: usable.length - start };
}

/** Opacity for a card by age: the newest is solid, the oldest fade (but stay readable until they leave). */
export function rainOpacity(rank: number): number {
  return Math.max(0.28, 1 - rank * 0.045);
}

export type Pt = { x: number; y: number; r: number };
export type SwirlPath = { pile: 0 | 1 | 2; from: Pt; mid: Pt; to: Pt };

/**
 * Where a distill card starts, swings through and lands. Coordinates are offsets from the centre of
 * a w x h area. Cards deal out to the three piles in turn, so piles end up even.
 */
export function swirlPath(key: string, index: number, w: number, h: number): SwirlPath {
  const pile = (index % 3) as 0 | 1 | 2;
  const fx = (unit(key, "fx") - 0.5) * w * 0.86;
  const fy = (unit(key, "fy") - 0.5) * h * 0.62;
  const fr = (unit(key, "fr") - 0.5) * 14;
  // Mid-point: the start rotated about the centre and pulled in, which reads as a swirl.
  const turn = 1.5 + unit(key, "turn");
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const mx = (fx * cos - fy * sin) * 0.55;
  const my = (fx * sin + fy * cos) * 0.55;
  const stack = Math.floor(index / 3);
  const px = (pile - 1) * w * 0.3 + (unit(key, "px") - 0.5) * 22;
  const py = PILE_Y * h - stack * 9 + (unit(key, "py") - 0.5) * 8;
  return {
    pile,
    from: { x: fx, y: fy, r: fr },
    mid: { x: mx, y: my, r: fr + 220 },
    to: { x: px, y: py, r: (unit(key, "pr") - 0.5) * 18 },
  };
}
