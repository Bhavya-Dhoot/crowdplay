// No-LLM option builder (FR-17 last resort, FR-16 edge cases, heuristicOnly, and the LLM-free paths).
// Two largest clusters' cleaned representative ideas + one seeded-random small cluster; narrator
// options fill whatever slot cannot be made from the crowd.
import { normalizeText, similarityRatio } from "./cluster";
import { safeLabel } from "./safety";

export type Candidate = {
  id: number;
  size: number;
  /** size / clustered ideas, 0..1 */
  share: number;
  /** Nearest-to-centroid first. */
  reps: { id: string; text: string }[];
};

export type PickedOption = {
  kind: "crowd" | "wildcard" | "narrator";
  label: string;
  /** Source cluster ids; empty for narrator options. */
  clusterIds: number[];
};

export const SIMILAR = 0.8;
export const WILD_MAX_SHARE = 0.15;

const LEAD = /^(?:(?:ok(?:ay)?|so|well|um+|uh+|hmm+|lol|lmao|yeah|yes|maybe|just|please|plz|pls|i (?:think|say|vote|guess|wanna|want to)|we should|we could|lets|let's|what if(?: we)?|what about(?: we)?|how about(?: we)?|ok but|i say we|can we|we can)[\s,:-]+)+/i;
const TRAIL = /(?:[\s,]+(?:lol|lmao|imo|haha+|plz|pls|please|obviously|tbh|ok|xd))+$/i;

/** Turn a raw idea into a ballot label (8-70 chars, filtered), or null if it cannot be one. */
export function cleanIdeaLabel(raw: string): string | null {
  let t = raw.replace(/\s+/g, " ").trim();
  t = t.replace(/[\p{Extended_Pictographic}️]/gu, "").trim();
  t = t.replace(/[!?.…\s]+$/u, "").replace(LEAD, "").replace(TRAIL, "").replace(/[!?.…,\s]+$/u, "").trim();
  if (!t) return null;
  t = t[0].toUpperCase() + t.slice(1);
  if (t.length > 70) {
    const cut = t.slice(0, 70);
    const sp = cut.lastIndexOf(" ");
    t = (sp >= 40 ? cut.slice(0, sp) : cut).replace(/[,;:\s-]+$/u, "");
  }
  return safeLabel(t);
}

function tooSimilar(label: string, others: string[]): boolean {
  return others.some((o) => similarityRatio(label, o) >= SIMILAR);
}

/**
 * Representatives in label order. With three or more, a long word that only one of them contains is
 * probably a typo, so those ideas go last; otherwise the nearest-to-centroid order stands.
 */
function labelOrder(reps: Candidate["reps"]): Candidate["reps"] {
  if (reps.length < 3) return reps;
  const words = reps.map((r) => normalizeText(r.text).split(" ").filter((w) => w.length >= 5));
  const df = new Map<string, number>();
  for (const ws of words) for (const w of new Set(ws)) df.set(w, (df.get(w) ?? 0) + 1);
  const odd = words.map((ws) => ws.filter((w) => df.get(w) === 1).length);
  return reps.map((r, i) => ({ r, i })).sort((a, b) => odd[a.i] - odd[b.i] || a.i - b.i).map((x) => x.r);
}

/** First representative that cleans to a valid, non-repeated label. */
export function labelFor(c: Candidate, avoid: string[]): string | null {
  for (const r of labelOrder(c.reps)) {
    const l = cleanIdeaLabel(r.text);
    if (l && !tooSimilar(l, avoid)) return l;
  }
  return null;
}

export type HeuristicArgs = {
  /** Every usable cluster, largest first. */
  clusters: Candidate[];
  narratorOptions: [string, string, string];
  excludeLabels?: string[];
  rng: () => number;
  /** Judge Mode: the cluster that should become the wildcard when it is usable. */
  preferredWildClusterId?: number | null;
};

export type HeuristicOut = {
  options: [PickedOption, PickedOption, PickedOption];
  backups: PickedOption[];
};

function pickWild(pool: { c: Candidate; label: string }[], rng: () => number): { c: Candidate; label: string } | null {
  if (pool.length === 0) return null;
  const small = pool.filter((p) => p.c.size <= 3);
  const from = small.length > 0 ? small : pool;
  return from[Math.floor(rng() * from.length)];
}

export function heuristicOptions(a: HeuristicArgs): HeuristicOut {
  const avoid = [...(a.excludeLabels ?? [])];
  const used: string[] = [];
  const usable: { c: Candidate; label: string }[] = [];
  for (const c of a.clusters) {
    const label = labelFor(c, avoid);
    if (label) usable.push({ c, label });
  }

  const take = (p: { c: Candidate; label: string }, kind: "crowd" | "wildcard"): PickedOption => {
    used.push(p.label);
    return { kind, label: p.label, clusterIds: [p.c.id] };
  };

  // Crowd: the two largest clusters with distinct labels.
  const crowd: { c: Candidate; label: string }[] = [];
  for (const p of usable) {
    if (crowd.length === 2) break;
    if (!tooSimilar(p.label, crowd.map((x) => x.label))) crowd.push(p);
  }
  const picked = new Set(crowd.map((p) => p.c.id));
  const opts: PickedOption[] = crowd.map((p) => take(p, "crowd"));

  // Wildcard: preferred (judge) cluster, else a seeded-random small one (share <= 15%, else the smallest left).
  const rest = usable.filter((p) => !picked.has(p.c.id) && !tooSimilar(p.label, used));
  let wild: { c: Candidate; label: string } | null = null;
  if (crowd.length === 2 && rest.length > 0) {
    const pref = a.preferredWildClusterId != null ? rest.find((p) => p.c.id === a.preferredWildClusterId) : undefined;
    if (pref) {
      wild = pref;
    } else {
      const small = rest.filter((p) => p.c.share <= WILD_MAX_SHARE);
      const smallest = [...rest].sort((x, y) => x.c.size - y.c.size)[0];
      wild = pickWild(small.length > 0 ? small : [smallest], a.rng);
    }
  }
  if (wild) {
    picked.add(wild.c.id);
    // Slot order is A, B (crowd) then C (wildcard).
    opts.push(take(wild, "wildcard"));
  }

  // Narrator options fill any missing slot, skipping ones that repeat what is already on the ballot.
  for (const n of a.narratorOptions) {
    if (opts.length === 3) break;
    const label = safeLabel(n) ?? n.trim().slice(0, 70);
    if (!tooSimilar(label, [...used, ...avoid])) {
      used.push(label);
      opts.push({ kind: "narrator", label, clusterIds: [] });
    }
  }
  while (opts.length < 3) {
    // Narrator options are distinct by construction; this only guards degenerate input.
    const n = a.narratorOptions[opts.length];
    opts.push({ kind: "narrator", label: n.trim().slice(0, 70), clusterIds: [] });
  }

  // Backups for veto: next two largest as crowd, then one more small cluster as wildcard.
  const backups: PickedOption[] = [];
  const left = usable.filter((p) => !picked.has(p.c.id) && !tooSimilar(p.label, used));
  for (const p of left) {
    if (backups.length === 2) break;
    if (!tooSimilar(p.label, backups.map((b) => b.label))) backups.push({ kind: "crowd", label: p.label, clusterIds: [p.c.id] });
  }
  const bIds = new Set(backups.flatMap((b) => b.clusterIds));
  const wildLeft = left.filter(
    (p) => !bIds.has(p.c.id) && p.c.share <= WILD_MAX_SHARE && !tooSimilar(p.label, backups.map((b) => b.label)),
  );
  const bw = pickWild(wildLeft, a.rng);
  if (bw) backups.push({ kind: "wildcard", label: bw.label, clusterIds: [bw.c.id] });

  return { options: [opts[0], opts[1], opts[2]], backups };
}
