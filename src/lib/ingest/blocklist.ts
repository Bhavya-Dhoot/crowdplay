// Starter moderation word lists (isomorphic: bundled into the client for pre-filtering feeds).
// Matching rules live in filter.ts: whole words only (so "class" and "Scunthorpe" stay clean),
// after diacritic + leetspeak folding. Entries are written in their natural spelling; the filter
// folds them the same way it folds user text. Exported so the Nexconn adapter can sync the same
// list to the provider's profanity setting.

export type BlocklistLang = "en" | "slurs" | "hi" | "es" | "fr" | "de" | "pt";

/** Always blocked, per language. */
export const BLOCKLIST: Record<BlocklistLang, readonly string[]> = {
  en: [
    "fuck", "fucks", "fucked", "fucker", "fuckers", "fucking", "fuckin", "fuckhead", "fuckface", "fuckwit",
    "motherfucker", "motherfuckers", "motherfucking",
    "shit", "shits", "shitty", "shitting", "shithead", "shitface", "bullshit", "horseshit", "dipshit",
    "bitch", "bitches", "bitchy", "cunt", "cunts", "cock", "cocks", "cocksucker", "dick", "dicks", "dickhead",
    "pussy", "pussies", "asshole", "assholes", "arsehole", "arseholes", "bastard", "bastards",
    "bollocks", "wanker", "wankers", "wank", "twat", "twats", "slut", "sluts", "slutty", "whore", "whores",
    "skank", "dildo", "dildos", "blowjob", "blowjobs", "handjob", "rimjob", "jizz", "cum", "cumshot",
    "porn", "porno", "tits", "titty", "titties", "jerkoff", "jack off",
    "rape", "raped", "rapes", "rapist", "rapists", "molest", "molester", "pedo", "pedophile", "paedophile",
    "incest", "kys", "kill yourself", "kill urself",
  ],
  slurs: [
    "nigger", "niggers", "nigga", "niggas", "faggot", "faggots", "fag", "fags", "retard", "retards", "retarded",
    "tranny", "trannies", "shemale", "chink", "chinks", "spic", "spics", "kike", "kikes", "gook", "gooks",
    "wetback", "wetbacks", "paki", "pakis", "dyke", "dykes", "towelhead", "raghead", "beaner", "wop", "dago", "heeb",
  ],
  // Hindi / Hinglish (Latin script) and Devanagari.
  hi: [
    "madarchod", "madarchodh", "maderchod", "madarchood", "behenchod", "bhenchod", "bhenchodh", "benchod",
    "bhainchod", "bhosdike", "bhosdika", "bhosdi", "bhosdiwala", "bhosadike", "bhosda", "chutiya", "chutiye",
    "chutiyapa", "chut", "chod", "chodu", "chodna", "gandu", "gaandu", "gaand", "randi", "randwa", "raand",
    "harami", "haramzada", "haramzade", "haramkhor", "lund", "lauda", "lawda", "lavda", "bakchod", "bakchodi",
    "bsdk", "mkc", "bhadwa", "bhadwe",
    "मादरचोद", "बहनचोद", "भोसड़ीके", "भोसडीके", "चूतिया", "चुतिया", "गांडू", "रंडी", "रांड", "हरामी", "हरामखोर",
    "लंड", "लौड़ा", "लौडा",
  ],
  es: [
    "puta", "putas", "puto", "putos", "putita", "mierda", "mierdas", "cabron", "cabrona", "pendejo", "pendeja",
    "pendejos", "pendejas", "coño", "joder", "jodete", "follar", "chingar", "chingada", "chingado", "chingadera",
    "verga", "culero", "marica", "maricon", "mamada", "puñeta", "gilipollas", "hijoputa", "hijo de puta",
    "hijo de la gran puta",
  ],
  fr: [
    "merde", "merdes", "putain", "putains", "pute", "putes", "salope", "salopes", "salaud", "salauds",
    "connard", "connards", "connasse", "connasses", "enculé", "enculer", "enculés", "nique", "niquer", "tapette",
  ],
  de: [
    "scheisse", "scheiße", "scheiss", "scheisskerl", "scheissdreck", "arschloch", "arschlöcher", "arsch",
    "fotze", "fotzen", "wichser", "wichsen", "hurensohn", "hure", "huren", "schlampe", "schlampen", "fick",
    "ficken", "ficker", "fickt", "ficke", "miststück", "drecksau", "schwuchtel",
  ],
  pt: [
    "porra", "caralho", "foda", "fodase", "foda-se", "foder", "fodido", "fodida", "fodeu", "puta", "puto",
    "putinha", "merda", "merdas", "buceta", "boceta", "viado", "cuzão", "arrombado", "arrombada", "vagabunda",
    "filho da puta",
  ],
};

/** Extra mild words blocked only when the room's strict filter is on (the default). */
export const BLOCKLIST_STRICT_EXTRA: readonly string[] = [
  "damn", "damned", "damnit", "dammit", "goddamn", "goddamned", "goddammit", "hell", "crap", "crappy",
  "piss", "pissed", "pissing", "pisser", "ass", "asshat", "jackass", "dumbass", "arse", "idiot", "idiots",
  "stupid", "moron", "morons", "dumb", "jerk", "jerks", "wtf", "stfu", "omfg", "sex", "sexy", "nude", "nudes",
  "penis", "vagina", "boob", "boobs", "boobies", "butt", "butts", "anus",
  // other languages (mild)
  "kutta", "kutti", "kamina", "kamine", "kameena", "saala", "saali", "tatti",
  "carajo", "cojones", "boludo", "pelotudo", "pene",
  "bordel", "couille", "couilles", "chiant",
  "verdammt", "kacke",
  "cacete", "babaca", "otario", "imbecil", "idiota",
];

function unique(words: readonly string[]): string[] {
  return [...new Set(words)];
}

/** Flat list for the profanity sync / filter. `strict` adds the mild extras. */
export function blocklistWords(strict: boolean): string[] {
  const base = Object.values(BLOCKLIST).flat();
  return unique(strict ? [...base, ...BLOCKLIST_STRICT_EXTRA] : base);
}
