// Pure helpers for the vote board and the reveal: percentages, winner, type sizes.
import type { PublicOption, PublicState } from "@/lib/realtime/types";

/** Narration size on the winner page, in canvas px: big for a couple of sentences, never below 28 for a long one. */
export function narrationPx(text: string | null | undefined): number {
  const n = (text ?? "").length;
  if (n <= 230) return 44;
  if (n <= 330) return 38;
  if (n <= 450) return 33;
  return 28;
}

/** Ballot label size on a vote card, in stage em (a ballot label is at most 70 characters). */
export function labelEm(label: string): number {
  if (label.length <= 30) return 2;
  if (label.length <= 48) return 1.7;
  if (label.length <= 60) return 1.55;
  return 1.4;
}

/**
 * Whole-number percentages that add up to 100 (largest remainder), from the live tally.
 * No votes -> all zero.
 */
export function percentages(ids: readonly string[], tally: Record<string, number> | undefined): Record<string, number> {
  const counts = ids.map((id) => {
    const n = Number(tally?.[id] ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  });
  const sum = counts.reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  if (sum === 0) {
    ids.forEach((id) => (out[id] = 0));
    return out;
  }
  const raw = counts.map((c) => (c / sum) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - floors[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i] += 1;
    left -= 1;
  }
  ids.forEach((id, i) => (out[id] = floors[i]));
  return out;
}

/** Every option written by the narrator: nobody typed anything usable. */
export function allNarrator(options: readonly PublicOption[] | undefined): boolean {
  return Boolean(options && options.length > 0 && options.every((o) => o.kind === "narrator"));
}

/** The option with the most live votes (ties: first slot). null while nobody has voted. */
export function leaderId(options: readonly PublicOption[] | undefined, tally: Record<string, number> | undefined): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const o of options ?? []) {
    const n = Number(tally?.[o.id] ?? 0);
    if (n > bestN) {
      best = o.id;
      bestN = n;
    }
  }
  return best;
}

/** The winning option once the outcome is known, else null. */
export function winnerOf(state: Pick<PublicState, "options" | "outcome">): PublicOption | null {
  const id = state.outcome?.optionId;
  if (!id) return null;
  return state.options?.find((o) => o.id === id) ?? null;
}

export const SLOT_NAME: Record<PublicOption["slot"], string> = { A: "Option A", B: "Option B", C: "Wildcard option" };
