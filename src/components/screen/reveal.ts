// Pure helpers for the vote board and the reveal: percentages, winner, narration lines.
import type { PublicOption, PublicState } from "@/lib/realtime/types";

/** Split narration into sentences so they can appear one at a time. At most `max` lines. */
export function narrationLines(text: string | null | undefined, max = 6): string[] {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const parts = (t.match(/[^.!?…]+(?:[.!?…]+["')\]”’]*|$)\s*/g) ?? [t]).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= max) return parts;
  return [...parts.slice(0, max - 1), parts.slice(max - 1).join(" ")];
}

/** Narration font size (em) by length, so a long story still fits the winner panel. */
export function narrationSize(text: string | null | undefined): number {
  const n = (text ?? "").length;
  if (n <= 120) return 1.7;
  if (n <= 180) return 1.5;
  if (n <= 300) return 1.3;
  if (n <= 460) return 1.1;
  return 0.95;
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

export const SLOT_GLYPH: Record<PublicOption["slot"], string> = { A: "A", B: "B", C: "⚡" };
export const SLOT_NAME: Record<PublicOption["slot"], string> = { A: "Option A", B: "Option B", C: "Wildcard option" };
