// Pure text/vector utilities and the greedy clusterer (AI_PROMPTS §8). No I/O, no env.

export type Vec = Float32Array;

/** Lowercase, strip emojis and punctuation, collapse spaces. Used for embedding input and dedupe. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** FNV-1a, 32 bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) seeded from a string. */
export function seededRng(seed: string): () => number {
  let a = hashString(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 = identical after normalisation, 0 = nothing in common. Labels are "too similar" at >= 0.8. */
export function similarityRatio(a: string, b: string): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  const max = Math.max(x.length, y.length);
  if (max === 0) return 1;
  return 1 - levenshtein(x, y) / max;
}

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function l2normalize(v: Vec): Vec {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  if (s === 0) return v;
  const inv = 1 / Math.sqrt(s);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return v;
}

export type ClusterItem = { id: string; text: string; vec: Vec; createdAt: number };

export type Cluster = {
  /** Rank by size (0 = largest). Persisted as ideas.cluster_id. */
  id: number;
  ideaIds: string[];
  size: number;
  /** size / total clustered ideas. */
  share: number;
  /** Unit-length mean direction. */
  centroid: Vec;
  /** Up to 5 idea ids nearest the centroid, deduped by normalised text. */
  repIds: string[];
};

export type Thresholds = { assign: number; merge: number };

// Provider thresholds are the spec values. The hashed bag-of-words vectors are sparse, so related
// ideas score far lower than dense embeddings do; the local pair was calibrated on the clustering
// fixture in src/tests/unit/ai-cluster.test.ts.
export const THRESHOLDS: { provider: Thresholds; local: Thresholds } = {
  provider: { assign: 0.62, merge: 0.72 },
  local: { assign: 0.25, merge: 0.3 },
};

type Work = { members: ClusterItem[]; sum: Float32Array; unit: Float32Array };

function addTo(w: Work, vec: Vec): void {
  for (let i = 0; i < vec.length; i++) w.sum[i] += vec[i];
  w.unit = l2normalize(Float32Array.from(w.sum));
}

/**
 * Greedy by arrival: nearest centroid if cosine >= assign, else a new cluster; centroids are
 * running means; then one merge pass over the size-ordered clusters.
 */
export function clusterIdeas(items: ClusterItem[], th: Thresholds): Cluster[] {
  if (items.length === 0) return [];
  const dim = items[0].vec.length;
  const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const works: Work[] = [];
  for (const item of sorted) {
    let best = -1;
    let bestSim = -Infinity;
    for (let i = 0; i < works.length; i++) {
      const s = dot(item.vec, works[i].unit);
      if (s > bestSim) {
        bestSim = s;
        best = i;
      }
    }
    if (best >= 0 && bestSim >= th.assign) {
      works[best].members.push(item);
      addTo(works[best], item.vec);
    } else {
      const w: Work = { members: [item], sum: new Float32Array(dim), unit: new Float32Array(dim) };
      addTo(w, item.vec);
      works.push(w);
    }
  }

  // One merge pass: larger clusters absorb later ones whose centroid is close enough.
  works.sort((a, b) => b.members.length - a.members.length);
  const absorbed = new Set<number>();
  for (let i = 0; i < works.length; i++) {
    if (absorbed.has(i)) continue;
    for (let j = i + 1; j < works.length; j++) {
      if (absorbed.has(j)) continue;
      if (dot(works[i].unit, works[j].unit) >= th.merge) {
        works[i].members.push(...works[j].members);
        for (let k = 0; k < dim; k++) works[i].sum[k] += works[j].sum[k];
        works[i].unit = l2normalize(Float32Array.from(works[i].sum));
        absorbed.add(j);
      }
    }
  }
  const merged = works.filter((_, i) => !absorbed.has(i));

  const first = (w: Work) => Math.min(...w.members.map((m) => m.createdAt));
  merged.sort((a, b) => b.members.length - a.members.length || first(a) - first(b));

  const total = sorted.length;
  return merged.map((w, id) => {
    const ranked = [...w.members]
      .map((m) => ({ m, s: dot(m.vec, w.unit) }))
      .sort((a, b) => b.s - a.s || a.m.createdAt - b.m.createdAt);
    const seen = new Set<string>();
    const repIds: string[] = [];
    for (const { m } of ranked) {
      const key = normalizeText(m.text);
      if (seen.has(key)) continue;
      seen.add(key);
      repIds.push(m.id);
      if (repIds.length === 5) break;
    }
    return {
      id,
      ideaIds: w.members.map((m) => m.id),
      size: w.members.length,
      share: w.members.length / total,
      centroid: w.unit,
      repIds,
    };
  });
}
