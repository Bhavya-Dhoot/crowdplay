// Story text for when no model writes it (LLM_MODE=mock, a timeout, an unsafe answer): short story beats and a
// finale built from the show's own words. Pure functions with no imports beyond types, so the engine, narrate.ts and
// finale.ts share one copy. Several wordings, chosen deterministically, so a show that runs on the fallback still reads
// like a story (the old fixed line was repeated every round).
import type { FinaleInput, FinaleResult, NarrateInput } from "../ai/types";

const stripEnd = (s: string) => s.replace(/[\s.!?…]+$/u, "");

/** What the no-LLM narrator knows about the round (all optional: a bare label still gets a varied line). */
export type NarrationContext = { roundNo?: number; roundsTotal?: number; scene?: string; final?: boolean };

// The label sits inside quotes, so it reads the same whether the crowd wrote an order ("Sneak in through the vents")
// or a statement ("The vault is full of cheese"). Plain nouns only: these run for every preset.
const MIDDLE_LINES: readonly ((idea: string, scene: string, n: number) => string)[] = [
  (idea, scene, n) => `Chapter ${n}, “${scene}”. The room settles on “${idea}”, and for one breath nobody moves. Then everything speeds up.`,
  (idea, scene) => `The room has spoken: “${idea}”. The plan lands in “${scene}” like a dropped tray, loud and impossible to take back. A door swings open.`,
  (idea, scene) => `Everyone talks at once until one call wins: “${idea}”. They shrug and go with it. “${scene}” will never be the same.`,
  (idea) => `It sounds half mad, which is exactly why it might work: “${idea}”. The story speeds up, and the next scene clears its throat.`,
  (idea, scene) => `“${idea}”, the room insists. Whatever waits in “${scene}” had better be ready, because the plan is coming in fast.`,
];

const FINAL_LINES: readonly ((idea: string, scene: string) => string)[] = [
  (idea, scene) => `The last word goes to the room: “${idea}”. “${scene}” bends to it, the loose ends tie themselves up, and everyone knows who wrote tonight.`,
  (idea, scene) => `One more call, “${idea}”, and the story finally lands. “${scene}” ends with a grin, and nobody will tell tonight the same way twice.`,
  (idea, scene) => `It all comes down to “${idea}”. The room commits, “${scene}” settles, and the credits roll over a story nobody planned.`,
];

function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The no-model narration: a short story beat built around the winning label, the scene title and the round.
 * Several wordings, picked deterministically from the label and round, and consecutive rounds never share one,
 * so a show that runs on the fallback still reads like a story (AI_PROMPTS §3 asked for one fixed line).
 */
export function templateNarration(winnerLabel: string, ctx: NarrationContext = {}): string {
  const idea = stripEnd(winnerLabel.trim());
  const scene = stripEnd((ctx.scene ?? "").trim()) || "the scene";
  const round = Math.max(1, Math.floor(ctx.roundNo ?? 1));
  const pickAt = hashOf(idea) + round;
  if (ctx.final || (ctx.roundsTotal !== undefined && round >= ctx.roundsTotal && round > 1)) {
    return FINAL_LINES[pickAt % FINAL_LINES.length](idea, scene);
  }
  return MIDDLE_LINES[pickAt % MIDDLE_LINES.length](idea, scene, round);
}

/** The context a round gives the no-model narrator. */
export function narrationContextOf(input: NarrateInput): NarrationContext {
  return { roundNo: input.story.roundNo, roundsTotal: input.story.roundsTotal, scene: input.prompt.title, final: input.isFinalRound };
}

const TAGLINES = ["Written live by everyone in the room.", "Every line of it came from the crowd.", "The room wrote it. You were in the room."];
const GENERIC_TITLES = ["A Story Written Together", "Written by the Room", "The Night the Crowd Took Over"];
/** Titles nobody chose on purpose: the demo room's and the wizard's blanks. */
const PLACEHOLDER_TITLE = /^(demo( show)?|untitled( show)?|my show|new show|crowdplay( show)?)$/i;
const SENTENCE_STARTERS = new Set(["Your", "You", "The", "A", "An", "Every", "Everyone", "Each", "It", "This", "That", "One", "Two", "Three", "Only"]);

/** The first proper name inside the premise ("Midnight Diamond", "Emberwood"): a capitalised run that does not open a sentence. */
function nameInPremise(premise: string): string | null {
  for (const sentence of premise.split(/(?<=[.!?])\s+/)) {
    const words = sentence.trim().split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      if (!/^[A-Z][a-z]{2,}$/.test(words[i].replace(/[,;:]+$/, "")) || SENTENCE_STARTERS.has(words[i])) continue;
      const run = [words[i].replace(/[,;:]+$/, "")];
      while (run.length < 2 && i + 1 < words.length && /^[A-Z][a-z]{2,}[,;:]?$/.test(words[i + 1])) run.push(words[++i].replace(/[,;:]+$/, ""));
      return run.join(" ");
    }
  }
  return null;
}

/** A title for a story whose host never named it: built from the premise, never from the winning labels. */
function storyTitleFor(premise: string): string {
  const key = hashOf(premise);
  const name = nameInPremise(premise);
  if (!name) return GENERIC_TITLES[key % GENERIC_TITLES.length];
  const titles = [`${name}, as Told by the Crowd`, `${name}: Written by the Room`, `The Room Takes On ${name}`];
  return titles.find((t, i) => i === key % titles.length && t.length <= 50) ?? GENERIC_TITLES[key % GENERIC_TITLES.length];
}

const NEXT_LINES: readonly ((idea: string) => string)[] = [
  (idea) => `Then came “${idea}”, and the plot never looked back.`,
  (idea) => `After that, “${idea}” turned the story sideways.`,
  (idea) => `Next, “${idea}” changed who was steering.`,
];

/** A recap that reads as a story: the beats in order with connecting words, one closing line, nothing glued together. */
function recapFrom(beats: string[], premise: string): string {
  const key = hashOf(`${premise}|${beats.join("|")}`);
  if (beats.length === 0) return premise.trim() || "The story ends here.";
  if (beats.length === 1) return `The whole night turned on one call: “${beats[0]}”. Every line of it was written by the room.`;
  const parts = [`It started with “${beats[0]}”.`];
  beats.slice(1, -1).forEach((b, i) => parts.push(NEXT_LINES[(key + i) % NEXT_LINES.length](b)));
  parts.push(`The night ended on “${beats[beats.length - 1]}”. Every line of it was written by the room.`);
  return parts.join(" ");
}

/** Finale built without a model: a title (the host's, or one made from the premise), a story-shaped recap, a tagline. */
export function fallbackFinale(input: FinaleInput): Omit<FinaleResult, "provider" | "fallbackUsed" | "ms"> {
  const beats = input.beats.map((b) => b.trim().replace(/[\s.!?…]+$/u, "")).filter(Boolean);
  const chosen = input.title.trim();
  const title = (chosen && !PLACEHOLDER_TITLE.test(chosen) ? chosen : storyTitleFor(input.premise)).slice(0, 50);
  const key = hashOf(`${input.premise}|${beats.length}`);
  return { storyTitle: title, recap: recapFrom(beats, input.premise).slice(0, 1400), tagline: TAGLINES[key % TAGLINES.length] };
}

