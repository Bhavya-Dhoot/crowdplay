// Deterministic stand-in for the distiller LLM (LLM_MODE=mock, AI_PROMPTS §10). It produces the same
// shape the real model must return, so the output still goes through validateDistill.
import { env } from "@/lib/config";
import type { DistillOutput } from "./distill";
import { heuristicOptions, type Candidate } from "./heuristics";
import { passFilter } from "./safety";

const MOCK_DELAY_CAP_MS = 10_000;

/**
 * e2e only: how long the mock distiller "thinks" (MOCK_DISTILL_DELAY_MS, default 0). Ignored unless LLM_MODE=mock,
 * so a live deployment can never be slowed by it. Lets the DISTILL phase stay on screen long enough to be observed.
 */
export function mockDistillDelayMs(): number {
  if (env().LLM_MODE !== "mock") return 0;
  const n = Number(process.env.MOCK_DISTILL_DELAY_MS);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), MOCK_DELAY_CAP_MS) : 0;
}

export async function mockDistillThink(): Promise<void> {
  const ms = mockDistillDelayMs();
  if (ms > 0) await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export type MockDistillArgs = {
  crowd: Candidate[];
  wild: Candidate[];
  preferredWildClusterId: number | null;
  excludeLabels: string[];
  narratorOptions: [string, string, string];
  rng: () => number;
};

/**
 * Cleaned representative ideas as labels, like the heuristic path, but emitted as a model answer.
 * Clusters whose every representative trips the strict filter are reported unsafe, as a model
 * following rule 6 would. Returns null if three cluster-backed options cannot be made.
 */
export function mockDistillOut(a: MockDistillArgs): DistillOutput | null {
  const all = [...a.crowd];
  for (const w of a.wild) if (!all.some((c) => c.id === w.id)) all.push(w);

  const unsafe = all.filter((c) => c.reps.every((r) => passFilter(r.text, { strict: true }) === null)).map((c) => c.id);
  const safe = all.filter((c) => !unsafe.includes(c.id));

  const h = heuristicOptions({
    clusters: safe,
    narratorOptions: a.narratorOptions,
    excludeLabels: a.excludeLabels,
    rng: a.rng,
    preferredWildClusterId: a.preferredWildClusterId,
  });
  if (h.options.some((o) => o.kind === "narrator")) return null;

  const wire = (o: { kind: "crowd" | "wildcard" | "narrator"; label: string; clusterIds: number[] }) => ({
    label: o.label,
    kind: o.kind === "wildcard" ? ("wildcard" as const) : ("crowd" as const),
    sourceClusterIds: o.clusterIds,
  });
  return {
    options: h.options.map(wire),
    backups: h.backups.map(wire),
    unsafeClusterIds: unsafe,
  };
}
