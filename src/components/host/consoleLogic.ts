// Pure helpers for the host console (no React, no browser APIs), so they are unit-tested.
//   primarySpec(state)        what the big stage-key button says and does for each phase (UX §3.4, D7)
//   controlAvailability(s)    which secondary controls the engine will actually honour right now
//   newerState(a, b)          pick the PublicState with the higher version (HTTP, feed and action replies race)
//   votePercent / optionTag   ballot maths and labels
//   filterPlayers / isOnline  the roster
//   hostErrorMessage(code)    friendly copy for host-only error codes
import type { HostActionInput, HostFeedPlayer } from "@/lib/api/contracts";
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
