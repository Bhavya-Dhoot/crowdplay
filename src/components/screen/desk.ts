// The storm desk: pure layout for the paper idea cards (no React, no DOM), so sizing and capping are unit-testable.
//
// Cards sit in centred rows on the desk. The card size is a rung on a ladder: with few ideas the cards are big
// (a judge-sized room never sees an empty stage), and the more ideas arrive the smaller the rung. When even the
// smallest rung does not fit, rows overlap like a heap of index cards (newest row on top). Never more than
// RAIN_CAP cards exist. All lengths here are canvas pixels; sizes inside a card are in that card's own em.
import type { FeedIdea } from "@/lib/client/store";
import { RAIN_CAP, unit, usableIdeas } from "./rain";

/** Card font sizes in stage em (1 em = 28 canvas px), largest first. */
export const DESK_LADDER = {
  full: [2, 1.75, 1.5, 1.3, 1.15, 1, 0.9, 0.8],
  compact: [1.1, 0.95, 0.82, 0.72],
} as const;

/** With fewer real cards than this, dashed ghost cards keep the desk from looking empty. */
export const GHOST_MIN = 3;
/** A card is this wide in its own em. */
export const CARD_EM = 11;
/** Rough characters per line at CARD_EM (padding removed, word wrap allowed for). */
export const CHARS_PER_LINE = 17;
const PAD_Y_EM = 0.5;
const LINE_EM = 1.2;
const NAME_EM = 1.2;
/** Heap rows never cover more than this share of the row below them; the oldest rows then leave over the top edge. */
const MAX_OVERLAP = 0.3;

export type DeskCard = {
  key: string;
  name: string;
  text: string;
  isBot: boolean;
  /** Degrees, -3 to 3, stable per idea. */
  tilt: number;
  /** 0 = newest. */
  rank: number;
  /** Position in the oldest-first flow (render order). */
  index: number;
  /** Row on the desk, 0 = top. */
  row: number;
};

export type DeskPlan = {
  /** Oldest first. */
  cards: DeskCard[];
  ghosts: number;
  /** Card font size in stage em. */
  fe: number;
  /** Card width in canvas px. */
  cardPx: number;
  perRow: number;
  rows: number;
  /** Canvas px that each row after the first is pulled up over the one above (0 when everything fits). */
  overlapPx: number;
  /** Real cards on the desk (ghosts not counted). */
  count: number;
};

/** Greedy word wrap at CHARS_PER_LINE: how many lines an idea will take. */
export function estimateLines(text: string): number {
  let lines = 1;
  let cur = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > CHARS_PER_LINE) {
      lines += cur > 0 ? 1 : 0;
      lines += Math.floor((word.length - 1) / CHARS_PER_LINE);
      cur = word.length % CHARS_PER_LINE || CHARS_PER_LINE;
    } else if (cur === 0) {
      cur = word.length;
    } else if (cur + 1 + word.length > CHARS_PER_LINE) {
      lines += 1;
      cur = word.length;
    } else {
      cur += 1 + word.length;
    }
  }
  return lines;
}

type Opts = {
  areaW: number;
  areaH: number;
  ladder: readonly number[];
  gapPx: number;
  cap?: number;
  fontPx?: number;
  ghostMin?: number;
};

function flow(lines: readonly number[], fe: number, o: Opts & { fontPx: number }) {
  const cardPx = CARD_EM * fe * o.fontPx;
  const perRow = Math.max(1, Math.floor((o.areaW + o.gapPx) / (cardPx + o.gapPx)));
  const rows = Math.ceil(lines.length / perRow) || 0;
  const heights: number[] = [];
  for (let r = 0; r < rows; r++) {
    let h = 0;
    for (const l of lines.slice(r * perRow, (r + 1) * perRow)) h = Math.max(h, (2 * PAD_Y_EM + l * LINE_EM + NAME_EM) * fe * o.fontPx);
    heights.push(h);
  }
  const height = heights.reduce((a, b) => a + b, 0) + Math.max(0, rows - 1) * o.gapPx;
  return { cardPx, perRow, rows, height, avgRow: rows ? heights.reduce((a, b) => a + b, 0) / rows : 0 };
}

export function planDesk(feed: readonly FeedIdea[], o: Opts): DeskPlan {
  const full = { ...o, fontPx: o.fontPx ?? 28 };
  const usable = usableIdeas(feed);
  const shown = usable.slice(Math.max(0, usable.length - (o.cap ?? RAIN_CAP)));
  const ghosts = Math.max(0, (o.ghostMin ?? GHOST_MIN) - shown.length);
  const lines = [...shown.map((i) => estimateLines(i.text)), ...Array<number>(ghosts).fill(2)];

  let at = o.ladder.length - 1;
  let fits = false;
  for (let i = 0; i < o.ladder.length; i++) {
    if (flow(lines, o.ladder[i], full).height <= o.areaH) {
      at = i;
      fits = true;
      break;
    }
  }
  const fe = o.ladder[at];
  const f = flow(lines, fe, full);
  const overlapPx = fits || f.rows < 2 ? 0 : Math.min((f.height - o.areaH) / (f.rows - 1), MAX_OVERLAP * f.avgRow);

  return {
    cards: shown.map((idea, index) => ({
      key: idea.key,
      name: idea.name,
      text: idea.text,
      isBot: idea.isBot,
      tilt: Math.round((unit(idea.key, "tilt") - 0.5) * 600) / 100,
      rank: shown.length - 1 - index,
      index,
      row: Math.floor(index / f.perRow),
    })),
    ghosts,
    fe,
    cardPx: f.cardPx,
    perRow: f.perRow,
    rows: f.rows,
    overlapPx,
    count: shown.length,
  };
}
