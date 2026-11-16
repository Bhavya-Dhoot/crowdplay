// All user-facing copy lives here (voice: short, playful, second person, never technical).
// Pure data + tiny formatters, safe for server and client components and for unit tests.
//   friendlyError(code, fallback?)  error code -> sentence that says what to do next
//   creditLine(credit, more)        "@priya, @sam + 23 others" (🤖 after bot names)
//   randomName(rng?)                "Brave Otter"
//   PHASE_LABEL / phaseAnnouncement phase names and the aria-live announcement for a state
import type { IdeaRejectCode } from "@/lib/api/contracts";
import type { Credit, Phase, PublicState } from "@/lib/realtime/types";

// ---------- Phases ----------

export const PHASE_LABEL: Record<Phase, string> = {
  LOBBY: "Waiting room",
  PROMPT: "Get ready",
  STORM: "Idea storm",
  DISTILL: "Finding choices",
  VOTE: "Vote",
  REVEAL: "The reveal",
  FINALE: "Finale",
  ENDED: "Show ended",
};

const PHASE_HINT: Record<Phase, string> = {
  LOBBY: "Waiting for the host to start.",
  PROMPT: "A new scene is coming.",
  STORM: "Type your ideas now.",
  DISTILL: "Turning the ideas into three choices.",
  VOTE: "Pick your favourite.",
  REVEAL: "The crowd has decided.",
  FINALE: "That's the show.",
  ENDED: "This show has ended.",
};

/** Text for an aria-live region: what just changed, in one sentence. */
export function phaseAnnouncement(s: Pick<PublicState, "phase" | "roundNo" | "roundsTotal" | "paused">): string {
  if (s.paused) return "The host paused the show.";
  const round = s.phase === "LOBBY" || s.phase === "FINALE" || s.phase === "ENDED" ? "" : `Round ${s.roundNo} of ${s.roundsTotal}. `;
  return `${round}${PHASE_LABEL[s.phase]}. ${PHASE_HINT[s.phase]}`;
}

export const DISTILL_LINES = [
  "Finding the wildest one…",
  "Counting the votes of the brave…",
  "Untangling the chaos…",
  "Looking for the plot twist…",
  "Asking the narrator to pick a side…",
  "Sorting genius from nonsense…",
] as const;

export const STORM_NUDGES = ["a betrayal", "something falls", "a stranger appears"] as const;

export const CHEER_EMOJI = ["🔥", "😂", "👏", "😱", "🤯", "❤️"] as const;

// ---------- Errors ----------

export type ClientErrorCode =
  | IdeaRejectCode
  | "NO_SESSION"
  | "NAME_BLOCKED"
  | "ROOM_FULL"
  | "BAD_HOST_KEY"
  | "NOT_FOUND"
  | "INTERNAL"
  | "NETWORK"
  | "BAD_REQUEST"
  | "ENDED";

export const ERROR_COPY: Record<ClientErrorCode, string> = {
  NOT_STORM: "Ideas open when the storm starts. Hang tight.",
  WRONG_ROUND: "That round just ended. Your next idea goes to the new one.",
  EMPTY: "Type an idea first.",
  TOO_LONG: "Shorter, please. Ideas are 140 characters at most.",
  RATE_LIMITED: "Easy there. One idea every couple of seconds.",
  ROUND_CAP: "You've sent the most ideas allowed this round. Save some for the next one.",
  BLOCKED: "Let's keep it friendly. Try another idea.",
  MUTED: "The host muted you for now. You can still vote.",
  BANNED: "You've been removed from this show.",
  NOT_PARTICIPANT: "Join the show first, then send ideas.",
  NO_SESSION: "Pick a name first so we know who's playing.",
  NAME_BLOCKED: "That name won't work here. Try a different one.",
  ROOM_FULL: "This show is full. Watch it on the big screen instead.",
  BAD_HOST_KEY: "That host link isn't valid. Open the link from the setup screen again.",
  NOT_FOUND: "We can't find that show. Check the code and try again.",
  INTERNAL: "Something went wrong on our side. Try again in a moment.",
  NETWORK: "Can't reach the show. Check your connection and try again.",
  BAD_REQUEST: "That didn't go through. Check what you typed and try again.",
  ENDED: "This show has ended.",
};

const GENERIC_ERROR = ERROR_COPY.INTERNAL;

