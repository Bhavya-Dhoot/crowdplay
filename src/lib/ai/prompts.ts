// Scene prompt generator (AI_PROMPTS §4). Round 1 comes from presets.ts (instant); later rounds are
// written ahead of time by the smart model, with a hand-written preset scene list as the fallback.
import { z } from "zod";
import { PRESETS } from "../presets";
import type { PresetId } from "../realtime/types";
import { similarityRatio } from "./cluster";
import { callChain, llmLive } from "./providers";
import { safeLabel, safeText } from "./safety";
import type { PromptInput, PromptResult } from "./types";

type Scene = { title: string; text: string; narratorOptions: [string, string, string] };

// Rounds 2.. pick scenes[(roundNo - 2) % length]. Each text ends at a moment of decision.
export const SCENES: Record<PresetId, Scene[]> = {
  heist: [
    {
      title: "The Guard Dog Wakes Up",
      text: "A very large, very fluffy guard dog pads into the corridor and stares at your crew. It does not bark. It just waits, holding a squeaky toy. What does the crew do?",
      narratorOptions: [
        "Someone throws the toy down the hallway",
        "The crew sneaks around while the dog plays",
        "The dog leads the crew to a secret door",
      ],
    },
    {
      title: "The Laser Maze",
      text: "Red lasers crisscross the floor between you and the display case, and one of them is slowly rotating. Your safecracker whispers, 'Pick a path. Quickly.'",
      narratorOptions: [
        "The crew dances through the lasers one by one",
        "A mirror bounces the beams up at the ceiling",
        "Someone finds the switch hidden behind a painting",
      ],
    },
    {
      title: "A Rival Crew Appears",
      text: "A second crew in matching green jackets steps out of the elevator, already holding a very similar plan. Their leader tips an imaginary hat. 'Fancy meeting you here.'",
      narratorOptions: [
        "The two crews team up and split the prize",
        "Both crews race each other to the vault",
        "A fake alarm sends the rivals the wrong way",
      ],
    },
    {
      title: "The Diamond Is Missing",
      text: "The case opens with a soft click, and the diamond is gone. In its place sits a sticky note: 'Thanks for stopping by.' Footsteps hurry away overhead.",
      narratorOptions: [
        "The crew chases the footsteps across the rooftop",
        "Someone checks the security cameras for the thief",
        "The note turns out to be in the crew's own handwriting",
      ],
    },
    {
      title: "The Getaway Van Won't Start",
      text: "Sirens grow louder as your crew piles into the getaway van. The engine coughs, sputters, and the driver says, 'Okay. Nobody panic. Who knows anything about vans?'",
      narratorOptions: [
        "The crew pushes the van down the hill",
        "A passing food truck offers an unexpected ride",
        "The van starts, but only if everyone sings",
      ],
    },
    {
      title: "The Final Twist",
      text: "Back at the hideout, the mastermind finally takes off her sunglasses and says, 'There is something I never told you about tonight.' Everyone leans in.",
      narratorOptions: [
        "The whole heist was a test for a secret agency",
        "The mastermind owns the hotel and planned it all",
        "The diamond was never real, but something else was",
      ],
    },
  ],
  fantasy: [
    {
      title: "The Bridge Troll's Riddle",
      text: "A very polite troll blocks the old stone bridge. 'One riddle, one answer, no swords,' he says, adjusting tiny spectacles. 'Or pay the toll, which is a really good story.'",
      narratorOptions: [
        "The party answers the riddle together",
        "Someone tells the troll an embarrassing story",
        "The troll decides to join the quest",
      ],
    },
    {
      title: "The Library That Moves",
      text: "Deep in the forest you find a library standing on chicken legs. The door creaks open and a book flies out, landing at your feet, already open to a page with your name on it.",
      narratorOptions: [
        "The party reads the page aloud together",
        "The library stands up and walks off with everyone inside",
        "A ghostly librarian demands a very quiet password",
      ],
    },
    {
      title: "A Dragon Has a Cold",
      text: "The mountain dragon you came to ask for help sneezes sparks everywhere and sniffles, 'Sorry, I cannot guard anything today. Does anyone know a cure for dragon colds?'",
      narratorOptions: [
        "The party brews a soup from forest herbs",
        "A wizard offers a spell with risky side effects",
        "The dragon sneezes the party over the mountain",
      ],
    },
    {
      title: "The Forest Starts to Sing",
      text: "The trees begin to hum a slow, beautiful tune, and glowing paths open in the moss. One path leads up, one leads down, and one seems to be giggling.",
      narratorOptions: [
        "The party follows the humming path upward",
        "Everyone sings back to the trees",
        "The giggling path leads to a hidden tea party",
      ],
    },
    {
      title: "The Lantern's Last Spark",
      text: "At the heart of the Emberwood the great lantern flickers to its last spark. The dark presses in, and a small voice inside the flame asks, 'What will you give me?'",
      narratorOptions: [
        "The party gives the lantern their bravest memory",
        "A forgotten song relights the flame",
        "Someone offers the dragon's sneeze as fuel",
      ],
    },
    {
      title: "The Crown in the Cabbage Patch",
      text: "As dawn breaks, a farmer's cabbage patch shakes and a golden crown pops out of the soil. 'Congratulations,' mutters a cabbage. 'You found what you did not know you wanted.'",
      narratorOptions: [
        "Someone nervously puts on the crown",
        "The party gives the crown to the farmer",
        "The cabbage reveals that it is the true king",
      ],
    },
  ],
  space: [
    {
      title: "The Visitor Comes Aboard",
      text: "The airlock hisses open and a cheerful, glowing creature floats in, holding a tiny sign that reads 'LOST: ONE MOON'. It looks hopefully at the crew.",
      narratorOptions: [
        "The crew offers the visitor a seat and some snacks",
        "The ship's AI scans the sign for clues",
        "The creature asks to borrow the whole ship",
      ],
    },
    {
      title: "Gravity Takes a Break",
      text: "Without warning, gravity switches off. Snacks, socks and spare wrenches drift through the cabin, and the ship's cat floats past, looking deeply offended.",
      narratorOptions: [
        "The crew rounds everything up with a magnet net",
        "Someone discovers a secret game of zero-g tag",
        "The cat takes command of the bridge",
      ],
    },
    {
      title: "A Planet Made of Candy",
      text: "The scanner shows a bright pink planet with a sticky, sparkling surface, and the sensors report that it smells like strawberries. The captain asks, 'Shall we land?'",
      narratorOptions: [
        "The crew lands carefully and tests the ground",
        "A small probe goes down first to collect a sample",
        "The ship orbits while the crew argues about snacks",
      ],
    },
    {
      title: "The Engine Starts Talking",
      text: "The engine room rumbles, and a deep voice booms through the pipes: 'I have carried you for years, and I have opinions.' The chief engineer sighs, 'Not again.'",
      narratorOptions: [
        "The crew listens to the engine's list of complaints",
        "Someone trades the engine a promise for more power",
        "The engine reveals a shortcut through the stars",
      ],
    },
    {
      title: "The Signal From Home",
      text: "A faint message crackles on the old radio: 'Wanderling, come home. We have been waiting.' The voice sounds suspiciously like your own.",
      narratorOptions: [
        "The crew sets a course toward the signal",
        "The AI traces the voice to a nearby moon",
        "Someone sends back a very careful hello",
      ],
    },
    {
      title: "The Black Hole Detour",
      text: "The navigation screen shows a black hole dead ahead, and a sign floating beside it reads 'SHORTCUT TO EVERYWHERE (NO REFUNDS)'. The alarms chirp politely.",
      narratorOptions: [
        "The crew dives into the shortcut together",
        "The ship slingshots around the edge at top speed",
        "A strange tour guide pops up to explain the rules",
      ],
    },
  ],
  mystery: [
    {
      title: "Mud on the Butler's Shoes",
      text: "The butler insists he never left the kitchen, yet his polished shoes are covered in the same mud as the footprint. 'Merely a coincidence,' he says, a little too quickly.",
      narratorOptions: [
        "The detective follows the butler's trail outside",
        "The cook swears the butler baked all night",
        "The butler reveals he is an undercover detective",
      ],
    },
    {
      title: "A Door Behind the Clock",
      text: "The grandfather clock chimes thirteen times, and behind it a narrow door swings open onto a staircase that smells of old paper and peppermint.",
      narratorOptions: [
        "The detective climbs the stairs alone",
        "Everyone crowds in to see what is inside",
        "The clock chimes again and the door vanishes",
      ],
    },
    {
      title: "The Twin Nobody Mentioned",
      text: "Lady Peabody's cousin Reginald walks in, then walks in again through a different door. 'Oh dear,' they say together. 'Did we forget to mention the twin?'",
      narratorOptions: [
        "The detective asks each twin for a different story",
        "One twin turns out to be an excellent witness",
        "Both twins blame the parrot",
      ],
    },
    {
      title: "The Parrot Knows Something",
      text: "In the conservatory, Lady Peabody's parrot clears its throat and squawks, 'Not the soup! Not the soup!' Every suspect suddenly finds the ceiling very interesting.",
      narratorOptions: [
        "The detective investigates the soup tureen",
        "The parrot repeats a clue it overheard last night",
        "The suspects all offer the parrot a cracker",
      ],
    },
    {
      title: "A Letter by Pigeon",
      text: "A note arrives by pigeon: 'Do not worry, I am quite safe. Meet me where the tallest hat meets the biggest secret. Come alone. Bring snacks.'",
      narratorOptions: [
        "The detective hurries to the hat shop in town",
        "The suspects all insist on coming along",
        "The note turns out to be written in invisible ink",
      ],
    },
    {
      title: "Everyone Gathers in the Parlour",
      text: "The detective clears her throat in the grand parlour and every suspect holds their breath. 'I know who did it,' she says, 'and the answer may surprise you.'",
      narratorOptions: [
        "The detective accuses the least likely guest",
        "The missing guest bursts in to reveal the truth",
        "The lights go out again just before the reveal",
      ],
    },
  ],
  classroom: [
    {
      title: "The Class Pet Gets a Promotion",
      text: "The class hamster has been named principal for the day, complete with a tiny tie. It squeaks, and somehow everyone understands: 'First order of business?'",
      narratorOptions: [
        "The hamster declares a school-wide snack break",
        "The hamster appoints a student as assistant principal",
        "The hamster cancels all homework forever",
      ],
    },
    {
      title: "The Playground Disappears",
      text: "At recess the playground has vanished, leaving only a sign that says 'Back in five minutes.' The class stares at an empty field. What do they do?",
      narratorOptions: [
        "The class invents a brand-new game from nothing",
        "Students build a new playground from lunchboxes",
        "The playground returns with surprise new rules",
      ],
    },
    {
      title: "The Mystery Subject",
      text: "A new timetable appears on the board with a lesson nobody has heard of: 'Period 3: Dragons.' The teacher shrugs and says, 'I guess we are all about to find out.'",
      narratorOptions: [
        "The class learns to speak to dragons",
        "A friendly dragon visits and the class takes notes",
        "The lesson turns out to be about drawing dragons",
      ],
    },
    {
      title: "The Lost Homework Mystery",
      text: "Every homework sheet has vanished, but a trail of paper airplanes leads down the corridor. The class puts on detective hats and looks at you. 'Where first?'",
      narratorOptions: [
        "The class follows the airplanes up to the roof",
        "Someone checks the lost property box",
        "The airplanes fly back and deliver the homework",
      ],
    },
    {
      title: "The Science Fair Goes Wild",
      text: "A volcano model is bubbling over with rainbow foam, and now the foam is forming tiny shapes. 'That was not in the instructions,' whispers the teacher. 'Now what?'",
      narratorOptions: [
        "The class gives every foam creature a name",
        "Students try to teach the foam to count",
        "The foam builds a bridge across the hallway",
      ],
    },
    {
      title: "The Time Capsule Opens",
      text: "The old time capsule in the hall creaks open, and a note from students long ago reads: 'We left you one challenge. Good luck.' The class gathers around.",
      narratorOptions: [
        "The class reads the challenge out loud together",
        "Everyone writes a letter for the next capsule",
        "The capsule holds a map to a hidden room",
      ],
    },
  ],
  custom: [
    {
      title: "A Sudden Surprise",
      text: "The ground trembles, the lights blink, and something unexpected arrives right in front of everyone. It waits quietly, as if it expects you to make the first move.",
      narratorOptions: [
        "Everyone steps forward to say hello",
        "The group argues loudly about what to do",
        "Someone tries something completely unexpected",
      ],
    },
    {
      title: "A Fork in the Road",
      text: "The path splits in three: one bright and noisy, one dark and quiet, and one that is simply a very large slide. Everyone looks at you.",
      narratorOptions: [
        "The group takes the bright and noisy path",
        "The group slips down the dark and quiet path",
        "Everyone cheers and rides the giant slide",
      ],
    },
    {
      title: "An Unexpected Helper",
      text: "Just when things look tricky, a stranger in a very tall hat appears and says, 'I can help, but I only do favours in riddles.' Everyone waits for your answer.",
      narratorOptions: [
        "The group accepts the stranger's riddle favour",
        "Someone suspects the stranger and follows quietly",
        "The stranger turns out to be someone's long-lost cousin",
      ],
    },
    {
      title: "The Clock Is Ticking",
      text: "A loud clock starts counting down from somewhere nobody can find. Whatever happens at zero, it will not wait for a long discussion. What do you do first?",
      narratorOptions: [
        "The group splits up to search for the clock",
        "Someone smashes the clock with a very large spoon",
        "The countdown reaches zero and a door appears",
      ],
    },
    {
      title: "A Big Secret Slips Out",
      text: "Someone in the group blurts out a secret that changes everything, and the room goes silent. Every head turns to you to decide what happens next.",
      narratorOptions: [
        "The group forgives the secret and plans together",
        "A heated argument splits the group in two",
        "The secret turns out to be a clue to a treasure",
      ],
    },
    {
      title: "The Final Choice",
      text: "At last the answer sits right in front of you, waiting behind a door that feels very important. One choice will define how this story ends.",
      narratorOptions: [
        "The group opens the door together",
        "Someone picks the lock and goes in first",
        "The door opens by itself and welcomes everyone",
      ],
    },
  ],
};

