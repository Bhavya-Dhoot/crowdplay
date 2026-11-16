import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ingest/filter", () => ({
  checkText: (t: string) => ({ ok: true, text: t.trim() }),
  isClean: () => true,
}));

import {
  clusterIdeas,
  hashString,
  normalizeText,
  seededRng,
  similarityRatio,
  THRESHOLDS,
  type ClusterItem,
} from "@/lib/ai/cluster";
import { hashedVector, LOCAL_DIM } from "@/lib/ai/embed";
import { cannedPool } from "@/lib/bots/canned";

const hashOf = (s: string) => hashString(s);

// ---- fixture: 200 ideas = 3 planted themes x 60 + 20 singletons --------------------------------

function pick<T>(rng: () => number, xs: T[]): T {
  return xs[Math.floor(rng() * xs.length)];
}

function buildFixture(): { items: ClusterItem[]; theme: Map<string, string> } {
  const rng = seededRng("cluster-fixture");
  const lead = ["", "lets ", "we should ", "i say "];
  const gens: Record<string, () => string> = {
    sneak: () =>
      `${pick(rng, lead)}${pick(rng, ["sneak", "slip", "creep", "crawl", "tiptoe"])} ${pick(rng, ["through", "into", "past", "inside"])} ${pick(rng, ["the air vents", "the vents", "the vents above the vault", "the old vents"])} ${pick(rng, ["quietly", "before the guards notice", "while nobody looks", ""])}`.trim(),
    distract: () =>
      `${pick(rng, lead)}${pick(rng, ["start", "cause", "create", "stage"])} ${pick(rng, ["a huge", "a big", "a loud", "a fake fire alarm"])} distraction ${pick(rng, ["in the lobby", "at the front desk", "in the ballroom"])} ${pick(rng, ["", "lol", "right now"])}`.trim(),
    insider: () =>
      `${pick(rng, lead)}${pick(rng, ["call", "phone", "ask", "text"])} ${pick(rng, ["the inside man", "our inside guy", "the guy on the inside", "our contact on the inside"])} ${pick(rng, ["for the vault code", "for the code", "for the key", "for help with the vault"])} ${pick(rng, ["", "first", "quickly"])}`.trim(),
  };
  const singles = [
    "teach the pigeon to juggle pineapples",
    "swap every portrait for a potato photo",
    "knit a sweater for the elevator",
    "challenge the manager to a chess match",
    "plant tulips along the marble staircase",
    "hold a spelling bee in the kitchen",
    "paint the chandelier bright orange",
    "borrow a camel from the zoo",
    "write a ballad about the doorman",
    "turn the fountain into soup",
    "install a trampoline on the ninth floor",
    "serve jellyfish at breakfast",
    "tune the grand piano to purple",
    "replace the guard rota with a puppet show",
    "mail ourselves to the penthouse",
    "film a documentary about the carpet",
    "translate the menu into whale song",
    "rent a tuba for dramatic effect",
    "organise a marathon around the lobby clock",
    "offer the doorman a mystery sandwich",
  ];
  const items: ClusterItem[] = [];
  const theme = new Map<string, string>();
  let t = 1_000;
  const add = (text: string, label: string) => {
    const id = `i${items.length}`;
    items.push({ id, text, vec: hashedVector(text), createdAt: t++ });
    theme.set(id, label);
  };
  // Arrival order is interleaved so no theme gets a head start.
  for (let i = 0; i < 60; i++) {
    for (const [label, gen] of Object.entries(gens)) add(gen(), label);
    if (i < singles.length) add(singles[i], `single:${i}`);
  }
  return { items, theme };
}

describe("normalizeText / similarityRatio", () => {
  it("lowercases, strips emoji and punctuation, collapses spaces", () => {
    expect(normalizeText("  Don't   SNEAK!!  \u{1F600} in, ok?  ")).toBe("dont sneak in ok");
  });
  it("is 1 for identical normalised text and low for unrelated text", () => {
    expect(similarityRatio("Sneak in!", "sneak  in")).toBe(1);
    expect(similarityRatio("The vault is empty", "A dragon sneezes sparks")).toBeLessThan(0.5);
  });
});

describe("hashed vectors", () => {
  it("are deterministic, fixed-dimension and unit length", () => {
    const a = hashedVector("sneak in through the air vents");
    const b = hashedVector("sneak in through the air vents");
    expect(a.length).toBe(LOCAL_DIM);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Math.hypot(...Array.from(a))).toBeCloseTo(1, 5);
  });
});

