// FROZEN CONTRACT (Phase 3). The pure engine (machine.ts) maps (state, now, trigger) -> (state, effects).
import type { Phase } from "../realtime/types";

export type Timings = {
  promptMs: number;
  stormMs: number;
  voteMs: number;
  revealMs: number;
  /** DISTILL hard cap. When it passes, the engine forces the heuristic path. */
  distillCapMs: number;
};

export type EnginePayload = {
  /** Re-roll used in the current round (limit 1 per round). Reset on PROMPT. */
  rerollUsed: boolean;
  /** Distill status for the current round. */
  distill: "idle" | "running" | "done";
  /** Set by HOST_FORCE_WIN; consumed by CLOSE_VOTE. */
  forcedWinnerId: string | null;
  /** Host voice (TTS) toggle; only meaningful when FEATURE_TTS=1. */
  voice: boolean;
};

export type EngineState = {
  roomId: string;
  showId: string;
  isDemo: boolean;
  phase: Phase;
  roundNo: number; // 0 in LOBBY, 1..roundsTotal afterwards
  roundsTotal: number;
  phaseStartedAt: number; // epoch ms
  phaseEndsAt: number | null; // null = waits for a trigger (LOBBY, FINALE, ENDED, paused, manual REVEAL)
  pausedRemainingMs: number | null; // non-null = PAUSED wrapping the current phase
  version: number; // bumped on every transition; becomes PublicState.v
  autoAdvance: boolean;
  timings: Timings;
  payload: EnginePayload;
};

export type Trigger =
  | { type: "TICK" }
  | { type: "HOST_START" }
  | { type: "HOST_NEXT" }
  | { type: "HOST_END_STORM" }
  | { type: "HOST_EXTEND"; ms: number }
  | { type: "HOST_PAUSE" }
  | { type: "HOST_RESUME" }
  | { type: "HOST_FORCE_WIN"; optionId: string }
  | { type: "HOST_VETO"; optionId: string }
  | { type: "HOST_REROLL" }
  | { type: "HOST_END_SHOW" }
  | { type: "HOST_SET_AUTO"; on: boolean }
  | { type: "HOST_SET_VOICE"; on: boolean }
  | { type: "DISTILL_DONE"; roundNo: number }
  | { type: "DISTILL_FAILED"; roundNo: number }
  /** Demo rooms only: the judge voted, so VOTE closes `graceMs` from now (it only ever shortens the window). */
  | { type: "DEMO_JUDGE_VOTED"; graceMs: number }
  /** Demo rooms only: the narration of `roundNo` is on screen, so REVEAL holds `holdMs` from now (up or down). */
  | { type: "DEMO_NARRATION_READY"; roundNo: number; holdMs: number };

export type Effect =
  /** ensure: make sure round `roundNo` has a prompt row now (fallback text if none). pregen: generate it ahead (LLM). */
  | { type: "GEN_PROMPT"; roundNo: number; mode: "ensure" | "pregen" }
  /** full: embeddings + LLM + fallbacks. heuristic: no LLM (hard cap hit). reroll: full, excluding current labels. */
  | { type: "RUN_DISTILL"; roundNo: number; mode: "full" | "heuristic" | "reroll" }
  /** Compute winner (forced > tally > tie-break), persist it. */
  | { type: "CLOSE_VOTE"; roundNo: number; forcedWinnerId: string | null }
  | { type: "GEN_NARRATION"; roundNo: number }
  | { type: "SEND_RECEIPTS"; roundNo: number; kind: "BALLOT" | "CANON" }
  /** Replace a vetoed option with the next stored backup (or a narrator option). */
  | { type: "REPLACE_OPTION"; roundNo: number; optionId: string }
  | { type: "GEN_FINALE" }
  | { type: "START_BOTS"; roundNo: number }
  /** Demo rooms: bots cast weighted-random votes when VOTE opens. */
  | { type: "START_BOT_VOTES"; roundNo: number }
  | { type: "PUBLISH"; phaseChanged: boolean };

export type MachineResult = { state: EngineState; effects: Effect[]; changed: boolean };
