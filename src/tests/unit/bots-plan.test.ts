import { describe, expect, it } from "vitest";
import {
  BOT_VOTE_WEIGHTS,
  assignBots,
  eventWindow,
  pickWeighted,
  planOffsets,
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
