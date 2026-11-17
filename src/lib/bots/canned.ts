// Canned demo ideas (mock mode and the live-mode fallback). Hand-written cores per preset, expanded
// deterministically into casual chat lines (lowercase, "lol", shouting; no typos: a bot line can become a ballot
// label or the winner card, and a misspelling there reads as our mistake). Four buckets mirror the bot mix from
// AI_PROMPTS §6: two obvious directions (a, b), varied ideas, and odd/funny ones.
import type { PresetId } from "../realtime/types";

export type CannedPool = { a: string[]; b: string[]; varied: string[]; odd: string[] };

type Cores = { a: string[]; b: string[]; varied: string[]; odd: string[] };

const CORES: Record<PresetId, Cores> = {
  heist: {
    a: [
      "sneak in through the air vents",
      "crawl through the vents quietly",
      "slip into the vents above the vault",
      "squeeze through the vent and drop in",
      "use the vents to reach the vault without a sound",
      "sneak past the guards through the vents",
      "climb into the vents from the kitchen",
      "wait for the guards to leave and take the vents",
      "go through the vents, nobody checks them",
      "take the vents because they are way quieter",
      "send the smallest of us through the vents",
      "unscrew the vent cover and crawl in",
      "follow the vents straight to the vault",
      "hide in the vents until the lights go out",
    ],
    b: [
      "set off a huge distraction in the lobby",
      "pull the fire alarm as a distraction and rush the vault",
      "make a loud distraction so the guards run to the lobby",
      "start a fake argument as a distraction",
      "cause a big distraction with confetti cannons",
      "blast music as a distraction and sprint in",
      "crash the gala and make a distraction on stage",
      "throw a distraction party for the guards",
      "release a hundred balloons as a distraction",
      "stage a distraction at the front desk",
      "ring every alarm in the hotel as a distraction",
      "send someone to cause a distraction while the rest go in",
      "announce a surprise party, that is the distraction",
      "create a distraction so loud nobody sees us",
    ],
    varied: [
      "bribe the night guard with a really good sandwich",
      "call the hotel owner and pretend to be the inspector",
      "swap the diamond with a fake from the gift shop",
      "ask the guard dog what it wants",
      "build a tiny robot to slip under the door",
      "steal the vault code from the manager's coffee mug",
      "dress up as a famous band and go in",
      "trade places with a statue in the hall",
      "team up with the rival crew just for tonight",
      "borrow the crane from the construction site next door",
      "pretend to be a pizza delivery for the penthouse",
      "ring the front desk bell and ask for a tour",
      "check the lost and found for the vault key",
      "ask the pianist to play the secret signal",
      "find the architect's old blueprints in the library",
      "zip line over from the next rooftop",
      "use a magnet on a string to fish out the diamond",
      "send a text from the boss that says abort",
      "make a deal with the pigeon on the windowsill",
      "tell the guards it is a surprise inspection",
    ],
    odd: [
      "the diamond is secretly a very expensive ice cube",
      "the guard dog is actually the mastermind",
      "the vault is just a giant cookie jar",
      "all the guards are asleep and snoring in harmony",
      "the vault door only opens if you compliment it",
      "the diamond sings opera when you touch it",
      "the elevator music is a secret code",
      "the night manager is three kids in a trench coat",
      "the vault is empty except for a ringing phone",
      "every painting in the hall winks at us",
      "the crew's cat has been the safecracker all along",
      "the hotel is built on top of a dance floor",
    ],
  },
  fantasy: {
    a: [
      "talk to it first and ask what it wants",
      "be friendly and offer it a snack",
      "talk it out and make friends",
      "say something friendly and wait",
      "sing a friendly song to calm everyone down",
      "talk to the old owl and ask for advice",
      "have a friendly chat before anyone draws a sword",
      "talk nicely, it might just be lonely",
      "share our campfire and talk all night",
      "ask the wizard to talk to it for us",
      "bow and talk politely to the queen",
      "send the friendliest of us to talk first",
      "talk to the river and follow what it says",
      "leave a friendly gift and talk later",
    ],
    b: [
      "charge in with swords and shields up",
      "charge the gate with a battering ram",
      "attack from above on the griffin",
      "shout a battle cry and charge",
      "charge across the bridge before it wakes",
      "attack at dawn with everything we have",
      "charge the tower and grab the crystal",
      "summon a big fireball and attack",
      "challenge the guardian and attack first",
      "charge through the haunted cave",
      "attack the door with the magic hammer",
      "charge in on the dragon's back",
      "blast our way through and attack all at once",
      "sound the war horn and charge",
    ],
    varied: [
      "turn into birds and fly over everything",
      "ask the tiny dragon what it knows",
      "dig a tunnel under the mountain",
      "dress up as goblins and walk into the market",
      "brew a potion that makes everyone brave",
      "plant a magic bean and climb up",
      "find the hidden stairs behind the waterfall",
      "tame the wild unicorn and borrow its horn",
      "carry the lantern to the top of the tallest tree",
      "hire a talking fox as our guide",
      "make a boat out of giant leaves",
      "read the stars to find the way",
      "ask the mushrooms for directions",
      "split up and meet again at the old oak",
      "swap hats with the troll and see what happens",
      "bake a giant pie and offer it to the giants",
      "paint a door on the wall and open it",
      "follow the trail of glowing butterflies",
      "ask the moon for a favour",
      "use the cloak to turn invisible",
    ],
    odd: [
      "the dragon is just a very big lizard in a costume",
      "the map is actually a menu",
      "the wizard forgot his own spell again",
      "the troll runs a bakery under the bridge",
      "the sword is actually a really sharp spoon",
      "the goblins are throwing a surprise birthday party",
      "the castle is made entirely of cheese",
      "the forest trees are gossiping about us",
      "the dragon has been knitting scarves all along",
      "the lantern is hungry and wants snacks",
      "the horse is secretly the king",
      "the magic mirror only gives fashion advice",
    ],
  },
  space: {
    a: [
      "open the airlock and say hello",
      "send a friendly hello on every channel",
      "say hello and see what it does",
      "wave hello from the window",
      "send a friendly robot to say hello",
      "say hello in every language we know",
      "invite it in and say hello with tea",
      "play a friendly tune as a hello",
      "put on suits and go out to say hello",
      "ask the ship's AI to say hello first",
      "slow down and say hello properly",
      "say a friendly hello and wait for a reply",
      "beam a hello back along the signal",
      "say hello, it knocked politely after all",
    ],
    b: [
      "hit the engines and escape right now",
      "flee to hyperspace",
      "escape behind the moon and cut the lights",
      "raise the shields and escape",
      "put everything into the engines and flee",
      "turn the ship around and escape at full speed",
      "escape through the asteroid field",
      "flee first and ask questions later",
      "blast the engines and escape the debris",
      "seal the doors and escape in the pod",
      "charge the engines and get away",
      "escape before the knocking starts again",
      "flee, nobody knocks politely in space",
      "punch the engines and escape",
    ],
    varied: [
      "make a snack and think about it",
      "ask the cat what it thinks",
      "paint the hull a brighter colour so we look friendly",
      "land on the nearest moon and take a walk",
      "trade the spare parts for fuel",
      "read the old captain's diary",
      "sneak a peek at the star map",
      "repair the broken antenna first",
      "tow the lost satellite back to its home",
      "radio the space station for advice",
      "send a postcard back to earth",
      "open a window and look outside",
      "build a slide from the airlock",
      "sing to the engine so it behaves",
      "check the back room nobody opens",
      "press the glowing button we were told not to press",
      "teach the robot to dance",
      "ask the navigator where his other boot is",
      "grow a garden in the cargo bay",
      "turn off all the lights and see who panics",
    ],
    odd: [
      "the knocking was the ship's own pipes the whole time",
      "the visitor is a space whale looking for its hat",
      "the moon is actually a very big egg",
      "the ship's cat is the real captain",
      "the aliens only want our wifi password",
      "the stars are all tiny lanterns on strings",
      "the engine runs on pure jokes",
      "the asteroid belt is a giant belt buckle",
      "the robot has been writing poetry about us",
      "the comet is delivering a pizza",
      "every planet here is a different flavour of jelly",
      "the black hole is a very polite drain",
    ],
  },
  mystery: {
    a: [
      "question the butler first",
      "question every suspect one at a time",
      "question the cook about where she was at nine",
      "gather the suspects and ask one tricky question",
      "question the suspects and compare their stories",
      "question the twins separately",
      "question the maid about what she saw",
      "question whoever looks nervous",
      "ask the suspects for alibis and question the gaps",
      "question the parrot, it hears everything",
      "question the guest of honour's best friend",
      "question the suspects about the muddy footprint",
      "watch how the suspects react when we question them",
      "question who left the table first",
    ],
    b: [
      "search the library for clues",
      "search the guest's room for the note",
      "search the kitchen cupboards for clues",
      "follow the muddy footprints and search outside",
      "search under the dinner table",
      "search the attic for hidden clues",
      "search the garden where the mud is",
      "search behind the big painting",
      "search the study for the safe",
      "dust for fingerprints and search for clues",
      "search the guest's coat pockets",
      "search the broken window for clues",
      "search the stopped clock for a secret",
      "search every room for clues, one by one",
    ],
    varied: [
      "read the half-written note out loud",
      "follow the cat who keeps staring at the closet",
      "go through the trash bin for clues",
      "look at the guest list for a missing name",
      "listen at the door to the secret room",
      "find who changed the dinner seating chart",
      "hold a surprise dance to see who panics",
      "check the weather report for the night",
      "call the phone number on the note",
      "try on the missing guest's hat",
      "smell the candles for something odd",
      "measure the footprints with a ruler",
      "set a trap with a plate of cookies",
      "ask the gardener about the muddy boots",
      "play the old record on the gramophone",
      "check the mirror for writing in the steam",
      "read the menu for anything unusual",
      "tail the suspect who keeps checking the time",
      "hide behind the curtain and watch",
      "look for the missing spoon",
    ],
    odd: [
      "the footprint belongs to the world's largest duck",
      "the butler did it, but only because the soup was cold",
      "the missing guest is hiding inside the cake",
      "the dinner was a prank the whole time",
      "the clock stopped because the pendulum went on holiday",
      "all six suspects are wearing the same hat",
      "the parrot is the real detective here",
      "the library has a very shy ghost",
      "the note is just a grocery list",
      "the guest of honour left to catch a very early train",
      "the mud came from the fanciest garden in town",
      "the house is secretly a giant music box",
    ],
  },
  classroom: {
    a: [
      "vote on it together as a class",
      "make a class plan together and vote",
      "decide together in a class meeting and vote",
      "let every student vote on a new rule",
      "work together on a big class poster, then vote",
      "split into teams and vote on the best idea together",
      "vote together and let the teacher help",
      "write ideas on the board together and vote",
      "vote together for the quietest student to lead",
      "make a class rulebook together and vote on it",
      "brainstorm together in pairs, then vote",
      "vote together on what changes first",
      "take notes together and vote on the plan",
      "test the idea together and then vote",
    ],
    b: [
      "throw a surprise party in the classroom",
      "have recess all day",
      "party in the gym with a ball pit",
      "start recess right now",
      "have a pajama party at school",
      "have recess first and skip the lessons",
      "start a dance party and a talent show",
      "bring snacks and throw a party",
      "party on the roof and have recess forever",
      "make lunch a party",
      "race the teachers at recess",
      "turn the hallway into a recess party",
      "build a fort for the recess party",
      "go to the playground, it is party time",
    ],
    varied: [
      "invent a new school subject called nap science",
      "ask the principal for a day with no homework",
      "make a time machine out of cardboard",
      "visit the lunch ladies and learn their secret recipe",
      "turn the library into a jungle",
      "write a letter to a student from a hundred years ago",
      "let the robot club run the morning announcements",
      "teach the teacher our favourite game",
      "grow a bean plant and name it",
      "draw a map of the whole school as a fantasy world",
      "have a debate about whether fish can read",
      "build a bridge out of paper and test it",
      "put on a play about the backwards bell",
      "go on a scavenger hunt around the school",
      "design a new playground on paper",
      "ask the janitor what he has seen",
      "make up a handshake for the whole class",
      "interview the oldest student",
      "fix the clocks with a class vote",
      "teach the class a magic trick",
    ],
    odd: [
      "the bell is actually a very tired dinosaur",
      "the teacher is secretly a wizard",
      "the school is moving to a new planet on friday",
      "the whiteboard is writing back",
      "the hamster has been grading our tests",
      "the lunch menu is only desserts today",
      "the chairs have been walking around at night",
      "the principal is three kids in a coat",
      "the clocks are all running on pancake time",
      "the homework turned itself in",
      "the playground slide goes to another school",
      "the backpacks are throwing a party in the lockers",
    ],
  },
  // Generic pool for custom stories: nothing here assumes a setting.
  custom: {
    a: [
      "take a careful look around first",
      "look around carefully before moving",
      "be careful and look around the corner",
      "look around and make a careful plan",
      "send one careful person ahead",
      "stay careful, listen and look around",
      "look around for a map or a sign, carefully",
      "peek through the door, carefully",
      "be careful and write down every clue",
      "look around slowly and stay careful",
      "check our supplies carefully and look around",
      "be careful and ask someone nearby what they know",
      "stay careful and look around for a safe path",
      "look around, then decide, carefully",
    ],
    b: [
      "rush in as fast as we can",
      "charge ahead without waiting",
      "rush the door and figure it out later",
      "charge toward the noise and shout hello",
      "rush to the highest spot immediately",
      "charge in, no plan needed",
      "rush everyone to the finish",
      "charge through the biggest door",
      "rush in with a big loud entrance",
      "charge across the gap",
      "rush in head first",
      "rush to the engine and charge off",
      "charge the gate before anyone thinks",
      "rush in before anyone changes their mind",
    ],
    varied: [
      "throw a party and invite everyone",
      "trade our best item for a clue",
      "build something out of what we find",
      "find a pet and take it with us",
      "ask the animals for directions",
      "paint a big sign and wave it around",
      "follow the nearest river",
      "follow the stranger in the funny hat",
      "make a deal with the first person we meet",
      "get a boat and sail off",
      "turn around and take another path",
      "dig under the biggest tree",
      "fly a kite and see where it goes",
      "make friends with the strangest person here",
      "bake something and share it",
      "swap places with someone else",
      "sing something and see who answers",
      "read the book we found on the ground",
      "climb the nearest tree and look around",
      "ask the sky for a sign",
    ],
    odd: [
      "the strange sound is just a very large cat",
      "the stranger is actually our future self",
      "the door leads to a tiny kitchen",
      "the map is upside down and so are we",
      "the whole place is a giant cake",
      "the clouds are laughing at us",
      "the treasure is a very good sandwich",
      "the shadow is following the wrong person",
      "the lights only work when we tell jokes",
      "the river runs uphill on tuesdays",
      "the helpful stranger is a pigeon in a tie",
      "the sound was just everyone's stomach",
    ],
  },
};

