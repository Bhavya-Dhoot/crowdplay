import { describe, expect, it } from "vitest";
import { CHARS_PER_LINE, DESK_LADDER, estimateLines, GHOST_MIN, planDesk } from "@/components/screen/desk";
import { RAIN_CAP } from "@/components/screen/rain";
import type { FeedIdea } from "@/lib/client/store";

let n = 0;
function idea(text: string, over: Partial<FeedIdea> = {}): FeedIdea {
  n += 1;
  return { key: `u${n}:m${n}`, userId: `u${n}`, clientMsgId: `m${n}`, name: `Player ${n}`, text, roundNo: 1, isBot: false, mine: false, status: "sent", at: n, ...over };
}
const feedOf = (count: number, text = "a stranger appears"): FeedIdea[] => Array.from({ length: count }, (_, i) => idea(`${text} ${i}`));

// The full stage's desk region in canvas px (1920 x 1080 minus header, footer, scene row and padding).
const FULL = { areaW: 1776, areaH: 638, ladder: DESK_LADDER.full, gapPx: 24 } as const;

describe("estimateLines", () => {
  it("counts a short idea as one line and wraps on words", () => {
    expect(estimateLines("a betrayal")).toBe(1);
    expect(estimateLines("one two three four five six seven eight nine ten")).toBe(4);
  });

  it("breaks a word longer than a line and always gives at least one line", () => {
    expect(estimateLines("x".repeat(CHARS_PER_LINE * 2 + 1))).toBe(3);
    expect(estimateLines("")).toBe(1);
  });
});

describe("planDesk", () => {
  it("never returns more than the cap and keeps the newest cards", () => {
    const feed = feedOf(120);
    const plan = planDesk(feed, FULL);
    expect(plan.cards.length).toBe(RAIN_CAP);
    expect(plan.count).toBe(RAIN_CAP);
    const keys = new Set(plan.cards.map((c) => c.key));
    expect(keys.has(feed[119].key)).toBe(true);
    expect(keys.has(feed[80].key)).toBe(true);
    expect(keys.has(feed[79].key)).toBe(false);
  });

  it("honours a smaller cap (compact mode)", () => {
    const plan = planDesk(feedOf(30), { areaW: 792, areaH: 339, ladder: DESK_LADDER.compact, gapPx: 10, cap: 6 });
    expect(plan.cards.length).toBe(6);
  });

  it("ranks cards by age: the oldest is first in the flow, the newest is rank 0 and last", () => {
    const feed = feedOf(15);
    const plan = planDesk(feed, FULL);
    expect(plan.cards[0].key).toBe(feed[0].key);
    expect(plan.cards[0].rank).toBe(14);
    expect(plan.cards[14].rank).toBe(0);
    expect(plan.cards.map((c) => c.index)).toEqual(plan.cards.map((_, i) => i));
  });

  it("scales a quiet room up: few ideas get a bigger card than many", () => {
    const few = planDesk(feedOf(3), FULL);
    const many = planDesk(feedOf(30), FULL);
    expect(few.fe).toBeGreaterThanOrEqual(1.5);
    expect(few.fe).toBeGreaterThan(many.fe);
    expect(few.overlapPx).toBe(0);
  });

  it("fills a quiet desk with ghost cards up to GHOST_MIN, and none after that", () => {
    expect(planDesk([], FULL).ghosts).toBe(GHOST_MIN);
    expect(planDesk(feedOf(2), FULL).ghosts).toBe(GHOST_MIN - 2);
    expect(planDesk(feedOf(GHOST_MIN), FULL).ghosts).toBe(0);
  });

  it("stacks rows into a heap only when the smallest card size still does not fit", () => {
    const heap = planDesk(feedOf(40, "the whole crew climbs out of the ventilation shaft"), FULL);
    expect(heap.fe).toBe(DESK_LADDER.full[DESK_LADDER.full.length - 1]);
    expect(heap.overlapPx).toBeGreaterThan(0);
    const calm = planDesk(feedOf(8), FULL);
    expect(calm.overlapPx).toBe(0);
  });

  it("assigns rows from the cards-per-row of the chosen size", () => {
    const plan = planDesk(feedOf(10), FULL);
    expect(plan.perRow).toBeGreaterThanOrEqual(1);
    for (const c of plan.cards) expect(c.row).toBe(Math.floor(c.index / plan.perRow));
    expect(plan.rows).toBe(Math.ceil((plan.count + plan.ghosts) / plan.perRow));
  });

  it("clamps long ideas to maxLines, so six long ones still fit the mini screen without a heap", () => {
    const long = "the whole crew climbs out of the ventilation shaft and keeps climbing while the guard counts sheep and sheep";
    const mini = { areaW: 768, areaH: 317, ladder: DESK_LADDER.compact, gapPx: 10, cap: 6 } as const;
    expect(estimateLines(long)).toBeGreaterThan(3);
    expect(planDesk(feedOf(6, long), mini).overlapPx).toBeGreaterThan(0);
    const clamped = planDesk(feedOf(6, long), { ...mini, maxLines: 3 });
    expect(clamped.overlapPx).toBe(0);
    expect(clamped.rows).toBeLessThanOrEqual(2);
  });

  it("drops rejected ideas and handles an empty feed", () => {
    const plan = planDesk([idea("bad", { status: "rejected", rejectCode: "BLOCKED" })], FULL);
    expect(plan.count).toBe(0);
    expect(plan.cards).toEqual([]);
  });

  it("gives every card a small stable tilt of at most 3 degrees", () => {
    const feed = feedOf(20);
    const a = planDesk(feed, FULL).cards;
    const b = planDesk(feed, FULL).cards;
    for (const c of a) {
      expect(Math.abs(c.tilt)).toBeLessThanOrEqual(3);
      expect(b.find((x) => x.key === c.key)?.tilt).toBe(c.tilt);
    }
  });
});
