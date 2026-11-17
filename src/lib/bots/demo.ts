// Judge Mode pacing and bot-lean constants (D23). Pure data and two tiny helpers: no imports, so rooms.ts, the
// engine effects, the vote route and the bot runner can all use them without an import cycle. Every duration is
// a base value; callers apply TIMING_SCALE with `scaled()` (the e2e suite shortens a whole demo that way).

export const DEMO = {
  /** "Get ready": long enough to read the scene title; the scene text stays on screen through the storm. */
  promptMs: 2_500,
  stormMs: 20_000,
  /** A cap, not a target: the vote ends `voteGraceMs` after the judge votes. */
  voteMs: 15_000,
  /** How long the vote stays open after the judge's vote (the other bots vote inside it). */
  voteGraceMs: 1_500,
  /**
   * REVEAL before the narration exists. Only a ceiling: the engine re-times it to `revealHoldMs(narration)` the moment
   * the narration is on screen, so a slow narrator never eats the reading time.
   */
  revealMs: 14_000,
  revealMinHoldMs: 8_000,
  revealMaxHoldMs: 15_000,
  /** Share of the bots that vote for the judge's boosted option when a canon is guaranteed. */
  forcedLeanShare: 0.6,
  /** A gentler nudge in the middle rounds (the judge's idea still has to win the vote, it just usually does). */
  softLeanShare: 0.55,
} as const;

/** The narration typewriter speed on the phone and the screen (ScriptText default), in characters per second. */
const TYPEWRITER_CPS = 34;
/** Reading time left once the last letter has appeared. */
const READ_AFTER_TYPING_MS = 2_500;

/**
 * How long REVEAL stays after the narration is visible: the time the typewriter needs plus a moment to read it,
 * never under 8 s and never over 15 s (a very long narration must not stall the demo). A 200-character line is 8.4 s.
 */
export function revealHoldMs(narration: string): number {
  const ms = Math.ceil(READ_AFTER_TYPING_MS + (narration.length * 1000) / TYPEWRITER_CPS);
  return Math.min(DEMO.revealMaxHoldMs, Math.max(DEMO.revealMinHoldMs, ms));
}

export type Lean = { share: number; exact: boolean };

/**
 * How hard the bots push the judge's boosted option in `roundNo` of `roundsTotal`.
 * - null: no push (round 1, or the judge already has a canon this show).
 * - soft: middle rounds, a random draw with the option favoured.
 * - exact: the last round, when the judge still has no canon: a fixed head count, so the win is certain.
 */
export function leanFor(roundNo: number, roundsTotal: number, canonSoFar: number): Lean | null {
  if (canonSoFar > 0) return null;
  if (roundNo >= roundsTotal) return { share: DEMO.forcedLeanShare, exact: true };
  if (roundNo >= 2) return { share: DEMO.softLeanShare, exact: false };
  return null;
}
