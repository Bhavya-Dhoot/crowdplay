import { describe, expect, it } from "vitest";
import type { FeedIdea } from "@/lib/client/store";
import { deal, hash, unit, usableIdeas } from "@/components/screen/rain";

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

describe("deal", () => {
  it("is deterministic and deals notes to three even boxes", () => {
    const keys = Array.from({ length: 24 }, (_, i) => `k${i}`);
    const piles = [0, 0, 0];
    keys.forEach((k, i) => {
      const d = deal(k, i);
      expect(deal(k, i)).toEqual(d);
      piles[d.pile] += 1;
    });
    expect(piles).toEqual([8, 8, 8]);
  });

  it("gives every note a small stable tilt of at most 3 degrees", () => {
    for (let i = 0; i < 30; i++) expect(Math.abs(deal(`n${i}`, i).tilt)).toBeLessThanOrEqual(3);
    expect(deal("a", 0).tilt).toBe(deal("a", 0).tilt);
  });
});
