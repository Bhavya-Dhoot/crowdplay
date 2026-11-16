// Demo-room bot ideas (AI_PROMPTS §6). Mock mode samples the canned pool; live mode asks the fast
// model for a mixed batch (6 s) and tops up or falls back to the canned pool.
import { z } from "zod";
import { llmLive, callChain } from "../ai/providers";
import { passFilter, sanitizeForPrompt } from "../ai/safety";
import type { BotIdeasInput } from "../ai/types";
import { cannedIdeas, sampleCanned } from "./canned";
import { PRESETS } from "../presets";

const IdeasSchema = z.object({ ideas: z.array(z.string().min(3).max(100)).min(1).max(120) });

const SYSTEM = `You write short ideas that audience members type into a live story game when asked what happens next.
Write exactly the requested number of distinct ideas, each at most 100 characters, in this mix:
- about 45% converge on TWO obvious directions (roughly half each), phrased differently every time;
- about 35% are varied and different from each other;
- about 20% are odd or funny.
Sound like real people typing fast on a phone: casual, lowercase is fine, a few typos, no emojis, no names,
no numbering. Family-friendly. Never repeat an idea.`;

export async function generateBotIdeas(input: BotIdeasInput): Promise<string[]> {
  const count = Math.max(0, Math.floor(input.count));
  const canned = () => sampleCanned(input.preset, count, input.seed);
  if (count === 0) return [];
  if (!llmLive()) return canned();

  const user = [
    `STORY PREMISE: ${PRESETS[input.preset].premise || "(a story the host is writing live)"}`,
    `SCENE: ${sanitizeForPrompt(input.prompt.title, 80)} — ${sanitizeForPrompt(input.prompt.text, 260)}`,
    `NUMBER OF IDEAS: ${count}`,
  ].join("\n");
  try {
    const r = await callChain([{ role: "fast", timeoutMs: 6000 }], 6000, {
      system: SYSTEM,
      user,
      schema: IdeasSchema,
      name: "bot_ideas",
      maxTokens: 3000,
    });
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of r.data.ideas) {
      const t = passFilter(raw.replace(/\s+/g, " ").trim(), { strict: true, maxLen: 100 });
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      out.push(t);
    }
    if (out.length >= count) return out.slice(0, count);
    // Top up with canned lines the model did not already write.
    const extra = sampleCanned(input.preset, Math.min(count * 2, cannedIdeas(input.preset).length), input.seed).filter(
      (l) => !seen.has(l.toLowerCase()),
    );
    return [...out, ...extra].slice(0, count);
  } catch {
    return canned();
  }
}
