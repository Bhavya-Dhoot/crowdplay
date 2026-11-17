// Pure helpers for the player UI: no React, no I/O, so every rule here is unit-tested
// (src/tests/unit/play-logic.test.ts).
import type { I18nBundle, Phase, PublicOption, PublicState } from "@/lib/realtime/types";
import { friendlyError, STORM_NUDGES } from "@/lib/copy";
import { PRESETS } from "@/lib/presets";
import { PLAY_COPY } from "./playCopy";

export const IDEA_LIMIT = 140;

export type BodyKey = "lobby" | "prompt" | "storm" | "vote" | "reveal" | "finale";

/** Which body a phase renders. STORM and DISTILL share one so the feed does not remount between them. */
export function bodyKey(phase: Phase): BodyKey {
  switch (phase) {
    case "LOBBY":
      return "lobby";
    case "PROMPT":
      return "prompt";
    case "STORM":
    case "DISTILL":
      return "storm";
    case "VOTE":
      return "vote";
    case "REVEAL":
      return "reveal";
    case "FINALE":
    case "ENDED":
      return "finale";
  }
}

/** Which content fills the dock's top slot: the composer, the "reading ideas" status, the finale actions or nothing. */
export type DockKey = "composer" | "distill" | "finale" | "none";

export function dockKey(phase: Phase): DockKey {
  switch (phase) {
    case "PROMPT":
    case "STORM":
      return "composer";
    case "DISTILL":
      return "distill";
    case "FINALE":
    case "ENDED":
      return "finale";
    default:
      return "none";
  }
}

/** Minimum height (px) of the dock's top slot per phase, so the composer, the distill status and the finale actions never shift the page. */
export function dockHeight(phase: Phase): number {
  switch (dockKey(phase)) {
    case "composer":
    case "distill":
      return 100;
    case "finale":
      return 56;
    case "none":
      return 0;
  }
}

/** Three starter nudges for the current preset; falls back to the generic ones. */
export function starterChips(preset: PublicState["preset"] | undefined): string[] {
  const p = preset ? PRESETS[preset] : undefined;
  const s = p?.starters;
  return s && s.length > 0 ? [...s] : [...STORM_NUDGES];
}

/** Insert a chip into the draft: replaces an empty draft, appends otherwise, never overflows the limit. */
export function insertChip(draft: string, chip: string, max = IDEA_LIMIT): string {
  const base = draft.trimEnd();
  if (!base) return chip.slice(0, max);
  const next = `${base} ${chip}`;
  return next.length <= max ? next : draft;
}

export function charsLeft(text: string, max = IDEA_LIMIT): number {
  return max - text.length;
}

export type LockInput = {
  phase: Phase;
  paused: boolean;
  connection: "connected" | "connecting" | "disconnected";
  banned: boolean;
  muted: boolean;
};

/** Why the composer is locked (the placeholder it shows), or null when the player may type. */
export function composerLock(i: LockInput): string | null {
  if (i.banned) return friendlyError("BANNED");
  if (i.paused) return "Paused…";
  if (i.connection === "disconnected") return "Reconnecting…";
  if (i.phase !== "STORM") return "Get ready…";
  if (i.muted) return friendlyError("MUTED");
  return null;
}

/** 0..1 share of the votes for an option. */
export function voteShare(tally: Record<string, number> | undefined, total: number | undefined, optionId: string): number {
  const t = total ?? 0;
  const n = tally?.[optionId] ?? 0;
  if (!(t > 0) || !(n > 0)) return 0;
  return Math.min(1, n / t);
}

export const votePercent = (tally: Record<string, number> | undefined, total: number | undefined, optionId: string): number =>
  Math.round(voteShare(tally, total, optionId) * 100);

export type OptionFlags = { narrator: boolean; wildcard: boolean; boosted: boolean };

export function optionFlags(o: Pick<PublicOption, "kind" | "boosted">): OptionFlags {
  return { narrator: o.kind === "narrator", wildcard: o.kind === "wildcard", boosted: Boolean(o.boosted) };
}

/** Human line under an option: "from 23 ideas" (nothing for the narrator's own pick). */
export function supportLine(o: Pick<PublicOption, "kind" | "supporters">): string | null {
  if (o.kind === "narrator" || o.supporters <= 0) return null;
  return `from ${o.supporters} ${o.supporters === 1 ? "idea" : "ideas"}`;
}

/** Spoken label for a vote card (the visible text is inside a button, so give it a full sentence). */
export function optionAria(o: PublicOption, label: string, percent: number, selected: boolean, mine: boolean): string {
  const parts = [`Option ${o.slot}`, label];
  if (o.kind === "wildcard") parts.push("Wildcard");
  if (o.kind === "narrator") parts.push("Narrator's pick");
  parts.push(`${percent} percent of votes`);
  const support = supportLine(o);
  if (support) parts.push(support);
  if (mine) parts.push("Your idea is on this option");
  if (selected) parts.push("Selected");
  return parts.join(". ");
}

