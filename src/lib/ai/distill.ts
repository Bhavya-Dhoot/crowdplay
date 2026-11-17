// Distill pipeline (TECH_SPEC §7, AI_PROMPTS §2): ideas -> clusters -> candidates -> three ballot
// options. LLM output is untrusted: every answer passes validateDistill, and the chain is
// anthropic (5 s) -> openai (3 s) -> heuristics inside one budget. DB-free.
import { z } from "zod";
import { env } from "@/lib/config";
import { log } from "@/lib/log";
import {
  clusterIdeas,
  dot,
  seededRng,
  similarityRatio,
  THRESHOLDS,
  type Cluster,
  type ClusterItem,
} from "./cluster";
import { getVectors } from "./embed";
import { heuristicOptions, SIMILAR, WILD_MAX_SHARE, type Candidate, type PickedOption } from "./heuristics";
import { mockDistillOut, mockDistillThink } from "./mock";
import { availableProviders, callJSON, type LlmProvider } from "./providers";
import { fenceIdea, ideaVerdict, safeLabel, UNTRUSTED_NOTE } from "./safety";
import type { DistillIdea, DistillInput, DistillResult, DistilledOption, Provider } from "./types";

const OptionSchema = z.object({
  label: z.string().min(8).max(70),
  kind: z.enum(["crowd", "wildcard"]),
  sourceClusterIds: z.array(z.number().int()).min(1).max(3),
});

// `options` is a length-3 array rather than a tuple: tuples become prefixItems in JSON Schema,
// which providers handle unevenly. validateDistill still requires crowd, crowd, wildcard.
export const DistillOutSchema = z.object({
  options: z.array(OptionSchema).length(3),
  backups: z.array(OptionSchema).max(3),
  unsafeClusterIds: z.array(z.number().int()),
});
export type DistillOutput = z.infer<typeof DistillOutSchema>;

export type ValidOption = { kind: "crowd" | "wildcard"; label: string; clusterIds: number[] };
export type ValidDistill = {
  options: [ValidOption, ValidOption, ValidOption];
  backups: ValidOption[];
  unsafeClusterIds: number[];
};

export type ValidateCtx = {
  /** Every usable cluster id -> size. */
  sizes: Map<number, number>;
  /** Clusters shown to the model as crowd candidates (the largest). */
  crowdIds: Set<number>;
  totalIdeas: number;
  /** Labels a re-roll must not repeat. */
  excludeLabels: string[];
};

export type ValidateResult = { ok: true; value: ValidDistill } | { ok: false; errors: string[] };

/** Every rule from AI_PROMPTS §2 / FR-13..15. Backups are filtered leniently; options are all-or-nothing. */
export function validateDistill(raw: unknown, ctx: ValidateCtx): ValidateResult {
  const parsed = DistillOutSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const out = parsed.data;
  const errors: string[] = [];
  const minSize = Math.min(...ctx.sizes.values());
  const unsafe = new Set(out.unsafeClusterIds.filter((id) => ctx.sizes.has(id)));

  const wantKinds = ["crowd", "crowd", "wildcard"] as const;
  const options: ValidOption[] = [];
  const usedClusters = new Set<number>();
  const labels: string[] = [];

  out.options.forEach((o, i) => {
    const slot = `options[${i}]`;
    if (o.kind !== wantKinds[i]) errors.push(`${slot}.kind must be ${wantKinds[i]}`);
    const ids = [...new Set(o.sourceClusterIds)];
    for (const id of ids) {
      if (!ctx.sizes.has(id)) errors.push(`${slot} uses unknown cluster ${id}`);
      else if (unsafe.has(id)) errors.push(`${slot} uses cluster ${id} that you flagged unsafe`);
      else if (usedClusters.has(id)) errors.push(`cluster ${id} is used by more than one option`);
      else if (wantKinds[i] === "crowd" && !ctx.crowdIds.has(id)) errors.push(`${slot} cluster ${id} is not a crowd cluster`);
      else if (wantKinds[i] === "wildcard") {
        const size = ctx.sizes.get(id) ?? 0;
        if (size / ctx.totalIdeas > WILD_MAX_SHARE && size !== minSize) {
          errors.push(`${slot} wildcard cluster ${id} is too big (must be a small cluster)`);
        }
      }
    }
    ids.forEach((id) => usedClusters.add(id));
    const label = safeLabel(o.label);
    if (!label) errors.push(`${slot}.label must be 8-70 chars, plain, safe, no emoji, not a question`);
    else {
      if (labels.some((l) => similarityRatio(l, label) >= SIMILAR)) errors.push(`${slot}.label is too similar to another option`);
      if (ctx.excludeLabels.some((l) => similarityRatio(l, label) >= SIMILAR)) errors.push(`${slot}.label repeats an excluded label`);
      labels.push(label);
    }
    options.push({ kind: wantKinds[i], label: label ?? o.label, clusterIds: ids });
  });
  if (errors.length > 0) return { ok: false, errors };

  const backups: ValidOption[] = [];
  for (const b of out.backups) {
    const ids = [...new Set(b.sourceClusterIds)];
    const label = safeLabel(b.label);
    if (!label) continue;
    if (ids.some((id) => !ctx.sizes.has(id) || unsafe.has(id) || usedClusters.has(id))) continue;
    if ([...labels, ...ctx.excludeLabels, ...backups.map((x) => x.label)].some((l) => similarityRatio(l, label) >= SIMILAR)) continue;
    if (backups.some((x) => x.clusterIds.some((id) => ids.includes(id)))) continue;
    backups.push({ kind: b.kind, label, clusterIds: ids });
  }

  return {
    ok: true,
    value: {
      options: [options[0], options[1], options[2]],
      backups,
      unsafeClusterIds: [...unsafe],
    },
  };
}