const PromptSchema = z.object({
  title: z.string().min(3).max(40),
  text: z.string().min(20).max(220),
  narratorOptions: z.array(z.string().min(8).max(70)).length(3),
});

const SYSTEM = `You set up the next scene of a live, crowd-written story and ask the audience what happens next.
Return: title (max 40 chars), text (max 220 chars, 1-2 vivid sentences ending at a moment of decision),
and three "narratorOptions" (max 70 chars each, clearly different) used only if the crowd is silent.
Keep it open-ended so hundreds of different ideas fit. Family-friendly. Continue naturally from the story so far
and do not repeat earlier scenes.`;

function pickScene(preset: PresetId, roundNo: number): Scene {
  const list = SCENES[preset] ?? SCENES.custom;
  const i = (((roundNo - 2) % list.length) + list.length) % list.length;
  return list[i];
}

/** Instant, no-LLM scene used when pre-generation did not finish in time. */
export function fallbackPrompt(input: PromptInput): Omit<PromptResult, "ms"> & { ms: 0 } {
  const scene = input.story.roundNo <= 1 ? PRESETS[input.story.preset].round1 : pickScene(input.story.preset, input.story.roundNo);
  return {
    provider: "preset",
    fallbackUsed: true,
    ms: 0,
    title: scene.title,
    text: scene.text,
    narratorOptions: [...scene.narratorOptions],
  };
}

