// STUB (owner: W1-AI agent).
import type { PromptInput, PromptResult } from "./types";
export async function generatePrompt(_input: PromptInput): Promise<PromptResult> {
  throw new Error("generatePrompt not implemented");
}
/** Instant, no-LLM scene used when pre-generation did not finish in time. */
export function fallbackPrompt(_input: PromptInput): Omit<PromptResult, "ms"> & { ms: 0 } {
  throw new Error("fallbackPrompt not implemented");
}
