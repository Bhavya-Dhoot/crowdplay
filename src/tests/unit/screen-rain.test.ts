import { describe, expect, it } from "vitest";
import type { FeedIdea } from "@/lib/client/store";
import { hash, planRain, rainOpacity, RAIN_CAP, swirlPath, usableIdeas } from "@/components/screen/rain";

let n = 0;
function idea(text: string, over: Partial<FeedIdea> = {}): FeedIdea {
  n += 1;
  return {
    key: `u${n}:m${n}`,
    userId: `u${n}`,
    clientMsgId: `m${n}`,
    name: `Player ${n}`,
    text,
    roundNo: 1,
    isBot: false,
    mine: false,
    status: "sent",
    at: n,
    ...over,
  };
}
const feedOf = (count: number, text = "a stranger appears"): FeedIdea[] => Array.from({ length: count }, (_, i) => idea(`${text} ${i}`));

describe("planRain", () => {
  it("never returns more than the cap and keeps the newest cards", () => {
    const feed = feedOf(120);
    const plan = planRain(feed, 5);
    const all = plan.columns.flat();
    expect(all.length).toBe(RAIN_CAP);
    expect(plan.count).toBe(RAIN_CAP);
    const keys = new Set(all.map((c) => c.key));
    expect(keys.has(feed[119].key)).toBe(true);
    expect(keys.has(feed[80].key)).toBe(true);
    expect(keys.has(feed[79].key)).toBe(false);
  });

  it("honours a smaller cap (compact mode)", () => {
    const plan = planRain(feedOf(30), 3, 12);
    expect(plan.columns.flat().length).toBe(12);
  });

  it("puts the newest card first inside each column and ranks cards by age", () => {
    const feed = feedOf(15);
    const plan = planRain(feed, 3);
    for (const col of plan.columns) {
      const ranks = col.map((c) => c.rank);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
    const newest = plan.columns.flat().find((c) => c.rank === 0);
    expect(newest?.key).toBe(feed[14].key);
  });

  it("keeps a card in its column when later ideas arrive", () => {
    const feed = feedOf(30);
    const before = planRain(feed, 5);
    const colBefore = new Map(before.columns.flat().map((c) => [c.key, c.col]));
    const after = planRain([...feed, ...feedOf(10, "something falls")], 5);
    for (const c of after.columns.flat()) {
      if (colBefore.has(c.key)) expect(c.col).toBe(colBefore.get(c.key));
    }
  });

  it("balances columns for similar ideas", () => {
    const plan = planRain(feedOf(40), 5);
    const sizes = plan.columns.map((c) => c.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("gives a long idea more weight than a short one", () => {
    const long = "the whole crew climbs out of the ventilation shaft just as the alarm starts to sing along with the radio";
    const feed = [idea(long), idea("hi"), idea("yo"), idea("ok")];
    const plan = planRain(feed, 2);
    // the long idea fills column 0, so the three short ones land in column 1
    expect(plan.columns[0].map((c) => c.text)).toEqual([long]);
    expect(plan.columns[1].length).toBe(3);
  });

  it("drops rejected and blocked ideas", () => {
    const rejected = idea("fine text", { status: "rejected", rejectCode: "BLOCKED" });
    const ok = idea("a perfectly nice idea");
    expect(usableIdeas([rejected, ok]).map((f) => f.key)).toEqual([ok.key]);
    expect(planRain([rejected], 3).count).toBe(0);
  });

  it("handles an empty feed and a degenerate column count", () => {
    expect(planRain([], 5).columns.length).toBe(5);
    expect(planRain(feedOf(3), 0).columns.length).toBe(1);
  });

  it("gives every card a small stable tilt", () => {
    const feed = feedOf(20);
    const a = planRain(feed, 4).columns.flat();
    const b = planRain(feed, 4).columns.flat();
    for (const c of a) {
      expect(Math.abs(c.tilt)).toBeLessThanOrEqual(1.2);
      expect(b.find((x) => x.key === c.key)?.tilt).toBe(c.tilt);
    }
  });
});

describe("rainOpacity", () => {
  it("is solid for the newest card and fades, but never vanishes", () => {
    expect(rainOpacity(0)).toBe(1);
    expect(rainOpacity(10)).toBeLessThan(rainOpacity(2));
    expect(rainOpacity(500)).toBeGreaterThan(0.2);
  });
});

describe("hash", () => {
  it("is deterministic and spreads keys", () => {
    expect(hash("a")).toBe(hash("a"));
    expect(hash("a")).not.toBe(hash("b"));
  });
});

describe("swirlPath", () => {
  const W = 1700;
  const H = 520;
  it("is deterministic, keeps starts inside the area and deals cards to three even piles", () => {
    const keys = Array.from({ length: 24 }, (_, i) => `k${i}`);
    const piles = [0, 0, 0];
    keys.forEach((k, i) => {
      const p = swirlPath(k, i, W, H);
      expect(swirlPath(k, i, W, H)).toEqual(p);
      expect(Math.abs(p.from.x)).toBeLessThanOrEqual(W / 2);
      expect(Math.abs(p.from.y)).toBeLessThanOrEqual(H / 2);
      piles[p.pile] += 1;
    });
    expect(piles).toEqual([8, 8, 8]);
  });

  it("lands each pile on its own side of the centre", () => {
    const left = swirlPath("a", 0, W, H).to.x;
    const mid = swirlPath("a", 1, W, H).to.x;
    const right = swirlPath("a", 2, W, H).to.x;
    expect(left).toBeLessThan(mid);
    expect(mid).toBeLessThan(right);
  });
});
