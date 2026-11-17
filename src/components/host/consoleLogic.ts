// Pure helpers for the host console (no React, no browser APIs), so they are unit-tested.
//   primarySpec(state)        what the big stage-key button says and does for each phase (UX §3.4, D7)
//   controlAvailability(s)    which secondary controls the engine will actually honour right now
//   newerState(a, b)          pick the PublicState with the higher version (HTTP, feed and action replies race)
//   votePercent / optionTag   ballot maths and labels
//   filterPlayers / isOnline  the roster
//   headcount(players, now)   the one players count: joined (not removed) and online right now
//   timeline(state)           round pips + the five phases of a round, for the phase timeline
//   aiTime / aiProviderLabel / aiStatus   plain words for the diagnostics
//   actionToast(action)       the short confirmation each host action shows
//   hostErrorMessage(code)    friendly copy for host-only error codes
import type { HostActionInput, HostFeedPlayer, HostMetrics, RoomLinks } from "@/lib/api/contracts";
import { COPY, friendlyError } from "@/lib/copy";
import type { Phase, PublicOption, PublicState } from "@/lib/realtime/types";

type StateLike = Pick<PublicState, "phase" | "roundNo" | "roundsTotal" | "paused" | "phaseEndsAt" | "showId" | "stats">;

export type PrimarySpec = {
  label: string;
  /** One line under the button: what pressing it does, or what we are waiting for. */
  hint: string;
  /** null while the button is only a status (DISTILL) or a link (ENDED). */
  action: HostActionInput | null;
  href: string | null;
  disabled: boolean;
  /** True for the DISTILL "Reading ideas…" state, which gets a shimmer instead of a press. */
  waiting: boolean;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function primarySpec(s: StateLike): PrimarySpec {
  const base = { href: null, disabled: false, waiting: false } as const;
  let spec: PrimarySpec;
  switch (s.phase) {
    case "LOBBY":
      spec = {
        ...base,
        label: "Start show",
        hint: s.stats.players > 0 ? `${plural(s.stats.players, "player is", "players are")} in the room. Ready when you are.` : "Nobody has joined yet. You can still start.",
        action: { action: "start" },
      };
      break;
    case "PROMPT":
      spec = { ...base, label: "Start storm now", hint: "Skips the scene intro and opens the idea storm.", action: { action: "next" } };
      break;
    case "STORM":
      spec = {
        ...base,
        label: "End storm now",
        hint: s.stats.ideasThisRound > 0 ? `${plural(s.stats.ideasThisRound, "idea", "ideas")} so far. Stops new ideas and sends them to the AI.` : "Stops new ideas and sends them to the AI.",
        action: { action: "endStorm" },
      };
      break;
    case "DISTILL":
      spec = { ...base, label: "Reading ideas…", hint: "Turning the crowd's ideas into three choices.", action: null, disabled: true, waiting: true };
      break;
    case "VOTE":
      spec = { ...base, label: "Reveal now", hint: "Closes voting and shows the winner.", action: { action: "next" } };
      break;
    case "REVEAL": {
      const last = s.roundNo >= s.roundsTotal;
      spec = {
        ...base,
        label: last ? "Finale" : "Next round",
        hint: last ? "Wraps up the story and rolls the credits." : `Skips ahead to round ${s.roundNo + 1} of ${s.roundsTotal}.`,
        action: { action: "next" },
      };
      break;
    }
    case "FINALE":
      spec = { ...base, label: "End show", hint: "Closes the show for everyone. The story page stays.", action: { action: "endShow" } };
      break;
    case "ENDED":
      spec = { ...base, label: "Read the story", hint: "The show is over. Share the story page.", action: null, href: `/story/${s.showId}` };
      break;
  }
  // The engine ignores everything but resume/auto/voice/end while paused.
  if (s.paused && spec.action) spec = { ...spec, disabled: true, hint: "Paused. Press Resume to carry on." };
  return spec;
}

export type ControlAvailability = {
  canPause: boolean;
  canResume: boolean;
  canExtend: boolean;
  /** Veto, force win and re-roll are VOTE-only and need a running clock. */
  canModerateVote: boolean;
  canEnd: boolean;
};

const PAUSABLE: readonly Phase[] = ["PROMPT", "STORM", "VOTE", "REVEAL"];

export function controlAvailability(s: StateLike): ControlAvailability {
  const counting = !s.paused && s.phaseEndsAt !== null;
  return {
    canPause: counting && PAUSABLE.includes(s.phase),
    canResume: s.paused,
    canExtend: counting && (s.phase === "STORM" || s.phase === "VOTE"),
    canModerateVote: !s.paused && s.phase === "VOTE",
    canEnd: s.phase !== "ENDED",
  };
}

/** Highest version wins; on a tie the later server clock does. Either side may be missing. */
export function newerState(a: PublicState | null | undefined, b: PublicState | null | undefined): PublicState | null {
  if (!a) return b ?? null;
  if (!b) return a;
  if (b.v !== a.v) return b.v > a.v ? b : a;
  return b.serverNow >= a.serverNow ? b : a;
}

export function votePercent(votes: number, total: number): number {
  if (!(total > 0) || !(votes > 0)) return 0;
  return Math.min(100, Math.round((votes / total) * 100));
}

export function optionTag(o: Pick<PublicOption, "kind">): string | null {
  if (o.kind === "wildcard") return "Wildcard";
  if (o.kind === "narrator") return COPY.reveal.narratorPick;
  return null;
}

export const OPTION_TONE = { A: "a", B: "b", C: "c" } as const;

export function filterPlayers<P extends Pick<HostFeedPlayer, "name">>(players: readonly P[], query: string): P[] {
  const q = query.trim().toLowerCase();
  return q ? players.filter((p) => p.name.toLowerCase().includes(q)) : [...players];
}

export const ONLINE_WINDOW_MS = 45_000;
export function isOnline(lastSeenAt: number, now: number): boolean {
  return now - lastSeenAt <= ONLINE_WINDOW_MS;
}

/** Newest first. The feed arrives oldest first; ties keep the later row on top. */
export function newestFirst<T extends { createdAt: number }>(items: readonly T[]): T[] {
  return items.map((it, i) => ({ it, i })).sort((x, y) => y.it.createdAt - x.it.createdAt || y.i - x.i).map((x) => x.it);
}

export function ideaStatusLabel(status: "ok" | "blocked" | "deleted", authorBanned = false): string | null {
  if (status === "blocked" && authorBanned) return "Player removed";
  if (status === "blocked") return "Blocked by the filter";
  if (status === "deleted") return "Removed";
  return null;
}

/** Fallback links built from the page origin, used only until the first host feed brings the server's own. */
export function originLinks(origin: string, code: string): { join: string; screen: string; obs: string } {
  const base = origin.replace(/\/+$/, "");
  return { join: `${base}/join/${code}`, screen: `${base}/screen/${code}`, obs: `${base}/screen/${code}?obs=1` };
}

/** The server's links once the first host feed has arrived, the origin-built ones until then. */
export function resolveLinks(
  feed: { links: RoomLinks } | null,
  origin: string,
  code: string,
  hostKey: string,
): { join: string; screen: string; obs: string; host: string } {
  const own = originLinks(origin, code);
  return {
    join: feed?.links.join ?? own.join,
    screen: feed?.links.screen ?? own.screen,
    obs: feed?.links.obs ?? own.obs,
    host: feed?.links.host ?? `${origin}/host/${code}?k=${encodeURIComponent(hostKey)}`,
  };
}

/** "http://x.test/join/ABCDE" -> "x.test/join/ABCDE" */
export function shortLink(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

const HOST_ERRORS: Record<string, string> = {
  BAD_OPTION: "That choice just changed. Look at the new options and try again.",
  REROLL_USED: "You already used the re-roll this round.",
  IDEA_NOT_FOUND: "That idea is already gone.",
};

/** Host-only error codes first, then the shared copy table. */
export function hostErrorMessage(code: string, serverMessage?: string): string {
  return HOST_ERRORS[code] ?? friendlyError(code, serverMessage);
}

// ---------- one players count ----------

export type Headcount = {
  /** Everyone who joined and was not removed. This is the number the console shows everywhere. */
  joined: number;
  /** Joined players whose page was open in the last 45 s. */
  online: number;
};

/** One source for every count on the console: the roster itself, so the number and the list can never disagree. */
export function headcount(players: readonly Pick<HostFeedPlayer, "banned" | "lastSeenAt">[], now: number): Headcount {
  const present = players.filter((p) => !p.banned);
  return { joined: present.length, online: present.filter((p) => isOnline(p.lastSeenAt, now)).length };
}

// ---------- phase timeline ----------

export type StepStatus = "done" | "now" | "next";
export type Timeline = {
  rounds: { n: number; status: StepStatus }[];
  steps: { phase: Phase; label: string; status: StepStatus }[];
  /** "Waiting to start", "Round 2 of 5" or "Story complete": the spoken summary. */
  caption: string;
  /** A short visible line beside the pips; null while a round is live (the phase header already says "Round 2 / 5"). */
  label: string | null;
};

const ROUND_STEPS: { phase: Phase; label: string }[] = [
  { phase: "PROMPT", label: "Scene" },
  { phase: "STORM", label: "Ideas" },
  { phase: "DISTILL", label: "Reading" },
  { phase: "VOTE", label: "Vote" },
  { phase: "REVEAL", label: "Reveal" },
];

/** Where the show is: which rounds are done, and which of the five phases of this round is live. */
export function timeline(s: Pick<PublicState, "phase" | "roundNo" | "roundsTotal">): Timeline {
  const before = s.phase === "LOBBY";
  const after = s.phase === "FINALE" || s.phase === "ENDED";
  const total = Math.max(1, s.roundsTotal);
  const rounds = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const status: StepStatus = after || (!before && n < s.roundNo) ? "done" : !before && n === s.roundNo ? "now" : "next";
    return { n, status };
  });
  const at = ROUND_STEPS.findIndex((x) => x.phase === s.phase);
  const steps = ROUND_STEPS.map((x, i) => ({
    ...x,
    status: (after ? "done" : before ? "next" : i < at ? "done" : i === at ? "now" : "next") as StepStatus,
  }));
  const caption = before ? "Waiting to start" : after ? (s.phase === "ENDED" ? "Show ended" : "Story complete") : `Round ${s.roundNo} of ${total}`;
  const label = before ? `${total} ${total === 1 ? "round" : "rounds"}` : after ? (s.phase === "ENDED" ? "Show ended" : "Story complete") : null;
  return { rounds, steps, caption, label };
}

