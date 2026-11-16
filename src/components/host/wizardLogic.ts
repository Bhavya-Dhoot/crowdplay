// Pure helpers for the /host setup wizard: defaults, preset switching, validation, duration estimate.
import { CreateRoomBody, type CreateRoomInput } from "@/lib/api/contracts";
import { PRESETS } from "@/lib/presets";
import type { PresetId } from "@/lib/realtime/types";

export const STORM_SECONDS = [20, 30, 45] as const;
export const VOTE_SECONDS = [10, 12, 20] as const;
export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 10;
export const NAME_MAX = 20;
export const TITLE_MAX = 60;
export const PREMISE_MAX = 400;

export const PRESET_ORDER: readonly PresetId[] = ["heist", "fantasy", "space", "mystery", "classroom", "custom"];

/** A ready-to-use show name per story, so "pick a story, press Create" is a complete flow. */
export const TITLE_SUGGESTION: Record<PresetId, string> = {
  heist: "The Midnight Diamond Job",
  fantasy: "Quest for the Last Lantern",
  space: "Something Knocks on the Wanderling",
  mystery: "Dinner at Lady Peabody's",
  classroom: "The Day School Flipped",
  custom: "Our Story",
};

/** One short line per story for the picker cards (the long `tone` text in presets.ts is for the AI). */
export const PRESET_BLURB: Record<PresetId, string> = {
  heist: "Slick caper, quick banter",
  fantasy: "Warm storybook adventure",
  space: "Wonder with gentle comedy",
  mystery: "Cosy whodunit, nothing graphic",
  classroom: "Kind and curious, ages 8 to 14",
  custom: "Write your own premise",
};

export type WizardForm = {
  hostName: string;
  title: string;
  preset: PresetId;
  premise: string;
  rounds: number;
  stormS: number;
  voteS: number;
  autoAdvance: boolean;
  strictFilter: boolean;
};

export function initialForm(hostName: string): WizardForm {
  return {
    hostName,
    title: TITLE_SUGGESTION.heist,
    preset: "heist",
    premise: PRESETS.heist.premise,
    rounds: 5,
    stormS: 30,
    voteS: 12,
    autoAdvance: true,
    strictFilter: true,
  };
}

/** Switching story swaps the premise (and title) only while the host has not edited them. */
export function nextPremise(prevPreset: PresetId, prevPremise: string, nextPreset: PresetId): string {
  const untouched = prevPremise.trim() === "" || prevPremise === PRESETS[prevPreset].premise;
  return untouched ? PRESETS[nextPreset].premise : prevPremise;
}

export function nextTitle(prevPreset: PresetId, prevTitle: string, nextPreset: PresetId): string {
  const untouched = prevTitle.trim() === "" || prevTitle === TITLE_SUGGESTION[prevPreset];
  return untouched ? TITLE_SUGGESTION[nextPreset] : prevTitle;
}

export type WizardField = "hostName" | "title" | "premise";
export type WizardErrors = Partial<Record<WizardField, string>>;
export type WizardValidation = { ok: true; hostName: string; body: CreateRoomInput } | { ok: false; errors: WizardErrors };

const count = (s: string) => [...s].length;

export function validateWizard(form: WizardForm): WizardValidation {
  const errors: WizardErrors = {};
  const hostName = form.hostName.trim();
  const title = form.title.trim();
  const premise = form.premise.trim();

  if (count(hostName) < 2) errors.hostName = "Pick a name with at least 2 characters.";
  else if (count(hostName) > NAME_MAX) errors.hostName = `Keep your name to ${NAME_MAX} characters or fewer.`;

  if (count(title) < 2) errors.title = "Give your show a name (at least 2 characters).";
  else if (count(title) > TITLE_MAX) errors.title = `Keep the title to ${TITLE_MAX} characters or fewer.`;

  if (count(premise) < 10) {
    errors.premise =
      form.preset === "custom"
        ? "Describe your story so the AI has something to work with (at least 10 characters)."
        : "The premise needs at least 10 characters. Pick the story again to restore it.";
  } else if (count(premise) > PREMISE_MAX) errors.premise = `Keep the premise to ${PREMISE_MAX} characters or fewer.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const parsed = CreateRoomBody.safeParse({
    title,
    preset: form.preset,
    premise,
    roundsTotal: form.rounds,
    stormMs: form.stormS * 1000,
    voteMs: form.voteS * 1000,
    autoAdvance: form.autoAdvance,
    strictFilter: form.strictFilter,
  });
  if (!parsed.success) {
    // The API shape moved under us: point at the field it names, or at the title as a last resort.
    const field = parsed.error.issues[0]?.path[0];
    const key: WizardField = field === "premise" ? "premise" : "title";
    return { ok: false, errors: { [key]: "That didn't pass the checks. Review it and try again." } };
  }
  return { ok: true, hostName, body: parsed.data };
}

// Per-round phase lengths the engine uses with auto-advance on (config.ts defaults: PROMPT_MS 6 s,
// REVEAL_MS 12 s, DISTILL_BUDGET_MS 8 s as the worst case).
const PROMPT_S = 6;
const REVEAL_S = 12;
const DISTILL_S = 8;

/** Upper bound in whole minutes for an auto-advance show; manual mode waits on the host. */
export function estimateMinutes(rounds: number, stormS: number, voteS: number): number {
  return Math.max(1, Math.ceil((rounds * (PROMPT_S + stormS + DISTILL_S + voteS + REVEAL_S)) / 60));
}

/** 0..100 for the slider's filled track. */
export function sliderFill(value: number, min = MIN_ROUNDS, max = MAX_ROUNDS): number {
  return Math.round(((value - min) / (max - min)) * 100);
}
