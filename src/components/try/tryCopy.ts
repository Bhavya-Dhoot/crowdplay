// Words for Judge Mode (/try). Short, playful, second person (UX_SPEC §1). Shared with the coach marks and end card.
import type { CoachStep } from "@/components/play/PlayerView";

export const TRY_COPY = {
  pill: "Judge mode",
  title: "Play a whole show. Alone.",
  lead: "Three quick rounds against 30 simulated players. No host, nothing to set up. About three minutes.",
  nameLabel: "Your name in the demo",
  nameShort: "Pick a name with at least two letters.",
  reroll: "Pick another random name",
  start: "Start the demo",
  starting: "Setting the stage…",
  honest: "The other 30 players are bots and wear a 🤖 everywhere. Real shows run with real people.",
  steps: [
    { title: "Type an idea", body: "Anything goes. Short and silly works." },
    { title: "Watch it compete", body: "AI boils 60 ideas down to three choices." },
    { title: "Vote", body: "Maybe yours wins." },
  ],
  leave: "Leave the demo",
  screen: { label: "The big screen", note: "What a room would see on the projector.", show: "Show the big screen", hide: "Hide the big screen" },
  phone: "Your phone",
  boost: {
    title: "⚡ boosted in demo",
    body: "Demo only: your idea gets a boosted shot at the wildcard slot so you can watch it reach the ballot. Live shows have no boost.",
  },
  end: {
    title: "That was 3 rounds.",
    body: "Real shows run with real crowds.",
    host: "Host a show",
    how: "How it works",
    impact: "Impact",
  },
  coach: {
    count: (n: number) => `${n} of 3`,
    dismissLabel: (title: string) => `Dismiss tip: ${title}`,
    steps: {
      type: { n: 1, title: "Type any idea", body: "Anything goes. Silly works." },
      watch: { n: 2, title: "Watch it compete", body: "Your idea joins 60 more. AI picks the best three." },
      vote: { n: 3, title: "Vote — maybe yours wins", body: "Tap an option. A ⚡ wildcard may be yours." },
    } satisfies Record<CoachStep, { n: number; title: string; body: string }>,
  },
} as const;