function distinct(options: string[]): boolean {
  return options.every((o, i) => options.every((p, j) => i === j || similarityRatio(o, p) < 0.8));
}

export async function generatePrompt(input: PromptInput): Promise<PromptResult> {
  if (!llmLive()) return { ...fallbackPrompt(input), provider: "mock", fallbackUsed: false };

  const t0 = Date.now();
  const { story } = input;
  const user = [
    `PREMISE: ${story.premise}`,
    `TONE: ${PRESETS[story.preset].tone}`,
    `STORY SO FAR: ${story.summary || "(the story is just beginning)"}`,
    `LAST BEAT: ${input.lastBeat ?? "(none)"}`,
    `ROUND ${story.roundNo} of ${story.roundsTotal}.`,
    `LANGUAGE: ${story.lang}`,
  ].join("\n\n");
  try {
    const r = await callChain(
      [
        { role: "smart", timeoutMs: 4500 },
        { role: "fast", timeoutMs: 3000 },
      ],
      6000,
      {
        system: SYSTEM,
        user,
        schema: PromptSchema,
        name: "scene_prompt",
        maxTokens: 500,
        check: (d) => (distinct(d.narratorOptions) ? null : "narratorOptions must be clearly different from each other"),
      },
    );
    const title = safeText(r.data.title, 40);
    const text = safeText(r.data.text, 220);
    const options = r.data.narratorOptions.map((o) => safeLabel(o));
    if (!title || !text || options.some((o) => o === null)) {
      return { ...fallbackPrompt(input), ms: Date.now() - t0 };
    }
    return {
      provider: r.provider,
      fallbackUsed: r.stepIndex > 0,
      ms: Date.now() - t0,
      title,
      text,
      narratorOptions: options as [string, string, string],
    };
  } catch {
    return { ...fallbackPrompt(input), ms: Date.now() - t0 };
  }
}