// ---------- preparation: clusters and candidates ----------

const MAX_LEXICAL_SAMPLE = 120;
const CROWD_CLUSTERS = 8;
/** Prompt size: the model sees this many wild clusters and, per crowd cluster, this many representative ideas. */
const WILD_CLUSTERS = 20;
const CROWD_REPS = 3;

type Prepared = {
  usable: (DistillIdea & { text: string })[];
  blockedIdeaIds: string[];
  clusters: Cluster[];
  textOf: Map<string, string>;
  cand: Map<number, Candidate>;
  crowd: Candidate[];
  wild: Candidate[];
  preferred: number | null;
  ctx: ValidateCtx;
  degraded: boolean;
  /** For the timing log: how long the vectors took and how many ideas had to be embedded on the spot. */
  vectorsMs: number;
  stragglers: number;
};

function toCandidate(c: Cluster, textOf: Map<string, string>): Candidate {
  return { id: c.id, size: c.size, share: c.share, reps: c.repIds.map((id) => ({ id, text: textOf.get(id) ?? "" })) };
}

/** Farthest-point sampling over centroids, started from a seeded pick, so the wild list is varied. */
function diverse(pool: Cluster[], n: number, rng: () => number): Cluster[] {
  if (n <= 0) return [];
  if (pool.length <= n) return pool;
  const chosen = [pool[Math.floor(rng() * pool.length)]];
  const minDist = pool.map((c) => 1 - dot(c.centroid, chosen[0].centroid));
  while (chosen.length < n) {
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < pool.length; i++) {
      if (!chosen.includes(pool[i]) && minDist[i] > bestD) {
        bestD = minDist[i];
        best = i;
      }
    }
    if (best < 0) break;
    chosen.push(pool[best]);
    for (let i = 0; i < pool.length; i++) minDist[i] = Math.min(minDist[i], 1 - dot(pool[i].centroid, pool[best].centroid));
  }
  return chosen;
}

