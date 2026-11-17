// Words for Judge Mode (/try). Short, playful, second person (UX_SPEC §1). Shared with the coach marks and end card.
// One name for the minority slot everywhere here: "wildcard" (the card the phone and the screen both call that).
import type { CoachStep } from "@/components/play/PlayerView";
import { DEMO_MINUTES } from "@/lib/copy";

export type TryCoachStep = CoachStep | "voted";

export const TRY_COPY = {
  /** The honest line. The DEMO ribbon beside it says "demo", so the sentence starts at the number. */
  banner: { short: "30 🤖 simulated players", full: "30 🤖 simulated players. Live shows use real people." },
  title: "Play a whole show. Alone.",
  lead: `Three quick rounds against 30 simulated players. No host, nothing to set up. About ${DEMO_MINUTES} minutes.`,
  nameLabel: "Your name in the demo",
  nameShort: "Pick a name with at least two letters.",
  reroll: "Pick another random name",
  start: "Start the demo",
  starting: "Setting the stage…",
  stageTitle: "Setting the stage…",
  stageBody: "Opening a room and seating 30 simulated players.",
  honest: "The other 30 players are bots and wear a 🤖 everywhere. Real shows run with real people.",
  leave: "Leave the demo",
  name: { playingAs: "Playing as", change: "Change name", save: "Save", cancel: "Cancel", saving: "Saving…" },
  screen: { label: "The big screen", note: "What a room would see on the projector.", show: "Show the big screen", hide: "Hide the big screen" },
  phone: "Your phone",
  boost: {
    chip: "boosted in demo",
    body: "Demo only: your idea takes the wildcard slot, and the bots give it a nudge so you can watch a win. Live shows have no boost.",
  },
  end: {
    /** "That was <swash>3 rounds.</swash>" */
    lead: "That was ",
    marked: "3 rounds.",
    body: "Real shows run with real crowds.",
    host: "Host a show",
    how: "How it works",
    impact: "Impact",
    story: "Read the full story",
  },
  coach: {
    /** The numbered banner reads "1 of 3". */
    of: "of 3",
    tip: (n: number) => `Tip ${n} of 3.`,
    dismissLabel: (title: string) => `Dismiss tip: ${title}`,
    steps: {
      type: { n: 1, title: "Type any idea", body: "A short sentence works best." },
      watch: { n: 2, title: "Watch it compete", body: "Your idea joins 60 more. AI picks the best three." },
      vote: { n: 3, title: "Vote", body: "Tap an option. The ⚡ wildcard may be your idea." },
      voted: { n: 0, title: "Vote in", body: "Watch the bars move." },
    } satisfies Record<TryCoachStep, { n: number; title: string; body: string }>,
  },
} as const;