// Every opener is one the label cleaner strips whole (heuristics LEAD), so no stray "we" is left on a ballot label.
const PRE = ["lets ", "we should ", "i say lets ", "what if we ", "ok so lets ", "maybe we should ", "just ", "i think we should "];
const SUF = [" lol", " imo", "!!", " haha", " obviously", "...", " tbh", "!"];

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function finish(line: string): string {
  const h = hash(line);
  return h % 4 === 1 ? line[0].toUpperCase() + line.slice(1) : line;
}

/** Four casual phrasings per core. Imperative cores take "lets ..." wrappers; statements take "what if ...?". */
function expand(cores: string[], statement: boolean): string[] {
  const out: string[] = [];
  cores.forEach((core, i) => {
    const pre = PRE[i % PRE.length];
    const pre2 = PRE[(i + 3) % PRE.length];
    const suf = SUF[i % SUF.length];
    const suf2 = SUF[(i + 2) % SUF.length];
    const variants = statement
      ? [core, `what if ${core}?`, `${core}${suf}`, `ok but ${core}`]
      : [core, `${pre}${core}`, `${core}${suf}`, `${pre2}${core}${pre2 === "what if we " ? "?" : suf2}`];
    out.push(...variants.map(finish));
  });
  return [...new Set(out)];
}