describe("clusterIdeas on the planted fixture (local vectors)", () => {
  const { items, theme } = buildFixture();
  const clusters = clusterIdeas(items, THRESHOLDS.local);

  it("has 200 ideas", () => {
    expect(items).toHaveLength(200);
    expect(clusters.reduce((n, c) => n + c.size, 0)).toBe(items.length);
  });

  it("recovers the three themes as the three largest clusters", () => {
    const top = clusters.slice(0, 3);
    const labels = new Set<string>();
    for (const c of top) {
      const counts = new Map<string, number>();
      for (const id of c.ideaIds) counts.set(theme.get(id)!, (counts.get(theme.get(id)!) ?? 0) + 1);
      const [label, n] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
      expect(c.size).toBeGreaterThanOrEqual(45);
      expect(n / c.size).toBeGreaterThanOrEqual(0.9); // pure
      labels.add(label);
    }
    expect([...labels].sort()).toEqual(["distract", "insider", "sneak"]);
  });

  it("keeps singletons small and out of the theme clusters", () => {
    for (const c of clusters.slice(3)) expect(c.size).toBeLessThanOrEqual(3);
    const themed = clusters.slice(0, 3).flatMap((c) => c.ideaIds);
    const strayed = themed.filter((id) => theme.get(id)!.startsWith("single:"));
    expect(strayed.length).toBeLessThanOrEqual(2);
  });

  it("gives representatives that are deduped by normalised text", () => {
    const text = new Map(items.map((i) => [i.id, i.text]));
    for (const c of clusters.slice(0, 3)) {
      expect(c.repIds.length).toBeGreaterThan(0);
      expect(c.repIds.length).toBeLessThanOrEqual(5);
      const norm = c.repIds.map((id) => normalizeText(text.get(id)!));
      expect(new Set(norm).size).toBe(norm.length);
    }
  });

  it("numbers clusters by size rank and reports shares", () => {
    clusters.forEach((c, i) => expect(c.id).toBe(i));
    for (let i = 1; i < clusters.length; i++) expect(clusters[i].size).toBeLessThanOrEqual(clusters[i - 1].size);
    expect(clusters[0].share).toBeCloseTo(clusters[0].size / items.length, 10);
  });

  it("is deterministic", () => {
    const again = clusterIdeas(items, THRESHOLDS.local);
    expect(again.map((c) => c.ideaIds)).toEqual(clusters.map((c) => c.ideaIds));
  });
});

describe("clusterIdeas on the canned demo pool", () => {
  it("turns the two obvious directions into the two biggest clusters", () => {
    const pool = cannedPool("heist");
    const family = new Map<string, string>();
    const items: ClusterItem[] = [];
    let t = 0;
    for (const [k, lines] of Object.entries(pool)) {
      for (const text of lines) {
        const id = `c${items.length}`;
        family.set(id, k);
        items.push({ id, text, vec: hashedVector(text), createdAt: t++ });
      }
    }
    // Interleave arrival like a live room instead of bucket by bucket.
    items.sort((x, y) => hashOf(x.text) - hashOf(y.text)).forEach((it, i) => (it.createdAt = i));
    const clusters = clusterIdeas(items, THRESHOLDS.local);
    const top2 = clusters.slice(0, 2).map((c) => {
      const counts = new Map<string, number>();
      for (const id of c.ideaIds) counts.set(family.get(id)!, (counts.get(family.get(id)!) ?? 0) + 1);
      return [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
    });
    expect(top2.map(([k]) => k).sort()).toEqual(["a", "b"]);
    for (const [, n] of top2) expect(n).toBeGreaterThanOrEqual(40);
  });
});

describe("clusterIdeas with provider-style dense vectors (tau 0.62 / merge 0.72)", () => {
  function gauss(rng: () => number): number {
    return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  }
  it("separates three tight themes from random singletons", () => {
    const rng = seededRng("dense");
    const dim = 64;
    const unit = (v: Float32Array) => {
      const n = Math.hypot(...Array.from(v));
      return v.map((x) => x / n) as Float32Array;
    };
    const items: ClusterItem[] = [];
    const label = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const v = new Float32Array(dim);
      const k = i < 180 ? i % 3 : -1;
      if (k >= 0) {
        v[k] = 1;
        for (let d = 0; d < dim; d++) v[d] += 0.075 * gauss(rng);
      } else {
        for (let d = 0; d < dim; d++) v[d] = gauss(rng);
      }
      items.push({ id: `d${i}`, text: `t${i}`, vec: unit(v), createdAt: i });
      label.set(`d${i}`, k);
    }
    const clusters = clusterIdeas(items, THRESHOLDS.provider);
    expect(clusters.slice(0, 3).map((c) => c.size)).toEqual([60, 60, 60]);
    for (const c of clusters.slice(0, 3)) expect(new Set(c.ideaIds.map((id) => label.get(id))).size).toBe(1);
    for (const c of clusters.slice(3)) expect(c.size).toBeLessThanOrEqual(2);
  });
});