async function prepare(input: DistillInput, rng: () => number): Promise<Prepared> {
  const usable: Prepared["usable"] = [];
  const blockedIdeaIds: string[] = [];
  for (const idea of input.ideas) {
    const v = ideaVerdict(idea.text);
    if (v.verdict === "ok") usable.push({ ...idea, text: v.text });
    else if (v.verdict === "blocked") blockedIdeaIds.push(idea.id);
  }
  const textOf = new Map(usable.map((i) => [i.id, i.text]));

  const tVectors = Date.now();
  const vecs = await getVectors(
    usable.map((i) => ({ id: i.id, text: i.text })),
    { waitMs: input.heuristicOnly ? 0 : 500 },
  );
  const vectorsMs = Date.now() - tVectors;
  if (vecs.degraded) {
    log.warn({ roomId: input.roomId, roundNo: input.roundNo }, "embeddings unavailable: lexical clustering on a sample");
  }
  const th = vecs.source === "provider" ? THRESHOLDS.provider : THRESHOLDS.local;
  const items: ClusterItem[] = usable
    .map((i) => ({ id: i.id, text: i.text, vec: vecs.vectors.get(i.id)!, createdAt: i.createdAt }))
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));

  let clusters: Cluster[];
  if (vecs.degraded && items.length > MAX_LEXICAL_SAMPLE) {
    // LLM-only path (B2): cluster a stride sample, then attach the rest to the nearest cluster if close.
    const stride = items.length / MAX_LEXICAL_SAMPLE;
    const picked = new Set(Array.from({ length: MAX_LEXICAL_SAMPLE }, (_, k) => Math.floor(k * stride)));
    clusters = clusterIdeas(
      items.filter((_, k) => picked.has(k)),
      th,
    );
    items.forEach((it, k) => {
      if (picked.has(k)) return;
      let best: Cluster | null = null;
      let bestSim = th.assign;
      for (const c of clusters) {
        const s = dot(it.vec, c.centroid);
        if (s >= bestSim) {
          bestSim = s;
          best = c;
        }
      }
      if (best) best.ideaIds.push(it.id);
    });
    const total = clusters.reduce((n, c) => n + c.ideaIds.length, 0);
    clusters.sort((a, b) => b.ideaIds.length - a.ideaIds.length);
    clusters.forEach((c, i) => {
      c.id = i;
      c.size = c.ideaIds.length;
      c.share = c.size / total;
    });
  } else {
    clusters = clusterIdeas(items, th);
  }

  const cand = new Map(clusters.map((c) => [c.id, toCandidate(c, textOf)]));
  const clusterOfIdea = new Map<string, number>();
  for (const c of clusters) for (const id of c.ideaIds) clusterOfIdea.set(id, c.id);

  // Judge boost: the cluster holding most of the judge's ideas (earliest on ties) is preferred.
  let preferred: number | null = null;
  if (input.boostUserId) {
    const userOf = new Map(usable.map((u) => [u.id, u.userId]));
    const counts = new Map<number, number>();
    for (const i of items) {
      const cid = clusterOfIdea.get(i.id);
      if (userOf.get(i.id) === input.boostUserId && cid !== undefined) counts.set(cid, (counts.get(cid) ?? 0) + 1);
    }
    let bestN = 0;
    for (const [cid, n] of counts) {
      if (n > bestN) {
        preferred = cid;
        bestN = n;
      }
    }
  }

  const sizes = new Map(clusters.map((c) => [c.id, c.size]));
  const minSize = clusters.length ? Math.min(...sizes.values()) : 0;
  const wildCapable = (c: Cluster) => c.share <= WILD_MAX_SHARE || c.size === minSize;
  // A forced boost is only possible if that cluster could legally be the wildcard.
  if (preferred !== null && !wildCapable(clusters.find((c) => c.id === preferred)!)) preferred = null;

  const crowdClusters = clusters.slice(0, CROWD_CLUSTERS);
  const crowdIdSet = new Set(crowdClusters.map((c) => c.id));
  let pool = clusters.filter((c) => wildCapable(c) && !crowdIdSet.has(c.id));
  if (pool.length === 0) pool = clusters.filter((c) => wildCapable(c) && c.id >= 2);
  const forced = preferred !== null ? clusters.find((c) => c.id === preferred) : undefined;
  const rest = pool.filter((c) => c !== forced);
  const small = rest.filter((c) => c.size <= 3);
  const bigger = rest.filter((c) => c.size > 3);
  const room = WILD_CLUSTERS - (forced ? 1 : 0);
  const sampled = diverse(small, room, rng);
  const wildClusters = [...(forced ? [forced] : []), ...sampled, ...diverse(bigger, room - sampled.length, rng)];

  return {
    usable,
    blockedIdeaIds,
    clusters,
    textOf,
    cand,
    crowd: crowdClusters.map((c) => cand.get(c.id)!),
    wild: wildClusters.map((c) => cand.get(c.id)!),
    preferred,
    ctx: { sizes, crowdIds: crowdIdSet, totalIdeas: clusters.reduce((n, c) => n + c.size, 0), excludeLabels: input.excludeLabels ?? [] },
    degraded: vecs.degraded,
    vectorsMs,
    stragglers: vecs.stragglers,
  };
}

// ---------- prompt ----------