// ---------- plain words for the diagnostics ----------

/** 859 -> "859 ms", 2400 -> "2.4 s", null -> "—" */
export function aiTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  mock: "Practice mode, no live AI",
  heuristic: "Simple options, no AI",
  template: "Narrator's own options",
};

export function aiProviderLabel(provider: string | null | undefined): string | undefined {
  if (!provider) return undefined;
  return PROVIDER_LABEL[provider] ?? provider;
}

/** "Working normally" or "Backup options used": the same wording as the pill above the options. */
export function aiStatus(m: Pick<HostMetrics, "fallbackUsed"> | null): { text: string; warn: boolean } {
  return m?.fallbackUsed ? { text: "Backup options used", warn: true } : { text: "Working normally", warn: false };
}

// ---------- confirmations ----------

export type ActionToast = { title: string; body?: string };

/** What a host action says when it worked. Moves of the show itself (start, next, end storm) show on screen already, so they stay quiet. */
export function actionToast(a: HostActionInput): ActionToast | null {
  switch (a.action) {
    case "pause":
      return { title: "Show paused", body: "Everyone sees the pause. Press Resume to carry on." };
    case "resume":
      return { title: "Show resumed" };
    case "extend":
      return { title: `Added ${Math.round(a.ms / 1000)} seconds` };
    case "veto":
      return { title: "Option vetoed", body: "A replacement is on its way." };
    case "forceWin":
      return { title: "Winner chosen", body: "Your pick beats the crowd's vote." };
    case "reroll":
      return { title: "Re-rolling the options", body: "You can only do this once per round." };
    case "deleteIdea":
      return { title: "Idea removed", body: "It is gone from the big screen." };
    case "mute":
      return { title: a.on ? "Player muted" : "Player unmuted", body: a.on ? "Their new ideas are not accepted." : undefined };
    case "ban":
      return { title: a.on ? "Player removed" : "Player let back in" };
    case "autoAdvance":
      return { title: a.on ? "Auto-advance is on" : "Auto-advance is off", body: a.on ? undefined : "You press Next round after each reveal." };
    case "strictFilter":
      return { title: a.on ? "Strict filter is on" : "Strict filter is off" };
    case "voice":
      return { title: a.on ? "Narrator voice is on" : "Narrator voice is off" };
    default:
      return null;
  }
}
