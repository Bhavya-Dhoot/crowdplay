// Copy that only the big screen uses. Shared strings (paused, unreachable, tooQuiet, narratorPick)
// stay in src/lib/copy.ts; this file holds the rest so the screen has no inline sentences.
export const SCREEN_COPY = {
  lobby: {
    scan: "Scan to join",
    noQr: "Join the show",
    inRoom: (n: number) => (n === 1 ? "1 player in the room" : `${n} players in the room`),
    waiting: "Waiting for the host to start",
    openSite: "Or open",
    enterCode: "and type the code",
    admit: "Admit one",
    seat: (n: number) => `Seat ${n}`,
  },
  prompt: { ready: "Ideas open in a moment" },
  storm: {
    empty: "Type the first idea on your phone",
    ghost: "An idea lands here",
    ideas: (n: number) => (n === 1 ? "1 idea" : `${n} ideas`),
  },
  distill: { headline: "The crowd has spoken… almost." },
  vote: {
    now: "Vote on your phone",
    votes: (n: number) => (n === 1 ? "1 vote" : `${n} votes`),
    fromIdeas: (n: number) => (n === 1 ? "from 1 idea" : `from ${n} ideas`),
    leading: "Leading",
  },
  reveal: {
    winner: "The crowd chose",
    writing: "The narrator is writing",
    improvised: "The narrator made this call",
    credit: "Written by",
  },
  finale: {
    writing: "Writing the finale",
    makers: "Canon makers",
    noMakers: "No one made canon this time",
    untitled: "The story so far",
  },
  ended: { thanks: "Thanks for playing", read: "Read the story", scanStory: "Scan to open the story" },
  stage: {
    loading: "Getting the show ready",
    players: (n: number) => (n === 1 ? "1 playing" : `${n} playing`),
    join: "Join:",
    storySoFar: "Story so far",
  },
  notFound: {
    title: "We can't find that show",
    body: "Check the code on the host's screen, or head back and start a new show.",
    action: "Back to the start",
  },
  sound: { on: "Sound on", off: "Sound off. Click to turn it on" },
} as const;