/** Friendly sentence for any API/error code. Unknown codes fall back to `fallback`, then a generic line. */
export function friendlyError(code: string | null | undefined, fallback?: string): string {
  if (code && Object.prototype.hasOwnProperty.call(ERROR_COPY, code)) return ERROR_COPY[code as ClientErrorCode];
  return fallback && fallback.trim() ? fallback : GENERIC_ERROR;
}

// ---------- Credits ----------

/** "@a, @b, @c + 4 others". Bots get a 🤖 after their name. Empty when nobody is credited. */
export function creditLine(credit: readonly Credit[], more = 0): string {
  const names = credit.map((c) => `@${c.name}${c.bot ? " 🤖" : ""}`).join(", ");
  const extra = Math.max(0, Math.floor(more));
  if (!names) return extra > 0 ? `${extra} ${extra === 1 ? "person" : "people"}` : "";
  if (extra === 0) return names;
  return `${names} + ${extra} ${extra === 1 ? "other" : "others"}`;
}

// ---------- Names ----------

// Every combination stays well inside the 20-character display-name limit (unit-tested).
const ADJECTIVES = [
  "Brave", "Sneaky", "Jolly", "Mighty", "Cosmic", "Plucky", "Wobbly", "Fearless", "Clever", "Sleepy",
  "Mellow", "Snazzy", "Zesty", "Dapper", "Fuzzy", "Gallant", "Hasty", "Lucky", "Rowdy", "Witty",
] as const;
const ANIMALS = [
  "Otter", "Falcon", "Badger", "Lynx", "Walrus", "Gecko", "Panda", "Heron", "Moose", "Newt",
  "Raven", "Yak", "Koala", "Marmot", "Ferret", "Puffin", "Tapir", "Bison", "Quokka", "Wombat",
] as const;

export const NAME_PARTS = { adjectives: ADJECTIVES, animals: ANIMALS } as const;

/** A fun default display name like "Brave Otter". */
export function randomName(rng: () => number = Math.random): string {
  const pick = <T>(xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}

// ---------- Screens ----------

export const COPY = {
  brand: "CrowdPlay",
  landing: {
    title: "The audience writes the show.",
    sub: "Everyone types. AI turns the chaos into three choices. The room decides. You get the credit.",
    join: { heading: "Join a show", hint: "Got a code from the host? Type it here.", button: "Join", codeLabel: "Show code" },
    host: { label: "Host a show", hint: "Pick a premise, set the timing and share the code." },
    try: { label: "Try it alone (60 s)", hint: "A demo room with simulated players. No host needed." },
    stepsHeading: "How a round works",
    steps: [
      { title: "Everyone types", body: "A short storm of ideas, straight from every phone in the room." },
      { title: "AI finds three choices", body: "The crowd's favourites plus one wildcard, written up as options A, B and C." },
      { title: "The room decides", body: "Everyone votes. The winner becomes canon and the people behind it get named on screen." },
    ],
  },
  nav: { howItWorks: "How it works", impact: "Impact", github: "GitHub" },
  nexconnBadge: "Built on Nexconn Chat SDK",
  connection: { reconnecting: "Reconnecting…", online: "Back online" },
  botTooltip: "Simulated player (demo room)",
  states: {
    unreachable: { title: "Hang tight — we'll be right back", body: "We can't reach the show right now. We'll keep trying." },
    retrying: "Trying again…",
    paused: { title: "Host paused the show", body: "Back in a moment." },
    cookiesBlocked: {
      title: "Cookies are blocked",
      body: "You can keep playing, but your browser may forget you if you close this tab. To fix it, allow cookies for this site in your browser settings, then reload.",
    },
    notFound: { title: "That page wandered off", body: "Check the link, or head back and join a show with its code.", action: "Back to the start" },
    error: { title: "That didn't go to plan", body: "Something broke on our side. Try again — your place in the show is safe.", action: "Try again", home: "Back to the start" },
  },
  composer: { placeholder: "Type an idea…", getReady: "Get ready…", reconnecting: "Reconnecting…", send: "Send idea" },
  reveal: { canon: "Your idea became canon", tooQuiet: "Too quiet! The narrator improvises.", narratorPick: "Narrator's pick" },
  try: { banner: "Demo room — 30 🤖 simulated players. Live shows use real people." },
} as const;
