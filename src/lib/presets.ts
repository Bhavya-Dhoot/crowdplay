// Shared by server and client; keep it data-only.
import type { PresetId } from "./realtime/types";

export type Preset = {
  id: PresetId;
  name: string;
  emoji: string;
  /** Default premise shown in the setup wizard (custom: empty, host writes it). */
  premise: string;
  tone: string;
  /** Round 1 prompt is hand-written so the show starts with zero LLM latency. */
  round1: { title: string; text: string; narratorOptions: [string, string, string] };
  /** Starter nudges shown as chips in STORM. */
  starters: [string, string, string];
};

export const PRESETS: Record<PresetId, Preset> = {
  heist: {
    id: "heist",
    name: "Heist",
    emoji: "💎",
    premise:
      "Your crew has one night to lift the Midnight Diamond from the rooftop vault of the Grand Aurelia Hotel. The guards rotate every ten minutes, the lights run on a timer, and everyone brought a different plan.",
    tone: "Slick, funny caper-movie energy with quick banter and cartoon-safe danger.",
    round1: {
      title: "The Vault Door Hums",
      text: "Midnight. You crouch outside the Grand Aurelia's vault as the guard's footsteps fade and your earpiece crackles: 'Boss, we have ninety seconds. How do we get in?'",
      narratorOptions: [
        "The crew slips through the air vents above the vault",
        "A fake fire drill empties the whole hotel",
        "The night guard turns out to be an old friend",
      ],
    },
    starters: ["Sneak in through the vents", "Cause a distraction in the lobby", "Call the inside man for the code"],
  },
  fantasy: {
    id: "fantasy",
    name: "Fantasy Quest",
    emoji: "🐉",
    premise:
      "The last lantern of the Emberwood is going dark, and only a ragtag party carrying a map nobody can read can relight it before the long night falls.",
    tone: "Warm, adventurous storybook fantasy with cheeky humour.",
    round1: {
      title: "The Map Starts Glowing",
      text: "At the edge of Emberwood your torn map begins to glow, and a tiny dragon in a scarf lands on your shoulder. 'The shortcut is through the Whispering Bog,' it says. 'Or the Goblin Market. Choose!'",
      narratorOptions: [
        "The party wades into the Whispering Bog at dusk",
        "A goblin merchant offers a shortcut for one secret",
        "The tiny dragon leads everyone straight up the cliff",
      ],
    },
    starters: ["Take the bog path", "Trade with the goblin market", "Ask the dragon for a ride"],
  },
  space: {
    id: "space",
    name: "Space Mission",
    emoji: "🚀",
    premise:
      "The research ship Wanderling has just woken from hyper-sleep far past its destination. The navigator is missing a boot, and something outside keeps politely knocking on the hull.",
    tone: "Wonder-filled sci-fi with gentle comedy and clever problem solving.",
    round1: {
      title: "Something Knocks on the Hull",
      text: "The Wanderling's lights flicker green. Three slow knocks ring from the airlock, then a soft voice on every speaker asks, 'Hello? Is this the right ship?' The crew turns to you, captain.",
      narratorOptions: [
        "The crew opens the airlock and says hello",
        "The ship's AI reveals it was expecting a visitor",
        "The captain asks the voice to describe itself first",
      ],
    },
    starters: ["Open the airlock", "Ask the ship's AI", "Hide the snacks first"],
  },
  mystery: {
    id: "mystery",
    name: "Murder Mystery",
    emoji: "🔍",
    premise:
      "At Lady Peabody's winter dinner party the lights flicker, the cake collapses, and the guest of honour is gone, leaving behind one muddy footprint and a half-written note.",
    tone: "Cosy, witty whodunit with colourful suspects and dramatic reveals; nothing graphic.",
    round1: {
      title: "The Lights Come Back On",
      text: "When the lights return, the guest of honour's chair is empty, a muddy footprint leads toward the library, and six suspects all start talking at once. Detective, where do you start?",
      narratorOptions: [
        "The detective checks the library for the footprint's owner",
        "The suspiciously calm butler gets questioned first",
        "Someone tastes the collapsed cake for clues",
      ],
    },
    starters: ["Follow the footprint", "Question the butler", "Search the guest's room"],
  },
  classroom: {
    id: "classroom",
    name: 'Classroom "What if?"',
    emoji: "🎓",
    premise:
      "It is Monday morning and the school bell has started ringing backwards. Everyone in the room gets to help decide what happens when the rules of school flip for one day.",
    tone: "Curious, encouraging and playful; friendly for ages 8 to 14 and always kind.",
    round1: {
      title: "The Bell Rings Backwards",
      text: "The bell rings backwards, the clocks run in circles, and your teacher announces, 'Today school works the other way around.' What is the first thing that changes?",
      narratorOptions: [
        "Students become the teachers for the first lesson",
        "Lunch is served before the morning lessons",
        "The playground moves inside the classroom",
      ],
    },
    starters: ["Students teach the class", "Recess comes first", "Teachers get homework"],
  },
  custom: {
    id: "custom",
    name: "Custom",
    emoji: "✨",
    premise: "",
    tone: "Open and imaginative; follow the premise the host wrote.",
    round1: {
      title: "Our Story Begins",
      text: "Everything is about to change. A strange sound echoes nearby, every eye turns to you, and the next move is yours. What happens next?",
      narratorOptions: [
        "Everyone goes to investigate the strange sound",
        "A mysterious stranger offers help for a price",
        "The group splits up to explore in different directions",
      ],
    },
    starters: ["Explore somewhere new", "Meet a mysterious stranger", "Try something nobody expects"],
  },
};