const SYSTEM = `You are the ballot writer for a live audience game. Hundreds of people just typed ideas for what
happens next in a shared story. You receive their ideas already grouped into clusters.
Write exactly three ballot options the whole room can vote on.

Rules
1. Options 1 and 2 are CROWD options (kind "crowd"): each must come from one of the largest clusters (the
   CROWD CLUSTERS list) and capture what many people asked for.
2. Option 3 is the WILDCARD (kind "wildcard"): it must come from a SMALL cluster (the WILD CLUSTERS list). Pick the
   one idea that is the most surprising, vivid, and fun while still fitting the scene. Reward originality,
   not randomness. Never pick something that merely repeats a crowd option.
3. Each label: at most 70 characters, plain language, present tense, a complete concrete event
   ("The vault is empty except for a ringing phone"). No emojis, no names of participants,
   no meta-commentary, no questions.
4. The three options must lead the story in clearly different directions. Never use one cluster in two options.
5. Stay faithful to what people wrote. Polish wording; do not invent a new idea.
6. Safety: skip any cluster that is hateful, sexual, harassing, about real private people,
   self-harm, or graphic gore. Mild cartoon peril and absurd humour are fine.
   List every cluster id you skipped for safety in "unsafeClusterIds".
7. If "preferredWildClusterId" is given and it is safe and fits, use it for the wildcard.
8. Also return up to two backup options (same rules, clusters not used by the three options) in case the host vetoes one.
9. sourceClusterIds are the integers inside [c#] (for [c12] write 12).
10. ${UNTRUSTED_NOTE}
Return only the JSON object required by the schema.`;

function buildUser(input: DistillInput, p: Prepared): string {
  const story = input.story.summary.trim() || input.story.premise;
  const pct = (c: Candidate) => `${Math.round(c.share * 100)}%`;
  const crowd = p.crowd
    .map((c) => `[c${c.id}] size=${c.size} share=${pct(c)}\n${c.reps.slice(0, CROWD_REPS).map((r) => `  - ${fenceIdea(r.text)}`).join("\n")}`)
    .join("\n");
  const wild = p.wild.map((c) => `[c${c.id}] size=${c.size} — ${c.reps[0] ? fenceIdea(c.reps[0].text) : ""}`).join("\n");
  const lines = [
    `STORY SO FAR: ${fenceIdeaFree(story)}`,
    `THIS SCENE: ${fenceIdeaFree(input.prompt.title)} — ${fenceIdeaFree(input.prompt.text)}`,
    `TOTAL IDEAS: ${p.ctx.totalIdeas}   LANGUAGE FOR LABELS: ${input.story.lang}`,
    "",
    "CROWD CLUSTERS (largest first)",
    crowd,
    "",
    "WILD CLUSTERS (small groups)",
    wild,
  ];
  if (p.preferred !== null) lines.push("", `preferredWildClusterId: c${p.preferred}`);
  if (p.ctx.excludeLabels.length > 0) {
    lines.push("", "The host asked for a re-roll. Do NOT repeat or closely paraphrase these labels:");
    for (const l of p.ctx.excludeLabels) lines.push(`- ${fenceIdeaFree(l)}`);
  }
  return lines.join("\n");
}