const cache = new Map<PresetId, CannedPool>();

/** All canned lines for a preset, grouped by bucket (each line <= 100 chars, all distinct). */
export function cannedPool(preset: PresetId): CannedPool {
  const hit = cache.get(preset);
  if (hit) return hit;
  const c = CORES[preset] ?? CORES.custom;
  const pool: CannedPool = {
    a: expand(c.a, false),
    b: expand(c.b, false),
    varied: expand(c.varied, false),
    odd: expand(c.odd, true),
  };
  // A line must belong to one bucket only.
  const seen = new Set<string>();
  for (const k of ["a", "b", "varied", "odd"] as const) {
    pool[k] = pool[k].filter((l) => {
      if (seen.has(l)) return false;
      seen.add(l);
      return true;
    });
  }
  cache.set(preset, pool);
  return pool;
}

/** Every distinct canned line for a preset. */
export function cannedIdeas(preset: PresetId): string[] {
  const p = cannedPool(preset);
  return [...p.a, ...p.b, ...p.varied, ...p.odd];
}

function rngFor(seed: string): () => number {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Seeded sample with the bot mix: ~45% on two obvious directions (a and b equally), ~35% varied,
 * ~20% odd. Distinct lines only, so `count` is capped at the pool size.
 */
export function sampleCanned(preset: PresetId, count: number, seed: string): string[] {
  const rng = rngFor(`${preset}:${seed}`);
  const pool = cannedPool(preset);
  const n = Math.max(0, Math.floor(count));
  const quota = { a: Math.round(n * 0.225), b: Math.round(n * 0.225), varied: Math.round(n * 0.35), odd: 0 };
  quota.odd = Math.max(0, n - quota.a - quota.b - quota.varied);

  const picked: string[] = [];
  const left: string[] = [];
  for (const k of ["a", "b", "varied", "odd"] as const) {
    const s = shuffled(pool[k], rng);
    picked.push(...s.slice(0, quota[k]));
    left.push(...s.slice(quota[k]));
  }
  // A bucket shorter than its quota is topped up from whatever remains.
  if (picked.length < n) picked.push(...shuffled(left, rng).slice(0, n - picked.length));
  return shuffled(picked, rng);
}
