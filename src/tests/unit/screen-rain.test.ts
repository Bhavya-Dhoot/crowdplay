import { describe, expect, it } from "vitest";
import type { FeedIdea } from "@/lib/client/store";
import { hash, slidePath, unit, usableIdeas } from "@/components/screen/rain";

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

describe("usableIdeas", () => {
  it("drops rejected and blocked ideas", () => {
    const rejected = idea("fine text", { status: "rejected", rejectCode: "BLOCKED" });
    const ok = idea("a perfectly nice idea");
    expect(usableIdeas([rejected, ok]).map((f) => f.key)).toEqual([ok.key]);
    expect(usableIdeas([rejected])).toEqual([]);
  });
});

describe("hash and unit", () => {
  it("are deterministic and spread keys", () => {
    expect(hash("a")).toBe(hash("a"));
    expect(hash("a")).not.toBe(hash("b"));
    const u = unit("some key", "tilt");
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1);
    expect(unit("some key", "tilt")).toBe(u);
  });
});

describe("slidePath", () => {
  const W = 1700;
  const H = 520;
  it("is deterministic, keeps starts inside the area and deals cards to three even stacks", () => {
    const keys = Array.from({ length: 24 }, (_, i) => `k${i}`);
    const piles = [0, 0, 0];
    keys.forEach((k, i) => {
      const p = slidePath(k, i, W, H);
      expect(slidePath(k, i, W, H)).toEqual(p);
      expect(Math.abs(p.from.x)).toBeLessThanOrEqual(W / 2);
      expect(Math.abs(p.from.y)).toBeLessThanOrEqual(H / 2);
      piles[p.pile] += 1;
    });
    expect(piles).toEqual([8, 8, 8]);
  });

  it("lands each stack on its own side of the centre", () => {
    const left = slidePath("a", 0, W, H).to.x;
    const mid = slidePath("a", 1, W, H).to.x;
    const right = slidePath("a", 2, W, H).to.x;
    expect(left).toBeLessThan(mid);
    expect(mid).toBeLessThan(right);
  });
});
