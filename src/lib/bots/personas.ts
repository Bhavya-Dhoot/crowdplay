// Thirty invented demo personas (TECH_SPEC §11). Ids are stable across restarts so bot users, ideas
// and receipts line up between runs. Names are made up; none refers to a real person.
export type BotStyle = "chaotic" | "wholesome" | "dramatic" | "deadpan" | "nerdy" | "poetic" | "blunt" | "punny";
export type BotVerbosity = "terse" | "normal" | "chatty";

export type BotPersona = { id: string; name: string; style: BotStyle; verbosity: BotVerbosity };

export const BOT_PERSONAS: readonly BotPersona[] = [
  { id: "b_l6fc4e558gjeyl3d", name: "Captain Noodle", style: "dramatic", verbosity: "chatty" },
  { id: "b_eixcg52aavakwn5s", name: "Pixel Pancake", style: "nerdy", verbosity: "normal" },
  { id: "b_7ondbeltq2kkyavn", name: "Sir Reginald Crumb", style: "dramatic", verbosity: "normal" },
  { id: "b_8ol5n18mprsrr786", name: "Moxie Marmalade", style: "chaotic", verbosity: "chatty" },
  { id: "b_y0twc4dn04ept64g", name: "Dr. Wobble", style: "nerdy", verbosity: "chatty" },
  { id: "b_vomxhi6ksr8lwgt5", name: "Bongo Breeze", style: "wholesome", verbosity: "terse" },
  { id: "b_fwei7vqqdrf5zle7", name: "Professor Plink", style: "nerdy", verbosity: "normal" },
  { id: "b_shftkqkpfdfrw6l7", name: "Gadget Gus", style: "blunt", verbosity: "terse" },
  { id: "b_lbw6osegg5ro5jqc", name: "Lady Lavender Fizz", style: "poetic", verbosity: "chatty" },
  { id: "b_k20pp4ma9bvnu1uk", name: "Turbo Turnip", style: "chaotic", verbosity: "terse" },
  { id: "b_zmaaxo3qxl7mm8ig", name: "Mystic Mittens", style: "poetic", verbosity: "normal" },
  { id: "b_f0wqcs2s9izy5z7d", name: "Zigzag Zed", style: "chaotic", verbosity: "normal" },
  { id: "b_ldnu8x523mwhtk6f", name: "Biscuit Bandit", style: "punny", verbosity: "normal" },
  { id: "b_te93gaolf2eo5kq2", name: "Nova Noodlewick", style: "wholesome", verbosity: "chatty" },
  { id: "b_mx2y0jy7df57qce1", name: "Grumbly Bear", style: "deadpan", verbosity: "terse" },
  { id: "b_hrfvy2s5wizj5ypl", name: "Quill Quackenbush", style: "punny", verbosity: "chatty" },
  { id: "b_bwatsn7gdnfh331j", name: "Sprocket Sue", style: "blunt", verbosity: "normal" },
  { id: "b_kf1esj8ypjg2slmb", name: "Jellybean Jo", style: "wholesome", verbosity: "normal" },
  { id: "b_2nvjaxzyj5p4pgpd", name: "Marshmallow Max", style: "wholesome", verbosity: "terse" },
  { id: "b_lbndcgj7vsbmy5la", name: "Cosmic Ziggle", style: "chaotic", verbosity: "chatty" },
  { id: "b_7jyot93x4wr0qqi4", name: "Pickle Pirate", style: "dramatic", verbosity: "terse" },
  { id: "b_rekk3ebb8t13ukph", name: "Wanda Wonderpants", style: "punny", verbosity: "normal" },
  { id: "b_czhbj8y3niy69h4g", name: "Fuzzy Fenwick", style: "deadpan", verbosity: "normal" },
  { id: "b_p9k15sg6tiqcz956", name: "Dizzy Dumpling", style: "chaotic", verbosity: "terse" },
  { id: "b_gewectykunri4blt", name: "Echo Ember", style: "poetic", verbosity: "terse" },
  { id: "b_0jcrr81qyb0pfk0j", name: "Banjo Bumble", style: "wholesome", verbosity: "chatty" },
  { id: "b_pphj1xj3lgc5xnrb", name: "Tilly Thunderbean", style: "dramatic", verbosity: "normal" },
  { id: "b_fzbwbu4j0ixsrs36", name: "Waffle Wizard", style: "punny", verbosity: "terse" },
  { id: "b_be04xdjyh6bltyxx", name: "Squeaky Sprout", style: "deadpan", verbosity: "chatty" },
  { id: "b_xwn5irmudtsz6ta6", name: "Otto Orbit", style: "blunt", verbosity: "chatty" },
];

export const BOT_ID_RE = /^b_[a-z0-9]{16}$/;

export function personaById(id: string): BotPersona | undefined {
  return BOT_PERSONAS.find((p) => p.id === id);
}
