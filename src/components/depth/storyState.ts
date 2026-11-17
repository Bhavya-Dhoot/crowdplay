// Small decisions about how a story is presented, shared by the page and the share image.
import type { StoryRes } from "@/lib/api/contracts";
import { PRESETS } from "@/lib/presets";

type Show = StoryRes["show"];

const RECENT_END_MS = 2 * 60_000;

/** The recap is written by the narrator after the last round: "" or null while it is still being written. */
export function recapPending(show: Show, now: number = Date.now()): boolean {
  if (show.recap && show.recap.trim()) return false;
  if (show.status === "finale") return true;
  return show.status === "ended" && show.endedAt !== null && now - show.endedAt < RECENT_END_MS;
}

export const isFinished = (show: Show): boolean => show.status === "finale" || show.status === "ended";

export function storyHeading(show: Show): string {
  return show.storyTitle?.trim() || show.title;
}

/** The preset's name, no emoji: the poster is ink and one yellow, colour emoji would be a third colour. */
export function presetLabel(show: Show): string {
  return PRESETS[show.preset]?.name ?? "Custom";
}

/** One-line description for link previews: the tagline, else the premise, trimmed to a sentence-ish length. */
export function storyBlurb(show: Show): string {
  const text = show.tagline?.trim() || show.premise.trim();
  return text.length > 200 ? `${text.slice(0, 197).trimEnd()}…` : text;
}