// Story text is ours (not audience text) but may quote ideas from earlier rounds: strip angle brackets only.
function fenceIdeaFree(t: string): string {
  return t.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

// ---------- result assembly ----------

function ideaIdsOf(p: Prepared, clusterIds: number[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const cid of clusterIds) {
    const c = p.clusters.find((x) => x.id === cid);
    for (const id of c?.ideaIds ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function toOption(p: Prepared, o: PickedOption | ValidOption): DistilledOption {
  const kind = o.kind;
  const opt: DistilledOption = { kind, label: o.label, sourceIdeaIds: kind === "narrator" ? [] : ideaIdsOf(p, o.clusterIds) };
  if (kind === "wildcard" && p.preferred !== null && o.clusterIds.includes(p.preferred)) opt.boosted = true;
  return opt;
}

function clusterOfRecord(p: Prepared): Record<string, number> {
  const r: Record<string, number> = {};
  for (const c of p.clusters) for (const id of c.ideaIds) r[id] = c.id;
  return r;
}

function unsafeIdeas(p: Prepared, clusterIds: number[]): string[] {
  return [...new Set([...p.blockedIdeaIds, ...ideaIdsOf(p, clusterIds)])];
}

function fromHeuristic(
  p: Prepared,
  h: ReturnType<typeof heuristicOptions>,
  meta: { provider: Provider; fallbackUsed: boolean; t0: number },
  unsafeClusterIds: number[] = [],
): DistillResult {
  return {
    provider: meta.provider,
    fallbackUsed: meta.fallbackUsed,
    ms: Date.now() - meta.t0,
    options: [toOption(p, h.options[0]), toOption(p, h.options[1]), toOption(p, h.options[2])],
    backups: h.backups.map((b) => toOption(p, b)),
    unsafeIdeaIds: unsafeIdeas(p, unsafeClusterIds),
    clusterOf: clusterOfRecord(p),
  };
}

function fromValid(
  p: Prepared,
  v: ValidDistill,
  meta: { provider: Provider; fallbackUsed: boolean; t0: number },
): DistillResult {
  return {
    provider: meta.provider,
    fallbackUsed: meta.fallbackUsed,
    ms: Date.now() - meta.t0,
    options: [toOption(p, v.options[0]), toOption(p, v.options[1]), toOption(p, v.options[2])],
    backups: v.backups.slice(0, 3).map((b) => toOption(p, b)),
    unsafeIdeaIds: unsafeIdeas(p, v.unsafeClusterIds),
    clusterOf: clusterOfRecord(p),
  };
}

// ---------- entry point ----------

const STEPS: { provider: LlmProvider; capMs: number }[] = [
  { provider: "anthropic", capMs: 5000 },
  { provider: "openai", capMs: 3000 },
];

export async function distillRound(input: DistillInput): Promise<DistillResult> {
  const t0 = Date.now();
  const budget = input.budgetMs ?? env().DISTILL_BUDGET_MS;
  const deadline = t0 + budget;
  const rng = seededRng(`${input.roomId}:${input.roundNo}:${input.excludeLabels?.length ?? 0}:${input.boostUserId ?? ""}`);

  const p = await prepare(input, rng);
  const prepareMs = Date.now() - t0;
  const base = { roomId: input.roomId, roundNo: input.roundNo };
  const heuristicArgs = {
    narratorOptions: input.narratorOptions,
    excludeLabels: input.excludeLabels ?? [],
    rng,
    preferredWildClusterId: p.preferred,
  };

  // Edge cases handled in code, not by the model (FR-16): nothing to ask an LLM with 0-2 clusters.
  if (p.clusters.length <= 2) {
    const h = heuristicOptions({ ...heuristicArgs, clusters: p.clusters.map((c) => p.cand.get(c.id)!) });
    const noCrowd = p.clusters.length === 0;
    return fromHeuristic(p, h, { provider: noCrowd ? "template" : "heuristic", fallbackUsed: false, t0 });
  }

  const allCands = p.clusters.map((c) => p.cand.get(c.id)!);
  const heuristic = (fallbackUsed: boolean, provider: Provider = "heuristic") =>
    fromHeuristic(p, heuristicOptions({ ...heuristicArgs, clusters: allCands }), { provider, fallbackUsed, t0 });

  if (input.heuristicOnly) return heuristic(true);

  const providers = availableProviders();
  if (providers.length === 0) {
    // LLM_MODE=mock (or no key): deterministic mock distiller, same validator.
    await mockDistillThink(); // 0 ms unless MOCK_DISTILL_DELAY_MS is set (e2e)
    const out = mockDistillOut({
      crowd: p.crowd,
      wild: p.wild,
      preferredWildClusterId: p.preferred,
      excludeLabels: p.ctx.excludeLabels,
      narratorOptions: input.narratorOptions,
      rng,
    });
    const v = out ? validateDistill(out, p.ctx) : null;
    if (v?.ok) return fromValid(p, v.value, { provider: "mock", fallbackUsed: false, t0 });
    log.warn({ ...base, errors: v && !v.ok ? v.errors : "no three-cluster ballot" }, "mock distill rejected; heuristics");
    return heuristic(false, "mock");
  }

  const system = SYSTEM;
  const user = buildUser(input, p);
  let attempted = 0;
  for (const step of STEPS) {
    if (!providers.includes(step.provider)) continue;
    // Whichever provider runs first is the primary and gets the primary's cap (OpenAI alone when no Anthropic key).
    const cap = attempted === 0 ? STEPS[0].capMs : step.capMs;
    const timeoutMs = Math.min(cap, deadline - Date.now() - 250);
    if (timeoutMs < 600) break;
    attempted++;
    try {
      const r = await callJSON({
        role: "fast",
        provider: step.provider,
        system,
        user,
        schema: DistillOutSchema,
        timeoutMs,
        name: "distill",
        maxTokens: 1200,
        check: (d) => {
          const v = validateDistill(d, p.ctx);
          return v.ok ? null : v.errors.join("; ");
        },
      });
      const v = validateDistill(r.data, p.ctx);
      if (!v.ok) throw new Error(v.errors.join("; "));
      log.info({ ...base, provider: step.provider, prepareMs, vectorsMs: p.vectorsMs, stragglers: p.stragglers, llmMs: r.ms, ideas: p.ctx.totalIdeas }, "distill timing");
      return fromValid(p, v.value, { provider: step.provider, fallbackUsed: attempted > 1, t0 });
    } catch (err) {
      log.warn({ ...base, provider: step.provider, err: err instanceof Error ? err.message : String(err) }, "distill step failed");
    }
  }
  log.warn({ ...base, ms: Date.now() - t0 }, "distill fell back to heuristics");
  return heuristic(true);
}
