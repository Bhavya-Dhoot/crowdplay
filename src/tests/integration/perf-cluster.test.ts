// Performance guard for the clusterer (F5, TECH_SPEC §14): hundreds of singleton clusters must stay cheap, and the
// sparse-vector shortcut must produce exactly the clusters the plain dense algorithm produces.
import { describe, expect, it } from "vitest";
import { clusterIdeas, dot, l2normalize, THRESHOLDS, type ClusterItem, type Thresholds, type Vec } from "@/lib/ai/cluster";
import { hashedVector } from "@/lib/ai/embed";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 2 ** 32;
  };
}

/** The greedy assign + one merge pass exactly as AI_PROMPTS §8 describes it, with a plain dense dot product everywhere. */
function referenceClusters(items: ClusterItem[], th: Thresholds): string[][] {
  type W = { ids: string[]; first: number; sum: Float32Array; unit: Float32Array };
  const dim = items[0].vec.length;
  const works: W[] = [];
  const add = (w: W, vec: Vec) => {
    for (let i = 0; i < dim; i++) w.sum[i] += vec[i];
    w.unit = l2normalize(Float32Array.from(w.sum));
  };
  for (const it of [...items].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))) {
    let best = -1;
    let bestSim = -Infinity;
    works.forEach((w, i) => {
      const s = dot(it.vec, w.unit);
      if (s > bestSim) {
        bestSim = s;
        best = i;
      }
    });
    if (best >= 0 && bestSim >= th.assign) {
      works[best].ids.push(it.id);
      works[best].first = Math.min(works[best].first, it.createdAt);
      add(works[best], it.vec);
    } else {
      const w: W = { ids: [it.id], first: it.createdAt, sum: new Float32Array(dim), unit: new Float32Array(dim) };
      add(w, it.vec);
      works.push(w);
    }
  }
  works.sort((a, b) => b.ids.length - a.ids.length);
  const absorbed = new Set<number>();
  for (let i = 0; i < works.length; i++) {
    if (absorbed.has(i)) continue;
    for (let j = i + 1; j < works.length; j++) {
      if (absorbed.has(j) || dot(works[i].unit, works[j].unit) < th.merge) continue;
      works[i].ids.push(...works[j].ids);
      works[i].first = Math.min(works[i].first, works[j].first);
      for (let k = 0; k < dim; k++) works[i].sum[k] += works[j].sum[k];
      works[i].unit = l2normalize(Float32Array.from(works[i].sum));
      absorbed.add(j);
    }
  }
  return works
    .filter((_, i) => !absorbed.has(i))
    .sort((a, b) => b.ids.length - a.ids.length || a.first - b.first)
    .map((w) => w.ids);
}

function items(texts: string[]): ClusterItem[] {
  return texts.map((text, i) => ({ id: `i${i}`, text, vec: hashedVector(text), createdAt: 1000 + i }));
}

/** Six-word salads from a 900-word vocabulary: almost every idea is a cluster of its own. */
function salad(n: number, seed: number): string[] {
  const next = rng(seed);
  const vocab = Array.from({ length: 900 }, (_, i) => `w${i.toString(36)}x${((i * 7919) % 997).toString(36)}`);
  return Array.from({ length: n }, () => Array.from({ length: 6 }, () => vocab[Math.floor(next() * vocab.length)]).join(" "));
}

describe("clusterIdeas: sparse shortcut = dense algorithm", () => {
  const themed = (() => {
    const next = rng(5);
    const themes = ["sneak through the vents", "pull the fire alarm", "bribe the guard with a sandwich", "dig a tunnel from the kitchen"];
    return Array.from({ length: 400 }, (_, i) => `${themes[Math.floor(next() * themes.length)]} ${i % 5 === 0 ? "quietly" : ""} ${salad(1, i)[0].split(" ")[0]}`.trim());
  })();

  for (const [name, texts] of [
    ["word salad", salad(500, 11)],
    ["themed ideas with one-off words", themed],
  ] as const) {
    it(`gives the same clusters on ${name} at local and provider thresholds`, () => {
      const set = items(texts);
      for (const th of [THRESHOLDS.local, THRESHOLDS.provider, { assign: 0.12, merge: 0.2 }]) {
        const got = clusterIdeas(set, th);
        const want = referenceClusters(set, th);
        expect(got.map((c) => c.ideaIds)).toEqual(want);
      }
    });
  }

  it("gives the same clusters on dense (provider-style) vectors", () => {
    const next = rng(3);
    const set: ClusterItem[] = Array.from({ length: 300 }, (_, i) => {
      const v = new Float32Array(512);
      for (let k = 0; k < v.length; k++) v[k] = next() - 0.5 + (i % 6 === 0 ? 0.35 : 0);
      return { id: `d${i}`, text: `d${i}`, vec: l2normalize(v), createdAt: 1000 + i };
    });
    for (const th of [THRESHOLDS.local, { assign: 0.3, merge: 0.4 }]) {
      expect(clusterIdeas(set, th).map((c) => c.ideaIds)).toEqual(referenceClusters(set, th));
    }
  });
});

describe("clusterIdeas: a crowd of one-offs", () => {
  it("clusters 1500 ideas that are mostly singletons well inside the DISTILL budget", () => {
    const set = items(salad(1500, 7));
    const t0 = performance.now();
    const clusters = clusterIdeas(set, THRESHOLDS.provider); // strict threshold: ~1200 singleton clusters, the slow case
    const ms = performance.now() - t0;
    expect(clusters.length).toBeGreaterThan(1000);
    expect(clusters.reduce((n, c) => n + c.size, 0)).toBe(1500);
    // About 0.4 s on a 2021 laptop; the dense loop took 3.5 s here. The bound leaves room for a busy CI machine.
    expect(ms).toBeLessThan(1500);
  });
});
