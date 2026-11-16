// FROZEN CONTRACT: what the engine calls into the AI layer. AI modules are DB-free;
// the engine loads inputs from the DB, calls these, then persists outputs and computes
// counts/credits itself (LLM output is untrusted: FR-14).
import type { OptionKind, PresetId } from "../realtime/types";

export type Provider = "anthropic" | "openai" | "mock" | "heuristic" | "template" | "preset";

export type CallMeta = { provider: Provider; ms: number; fallbackUsed: boolean };

export type StoryContext = {
  premise: string;
  preset: PresetId;
  /** Running summary ≤1,200 chars. */
  summary: string;
  /** Last two narrations, oldest first. */
  lastNarrations: string[];
  roundNo: number;
  roundsTotal: number;
  /** Show language for labels/narration (BCP-47 short code, default "en"). */
  lang: string;
};

export type DistillIdea = {
  id: string;
  userId: string;
  text: string;
  createdAt: number; // epoch ms; used for tie-breaks and arrival-order clustering
};

export type DistillInput = {
  roomId: string;
  roundNo: number;
  story: StoryContext;
  prompt: { title: string; text: string };
  /** Narrator-written options for this scene (used when the crowd is silent, FR-16). */
  narratorOptions: [string, string, string];
  /** status='ok' ideas of this round only. */
  ideas: DistillIdea[];
  /** Judge Mode boost: ideas from this user are forced into the wildcard candidates and preferred. */
  boostUserId?: string | null;
  /** Re-roll: labels the new options must not repeat. */
  excludeLabels?: string[];
  /** Total budget before falling back to heuristics (default DISTILL_BUDGET_MS). */
  budgetMs?: number;
  /** Force the no-LLM path. */
  heuristicOnly?: boolean;
};

export type DistilledOption = {
  kind: OptionKind; // options[0..1] crowd|narrator, options[2] wildcard|narrator
  label: string; // ≤70 chars, filtered
  sourceIdeaIds: string[]; // subset of input idea ids; [] for narrator options
  boosted?: boolean;
};

export type DistillResult = CallMeta & {
  /** Exactly three, in slot order A, B, C. */
  options: [DistilledOption, DistilledOption, DistilledOption];
  /** Runner-up candidates (rank 4–6) for instant veto replacement. */
  backups: DistilledOption[];
  /** Ideas the model flagged unsafe: the engine marks them blocked. */
  unsafeIdeaIds: string[];
  /** Cluster id per idea id (persisted to ideas.cluster_id). */
  clusterOf: Record<string, number>;
};

export type NarrateInput = {
  story: StoryContext;
  prompt: { title: string; text: string };
  winnerLabel: string;
  /** Up to 5 source ideas verbatim (flavour only). */
  sourceIdeas: string[];
  isFinalRound: boolean;
};

export type NarrateResult = CallMeta & { narration: string; beat: string; summary: string };

export type PromptInput = { story: StoryContext; lastBeat: string | null };
export type PromptResult = CallMeta & {
  title: string; // ≤40
  text: string; // ≤220
  narratorOptions: [string, string, string]; // ≤70 each
};

export type FinaleInput = { premise: string; title: string; beats: string[]; winningLabels: string[] };
export type FinaleResult = CallMeta & { storyTitle: string; recap: string; tagline: string };

export type BotIdeasInput = { preset: PresetId; prompt: { title: string; text: string }; count: number; seed: string };

// Module exports (implemented in W1; signatures are the contract):
//   ai/distill.ts   export function distillRound(input: DistillInput): Promise<DistillResult>
//   ai/narrate.ts   export function narrateOutcome(input: NarrateInput): Promise<NarrateResult>
//   ai/prompts.ts   export function generatePrompt(input: PromptInput): Promise<PromptResult>
//   ai/finale.ts    export function generateFinale(input: FinaleInput): Promise<FinaleResult>
//   ai/embed.ts     export function queueEmbedding(ideaId: string, text: string): void
//   bots/ideas.ts   export function generateBotIdeas(input: BotIdeasInput): Promise<string[]>
//   ai/tts.ts       export function synthesize(text: string): Promise<string | null>   (FEATURE_TTS)
//   ai/translate.ts export function translateBundle(...)                                 (FEATURE_MULTILINGUAL)
