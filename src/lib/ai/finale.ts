// Finale (AI_PROMPTS §5): title, recap and tagline from the whole story. smart model -> fast model ->
// the beats joined together. Output is re-filtered; unsafe text falls back to the join.
import { z } from "zod";
import { callChain, llmLive } from "./providers";
import { safeText, UNTRUSTED_NOTE, wordCount } from "./safety";
import type { FinaleInput, FinaleResult } from "./types";

const FinaleSchema = z.object({
  storyTitle: z.string().min(3).max(50),
  recap: z.string().min(40).max(1400),
  tagline: z.string().min(5).max(80),
});

const SYSTEM = `You close a live, crowd-written story. Given the premise and every beat, return:
- storyTitle: a catchy title, max 50 characters.
- recap: 120 to 180 words, present or past tense, warm and a little mischievous, telling the whole story in order and ending on a satisfying note.
- tagline: one line, max 80 characters.
Do not mention votes, AI or the game, and do not name participants. Family-friendly.
${UNTRUSTED_NOTE}`;

const TAGLINE = "Written live by everyone in the room.";

/** Finale built from the beats alone: the title the host chose, the beats in order, a fixed tagline. */
export function fallbackFinale(input: FinaleInput): Omit<FinaleResult, "provider" | "fallbackUsed" | "ms"> {
  const beats = input.beats.map((b) => b.trim().replace(/[\s.!?…]+$/u, "")).filter(Boolean);
  const recap = beats.length > 0 ? `${beats.join(". ")}.` : input.premise.trim() || "The story ends here.";
  const title = input.title.trim().slice(0, 50) || "A Story Written Together";
  return { storyTitle: title, recap: recap.slice(0, 1400), tagline: TAGLINE };
}

export async function generateFinale(input: FinaleInput): Promise<FinaleResult> {
  const plain = fallbackFinale(input);
  if (!llmLive()) return { ...plain, provider: "mock", fallbackUsed: false, ms: 0 };

  const t0 = Date.now();
  const user = [
    `PREMISE: ${input.premise}`,
    `WORKING TITLE: ${input.title}`,
    `BEATS IN ORDER:\n${input.beats.map((b, i) => `${i + 1}. ${b}`).join("\n")}`,
    `WINNING CHOICES IN ORDER:\n${input.winningLabels.map((l, i) => `${i + 1}. ${l}`).join("\n")}`,
  ].join("\n\n");
  try {
    const r = await callChain(
      [
        { role: "smart", timeoutMs: 4500 },
        { role: "fast", timeoutMs: 3000 },
      ],
      6000,
      {
        system: SYSTEM,
        user,
        schema: FinaleSchema,
        name: "finale",
        maxTokens: 800,
        check: (d) => {
          const w = wordCount(d.recap);
          return w < 100 || w > 200 ? `recap has ${w} words; it must be 120 to 180` : null;
        },
      },
    );
    const storyTitle = safeText(r.data.storyTitle, 50);
    const recap = safeText(r.data.recap, 1400);
    const tagline = safeText(r.data.tagline, 80);
    if (!storyTitle || !recap || !tagline) return { ...plain, provider: "template", fallbackUsed: true, ms: Date.now() - t0 };
    return { provider: r.provider, fallbackUsed: r.stepIndex > 0, ms: Date.now() - t0, storyTitle, recap, tagline };
  } catch {
    return { ...plain, provider: "template", fallbackUsed: true, ms: Date.now() - t0 };
  }
}
