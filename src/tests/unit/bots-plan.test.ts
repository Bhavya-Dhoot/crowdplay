import { describe, expect, it } from "vitest";
import { DEMO, leanFor, revealHoldMs } from "@/lib/bots/demo";
import { templateNarration } from "@/lib/bots/fallbacks";
import {
  BOT_VOTE_WEIGHTS,
  assignBots,
  eventWindow,
  pickWeighted,
  planOffsets,
  planVotes,
} from "@/lib/bots/runner";
import { BOT_ID_RE, BOT_PERSONAS } from "@/lib/bots/personas";

/** Same generator the runner uses, copied so the test does not depend on its internals. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("bot personas", () => {
  it("are 30 distinct, stable bot ids with distinct names", () => {
    expect(BOT_PERSONAS).toHaveLength(30);
    expect(new Set(BOT_PERSONAS.map((p) => p.id)).size).toBe(30);
    expect(new Set(BOT_PERSONAS.map((p) => p.name)).size).toBe(30);
    for (const p of BOT_PERSONAS) expect(p.id).toMatch(BOT_ID_RE);
  });
});

describe("planOffsets", () => {
  it("places every event inside the window, sorted", () => {
    const o = planOffsets(60, rng(1));
    expect(o).toHaveLength(60);
    expect(o.every((f) => f >= 0 && f <= 1)).toBe(true);
    expect([...o].sort((a, b) => a - b)).toEqual(o);
  });

  it("is bursty, not uniform: an opening rush and a late scramble", () => {
    const o = planOffsets(2000, rng(7));
    const share = (a: number, b: number) => o.filter((f) => f >= a && f < b).length / o.length;
    expect(share(0, 0.2)).toBeGreaterThan(0.3); // a uniform spread would be 0.2
    expect(share(0.84, 1)).toBeGreaterThan(0.15);
    expect(share(0.38, 0.46)).toBeGreaterThan(0.11); // a mid-window burst (uniform: 0.08)
  });

  it("is deterministic for a seed and handles zero", () => {
    expect(planOffsets(10, rng(3))).toEqual(planOffsets(10, rng(3)));
    expect(planOffsets(0, rng(3))).toEqual([]);
  });
});

describe("eventWindow", () => {
  it("keeps a lead after opening and a tail before the deadline", () => {
    const w = eventWindow(10_000, 10_000, 40_000, 600, 1200)!;
    expect(w.from).toBe(10_600);
    expect(w.to).toBe(38_800);
  });

  it("starts from now when the phase opened earlier", () => {
    const w = eventWindow(20_000, 10_000, 40_000, 600, 1200)!;
    expect(w.from).toBeCloseTo(20_600);
    expect(w.to).toBe(38_800);
  });

  it("scales lead and tail down in a very short phase and never passes the deadline", () => {
    const w = eventWindow(0, 0, 1000, 600, 1200)!;
    expect(w.from).toBeLessThan(w.to);
    expect(w.to).toBeLessThanOrEqual(1000);
  });

  it("returns null when there is no time left or no deadline", () => {
    expect(eventWindow(9_900, 0, 10_000, 600, 1200)).toBeNull();
    expect(eventWindow(0, 0, null, 600, 1200)).toBeNull();
  });
});

describe("assignBots", () => {
  it("lets all 30 bots speak once before anyone speaks twice, and caps each bot", () => {
    const out = assignBots(60, rng(11));
    expect(out).toHaveLength(60);
    expect(new Set(out.slice(0, 30).map((p) => p.id)).size).toBe(30);
    const per = new Map<string, number>();
    for (const p of out) per.set(p.id, (per.get(p.id) ?? 0) + 1);
    expect(Math.max(...per.values())).toBeLessThanOrEqual(6);
    expect(Math.min(...per.values())).toBeGreaterThanOrEqual(1);
  });

  it("favours chatty bots over terse ones", () => {
    let chatty = 0;
    let terse = 0;
    for (let s = 1; s <= 40; s++) {
      for (const p of assignBots(90, rng(s)).slice(30)) {
        if (p.verbosity === "chatty") chatty++;
        if (p.verbosity === "terse") terse++;
      }
    }
    expect(chatty).toBeGreaterThan(terse);
  });
});

describe("pickWeighted and the vote weights", () => {
  it("maps a uniform draw onto the weights", () => {
    expect(pickWeighted([1, 1, 2], 0)).toBe(0);
    expect(pickWeighted([1, 1, 2], 0.49)).toBe(1);
    expect(pickWeighted([1, 1, 2], 0.99)).toBe(2);
    expect(pickWeighted([0, 0, 0], 0.5)).toBe(0);
  });

  it("gives a slight bias to A but leaves the wildcard a real share", () => {
    const r = rng(42);
    const slots = ["A", "B", "C"] as const;
    const hits = { A: 0, B: 0, C: 0 };
    const n = 30_000;
    for (let i = 0; i < n; i++) hits[slots[pickWeighted(slots.map((s) => BOT_VOTE_WEIGHTS[s]), r())]]++;
    expect(hits.A).toBeGreaterThan(hits.B);
    expect(hits.B).toBeGreaterThan(hits.C);
    expect(hits.A / n).toBeCloseTo(BOT_VOTE_WEIGHTS.A, 1);
    expect(hits.C / n).toBeGreaterThan(0.2);
    expect(slots.reduce((s, k) => s + BOT_VOTE_WEIGHTS[k], 0)).toBeCloseTo(1, 5);
  });
});

describe("planVotes (Judge Mode lean)", () => {
  const slots = ["A", "B", "C"] as const;
  const tally = (votes: readonly string[]) => ({ A: votes.filter((v) => v === "A").length, B: votes.filter((v) => v === "B").length, C: votes.filter((v) => v === "C").length });

  it("without a lean it is one weighted draw per bot, same as before", () => {
    const votes = planVotes(slots, 30, rng(5));
    expect(votes).toHaveLength(30);
    const r = rng(5);
    expect(votes).toEqual(Array.from({ length: 30 }, () => slots[pickWeighted(slots.map((s) => BOT_VOTE_WEIGHTS[s]), r())]));
  });

  it("an exact lean gives the favoured slot more than half the bots, for every seed, whatever the other draws do", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const t = tally(planVotes(slots, 30, rng(seed), { slot: "C", share: DEMO.forcedLeanShare, exact: true }));
      expect(t.C).toBe(18);
      expect(t.C).toBeGreaterThan(Math.max(t.A, t.B)); // 18 vs at most 12 left for the rest
      expect(t.A + t.B).toBe(12);
    }
    // Another slot, and a ballot of two.
    expect(tally(planVotes(slots, 30, rng(9), { slot: "A", share: 0.6, exact: true })).A).toBe(18);
    expect(planVotes(["A", "B"], 10, rng(3), { slot: "C", share: 0.6, exact: true }).every((v) => v === "A" || v === "B")).toBe(true);
  });

  it("a soft lean makes the favoured slot the likely winner without deciding every round", () => {
    let wins = 0;
    const rounds = 400;
    for (let seed = 1; seed <= rounds; seed++) {
      const t = tally(planVotes(slots, 30, rng(seed), { slot: "C", share: DEMO.softLeanShare, exact: false }));
      if (t.C > t.A && t.C > t.B) wins++;
    }
    expect(wins / rounds).toBeGreaterThan(0.9);
    expect(wins).toBeLessThan(rounds + 1);
  });

  it("is deterministic for a seed", () => {
    const lean = { slot: "C" as const, share: 0.6, exact: true };
    expect(planVotes(slots, 30, rng(8), lean)).toEqual(planVotes(slots, 30, rng(8), lean));
  });
});

describe("demo pacing rules", () => {
  it("leans only while the judge has no canon: none in round 1, soft in the middle, sure in the last round", () => {
    expect(leanFor(1, 3, 0)).toBeNull();
    expect(leanFor(2, 3, 0)).toEqual({ share: DEMO.softLeanShare, exact: false });
    expect(leanFor(3, 3, 0)).toEqual({ share: DEMO.forcedLeanShare, exact: true });
    for (const r of [1, 2, 3]) expect(leanFor(r, 3, 1)).toBeNull();
    expect(leanFor(1, 1, 0)?.exact).toBe(true);
  });

  it("holds REVEAL for the typewriter plus reading time: 8 s for a short narration, longer for a long one, capped", () => {
    expect(revealHoldMs("A short line.")).toBe(8000);
    expect(revealHoldMs("x".repeat(150))).toBe(8000);
    expect(revealHoldMs("x".repeat(200))).toBeGreaterThan(8000);
    expect(revealHoldMs("x".repeat(200))).toBeLessThan(8600);
    expect(revealHoldMs("x".repeat(300))).toBeGreaterThan(11_000);
    expect(revealHoldMs("x".repeat(5000))).toBe(DEMO.revealMaxHoldMs);
  });

  it("the no-model narration of a demo round is readable inside about 8.5 s", () => {
    const label = "We hire a pigeon as our getaway driver, no questions asked at all"; // a long label (the limit is 70)
    for (let round = 1; round <= 3; round++) {
      const line = templateNarration(label, { roundNo: round, roundsTotal: 3, scene: "The Guard Dog Wakes Up", final: round === 3 });
      expect(revealHoldMs(line), `round ${round} (${line.length} characters)`).toBeLessThanOrEqual(10_000);
    }
  });
});