export type ResultChip = { kind: "canon" | "called" | "mine"; text: string };

/**
 * The personal result under the winner (audit #12): "Your idea is canon" when my idea won, "You called it" when my
 * vote won, "Your idea got 23%" when my idea was on the ballot and lost (best of my options). Empty when none applies.
 */
export function resultChips(i: {
  winnerId: string | undefined;
  votedId: string | null;
  mineIds: readonly string[];
  tally: Record<string, number> | undefined;
  total: number | undefined;
}): ResultChip[] {
  if (!i.winnerId) return [];
  const chips: ResultChip[] = [];
  if (i.mineIds.includes(i.winnerId)) chips.push({ kind: "canon", text: PLAY_COPY.play.reveal.mineCanon });
  if (i.votedId === i.winnerId) chips.push({ kind: "called", text: PLAY_COPY.play.reveal.called });
  const lost = i.mineIds.filter((id) => id !== i.winnerId);
  if (lost.length > 0 && !i.mineIds.includes(i.winnerId)) {
    const best = Math.max(...lost.map((id) => votePercent(i.tally, i.total, id)));
    chips.push({ kind: "mine", text: PLAY_COPY.play.reveal.mineGot(best) });
  }
  return chips;
}

/** True when a scroller sits within `slack` px of its bottom edge. */
export function nearBottom(scrollTop: number, clientHeight: number, scrollHeight: number, slack = 56): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= slack;
}

export function pickLine<T>(lines: readonly T[], tick: number): T {
  return lines[((tick % lines.length) + lines.length) % lines.length];
}

export type CoachStep = "type" | "watch" | "vote";

/** Which hint a guided tour (Judge Mode) should show right now, if any. */
export function coachStep(i: { phase: Phase; ideasThisRound: number; voted: boolean }): CoachStep | null {
  if (i.phase === "STORM") return i.ideasThisRound > 0 ? "watch" : "type";
  if (i.phase === "DISTILL") return "watch";
  if (i.phase === "VOTE") return i.voted ? null : "vote";
  return null;
}

export type CanonMaker = { name: string; bot: boolean; count: number };

/** Top n by canon count (ties keep their incoming order). */
export function topCanonMakers(makers: readonly CanonMaker[], n = 5): CanonMaker[] {
  return makers
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.count - a.m.count || a.i - b.i)
    .slice(0, n)
    .map((x) => x.m);
}

export type ReceiptLike = { type: "BALLOT" | "CANON"; showId: string; roundNo: number };

/** One receipt per (type, show, round) is announced; the same receipt arriving twice is ignored. */
export function receiptKey(r: ReceiptLike): string {
  return `${r.type}:${r.showId}:${r.roundNo}`;
}

/** The canon moment is for the round on screen; older receipts only get the toast. */
export function isLiveCanon(r: ReceiptLike, state: Pick<PublicState, "showId" | "roundNo"> | null): boolean {
  return r.type === "CANON" && state !== null && r.showId === state.showId && r.roundNo === state.roundNo;
}

/** Per-show counts from a receipt list, for the finale "your night" tiles. */
export function receiptCounts(receipts: readonly ReceiptLike[], showId: string): { ballots: number; canon: number } {
  let ballots = 0;
  let canon = 0;
  const seen = new Set<string>();
  for (const r of receipts) {
    if (r.showId !== showId) continue;
    const k = receiptKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    if (r.type === "CANON") canon += 1;
    else ballots += 1;
  }
  return { ballots, canon };
}

export function groupByShow<T extends { showId: string }>(items: readonly T[]): { showId: string; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const it of items) {
    if (!map.has(it.showId)) {
      map.set(it.showId, []);
      order.push(it.showId);
    }
    map.get(it.showId)?.push(it);
  }
  return order.map((showId) => ({ showId, items: map.get(showId) ?? [] }));
}

/** Two-letter-or-longer language code from a locale like "hi-IN" -> "hi". */
export function shortLang(locale: string | null | undefined): string {
  const m = /^[a-zA-Z]{2,3}/.exec((locale ?? "").trim());
  return m ? m[0].toLowerCase() : "en";
}

export type Translated = {
  prompt: { title: string; text: string } | undefined;
  label: (o: PublicOption) => string;
  narration: string | null;
  /** True when a translation exists for this player's language. */
  available: boolean;
};

/** Pick translated or original text. Without a bundle for `lang` (or when asked for originals) nothing changes. */
export function translateView(state: PublicState, lang: string, showOriginal: boolean): Translated {
  const bundle: I18nBundle | undefined = state.i18n?.[lang];
  const available = Boolean(bundle && (bundle.prompt || bundle.options || bundle.narration));
  const use = available && !showOriginal ? bundle : undefined;
  return {
    prompt: use?.prompt ?? state.prompt,
    label: (o) => use?.options?.[o.id] ?? o.label,
    narration: use?.narration ?? state.outcome?.narration ?? null,
    available,
  };
}

export const RECAP_PENDING = (s: string | null | undefined): boolean => !s || !s.trim();
