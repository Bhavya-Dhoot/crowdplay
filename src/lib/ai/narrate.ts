// Narrator (AI_PROMPTS §3): turns the winning choice into a short read-aloud beat plus the running
// summary. smart model (4.5 s) -> fast model -> the spec's template. Participant names never come
// from the model: credits are rendered from the database elsewhere.
import { z } from "zod";
import { fenceIdea, safeText, UNTRUSTED_NOTE, wordCount } from "./safety";
import { callChain, llmLive } from "./providers";
import type { NarrateInput, NarrateResult, StoryContext } from "./types";

const NarrationSchema = z.object({
  narration: z.string().min(1).max(700),
  beat: z.string().min(1).max(90),
  summary: z.string().min(1).max(1200),
});

const SYSTEM = `You are the narrator of a live, crowd-written story. Warm, quick, cinematic, a little mischievous.
Write what happens next given the winning choice.
- 45 to 90 words. Present tense. Read-aloud friendly. End on a small hook, not a question to the audience.
- Stay consistent with the story so far. Make the winning idea feel like it mattered.
- Do not mention votes, percentages, AI, or the game. Do not name participants (credits are shown separately).
- Family-friendly: no gore, slurs, sexual content.
Also return a one-line beat (max 90 chars) summarising this round, and an updated running summary
(max 1200 chars, ideally under 900) of the whole story.
${UNTRUSTED_NOTE}`;

const TOTAL_BUDGET_MS = 6000;

const stripEnd = (s: string) => s.replace(/[\s.!?…]+$/u, "");

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return stripEnd(sp > max * 0.6 ? cut.slice(0, sp) : cut);
}

/** The exact fallback line from AI_PROMPTS §3. */
export function templateNarration(winnerLabel: string): string {
  return `${stripEnd(winnerLabel.trim())}. And just like that, everything changes — the story turns a corner no one saw coming.`;
}

/** Running summary with the new beat appended, kept to the newest 1,200 chars. */
export function appendSummary(summary: string, beat: string): string {
  const joined = `${summary.trim()} ${stripEnd(beat)}.`.trim();
  if (joined.length <= 1200) return joined;
  const tail = joined.slice(-1200);
  const sp = tail.indexOf(" ");
  return sp > 0 && sp < 80 ? tail.slice(sp + 1) : tail;
}

function template(input: NarrateInput, provider: "template" | "mock", fallbackUsed: boolean, ms: number): NarrateResult {
  const beat = truncate(stripEnd(input.winnerLabel.trim()), 90);
  return {
    provider,
    fallbackUsed,
    ms,
    narration: templateNarration(input.winnerLabel),
    beat,
    summary: appendSummary(input.story.summary, beat),
  };
}

function buildUser(input: NarrateInput): string {
  const s: StoryContext = input.story;
  const last = s.lastNarrations.length
    ? s.lastNarrations.map((n, i) => `${i + 1}) ${n.replace(/[<>]/g, "")}`).join("\n")
    : "(none yet)";
  const ideas = input.sourceIdeas.slice(0, 5).map((t) => `- ${fenceIdea(t)}`).join("\n") || "(none)";
  return [
    `PREMISE: ${s.premise}`,
    `STORY SO FAR: ${s.summary || "(the story is just beginning)"}`,
    `LAST NARRATIONS (oldest first):\n${last}`,
    `SCENE: ${input.prompt.title} — ${input.prompt.text}`,
    `WINNING CHOICE: ${input.winnerLabel}`,
    `IDEAS BEHIND THE WINNING CHOICE (flavour only):\n${ideas}`,
    `ROUND ${s.roundNo} of ${s.roundsTotal}.${input.isFinalRound ? " This is the final round: bring the story to a satisfying close." : ""}`,
    `LANGUAGE: ${s.lang}`,
  ].join("\n\n");
}

export async function narrateOutcome(input: NarrateInput): Promise<NarrateResult> {
  if (!llmLive()) return template(input, "mock", false, 0);

  const t0 = Date.now();
  try {
    const r = await callChain(
      [
        { role: "smart", timeoutMs: 4500 },
        { role: "fast", timeoutMs: 3000 },
      ],
      TOTAL_BUDGET_MS,
      {
        system: SYSTEM,
        user: buildUser(input),
        schema: NarrationSchema,
        name: "narrate",
        maxTokens: 900,
        check: (d) => {
          const w = wordCount(d.narration);
          if (w > 90) return `narration has ${w} words; the limit is 90`;
          if (w < 8) return "narration is too short";
          return null;
        },
      },
    );
    const narration = safeText(r.data.narration, 700);
    if (!narration || wordCount(narration) > 90) return template(input, "template", true, Date.now() - t0);
    const beat = safeText(r.data.beat, 90) ?? truncate(stripEnd(input.winnerLabel.trim()), 90);
    const summary = safeText(r.data.summary, 1200) ?? appendSummary(input.story.summary, beat);
    return {
      provider: r.provider,
      fallbackUsed: r.stepIndex > 0,
      ms: Date.now() - t0,
      narration,
      beat,
      summary,
    };
  } catch {
    return template(input, "template", true, Date.now() - t0);
  }
}
