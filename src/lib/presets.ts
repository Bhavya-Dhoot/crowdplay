// STUB (owner: W1-AI agent fills content). Shared by server and client; keep it data-only.
import type { PresetId } from "./realtime/types";

export type Preset = {
  id: PresetId;
  name: string;
  emoji: string;
  /** Default premise shown in the setup wizard (custom: empty, host writes it). */
  premise: string;
  tone: string;
  /** Round 1 prompt is hand-written so the show starts with zero LLM latency. */
  round1: { title: string; text: string; narratorOptions: [string, string, string] };
  /** Starter nudges shown as chips in STORM. */
  starters: [string, string, string];
};

export const PRESETS: Record<PresetId, Preset> = {} as Record<PresetId, Preset>;
