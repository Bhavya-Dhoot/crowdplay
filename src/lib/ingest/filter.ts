// STUB (owner: W1-ingest agent). Must stay isomorphic (no Node imports): clients use it too.
export type FilterReason = "EMPTY" | "TOO_LONG" | "BLOCKED";
export type FilterResult = { ok: true; text: string } | { ok: false; reason: FilterReason };
export type FilterOpts = { strict?: boolean; maxLen?: number };

/** Normalise + check user text (ideas, names, option labels, narration). */
export function checkText(_text: string, _opts: FilterOpts = {}): FilterResult {
  throw new Error("checkText not implemented");
}
export function isClean(text: string, strict = true): boolean {
  return checkText(text, { strict, maxLen: 10_000 }).ok;
}
