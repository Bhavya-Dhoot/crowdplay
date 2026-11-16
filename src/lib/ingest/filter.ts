// Text filter for ideas, display names, option labels and narration.
// Isomorphic (no Node imports): the browser uses it to pre-filter feeds too.
import { blocklistWords } from "./blocklist";

export type FilterReason = "EMPTY" | "TOO_LONG" | "BLOCKED";
export type FilterResult = { ok: true; text: string } | { ok: false; reason: FilterReason };
export type FilterOpts = { strict?: boolean; maxLen?: number };

// Built with `new RegExp` so TypeScript's regex checker does not gate Unicode property escapes
// or lookbehind on the project's ES target.
const re = (src: string, flags = "u") => new RegExp(src, flags);

const INVISIBLE = re("[\\u200B\\u2060\\uFEFF\\u00AD\\u202A-\\u202E\\u2066-\\u2069]", "gu");
const WHITESPACE_RUN = re("[\\p{Cc}\\s]+", "gu");

/** Trim, drop invisible characters, collapse whitespace. This is the text that gets stored/shown. */
export function normalizeText(raw: string): string {
  return raw.normalize("NFC").replace(INVISIBLE, "").replace(WHITESPACE_RUN, " ").trim();
}

const countChars = (s: string): number => [...s].length;

// ---------- Blocklist matching ----------

const EXTRA_LATIN: Record<string, string> = { "ß": "ss", "ø": "o", "æ": "ae", "œ": "oe", "ł": "l", "đ": "d", "ı": "i", "þ": "th" };
// Cyrillic / Greek letters that look like Latin ones (used to dodge word lists).
const HOMOGLYPH: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ј": "j", "ѕ": "s", "һ": "h", "ԁ": "d",
  "α": "a", "ε": "e", "ι": "i", "ο": "o", "ρ": "p", "ν": "v",
};
const LATIN_MARKS = re("(\\p{Script=Latin})\\p{M}+", "gu");
const FOLD_STRIP = re("[\\u200B-\\u200D\\u2060\\uFEFF\\u00AD]", "gu");
const FOLD_EXTRA = re("[ßøæœłđıþ]", "gu");
const FOLD_HOMOGLYPH = re("[аеорсхуіјѕһԁαειορν]", "gu");

/** Lowercase, strip diacritics (keeps ñ and non-Latin scripts), fold lookalike letters. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/ñ/g, "ñ")
    .replace(LATIN_MARKS, "$1")
    .replace(FOLD_EXTRA, (m) => EXTRA_LATIN[m] ?? m)
    .replace(FOLD_HOMOGLYPH, (m) => HOMOGLYPH[m] ?? m)
    .replace(FOLD_STRIP, "");
}

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "!": "i", "|": "l", "+": "t", "€": "e", "¡": "i",
};
const LEET_L: Record<string, string> = { ...LEET, "1": "l", "!": "l", "|": "i" };
const HAS_LETTER = re("\\p{L}");
const TOKEN_TAIL = re("^(.*?)([!?.,;:|+*)\\]}\"'’]*)$", "su");

/** Map digit/symbol lookalikes to letters, token by token. Pure-number tokens ("455") are left alone. */
function leet(s: string, map: Record<string, string>): string {
  return s.replace(/\S+/g, (tok) => {
    if (!HAS_LETTER.test(tok)) return tok;
    const m = TOKEN_TAIL.exec(tok);
    const core = m ? m[1] : tok;
    const tail = m ? m[2] : "";
    let out = "";
    for (const ch of core) out += map[ch] ?? ch;
    return out + tail;
  });
}

const INNER_SEP = re("(?<=\\p{L})[._-]+(?=\\p{L})", "gu");
const SINGLE_RUN = re("(?<![\\p{L}\\p{M}])(?:\\p{L}[\\s._-]+){2,}\\p{L}(?![\\p{L}\\p{M}])", "gu");
const SEP_CHARS = /[\s._-]+/g;

function variants(folded: string): string[] {
  const a = leet(folded, LEET);
  const out = new Set<string>([folded, a]);
  if (/[1!|]/.test(folded)) out.add(leet(folded, LEET_L));
  out.add(a.replace(INNER_SEP, ""));
  out.add(a.replace(SINGLE_RUN, (m) => m.replace(SEP_CHARS, "")));
  return [...out];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ASCII_LETTER = /^[a-z]$/;

/** "fuck" -> f+u+c+k+ ; "ass" -> a+s{2,} (tolerates stretched letters, never matches "as"). */
function entryPattern(entry: string): string {
  return fold(entry)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) =>
      word.replace(re("(.)\\1*", "gsu"), (run, ch: string) =>
        ASCII_LETTER.test(ch) ? (run.length === 1 ? `${ch}+` : `${ch}{${run.length},}`) : escapeRe(run),
      ),
    )
    .join("[\\s._-]*");
}

type Matchers = { regex: RegExp; byLength: Map<number, string[]> };
const cache = new Map<boolean, Matchers>();

function matchers(strict: boolean): Matchers {
  const hit = cache.get(strict);
  if (hit) return hit;
  const words = blocklistWords(strict);
  const alternatives = words.map(entryPattern);
  // Whole words only; plural -s/-es allowed. Lookarounds instead of \b so non-Latin scripts work.
  const regex = re(`(?<![\\p{L}\\p{M}])(?:${alternatives.join("|")})(?:s|es)?(?![\\p{L}\\p{M}])`, "u");
  const byLength = new Map<number, string[]>();
  for (const w of words) {
    const flat = fold(w).replace(/[\s-]+/g, "");
    if (!/^[a-z]+$/.test(flat)) continue;
    const bucket = byLength.get(flat.length) ?? [];
    bucket.push(flat);
    byLength.set(flat.length, bucket);
  }
  const built = { regex, byLength };
  cache.set(strict, built);
  return built;
}

const WILDCARDS = "*#%&^~";
const EDGE_TRIM = re("^[^\\p{L}\\p{N}*#%&^~]+|[^\\p{L}\\p{N}*#%&^~]+$", "gu");

/** "f*ck", "sh#t": a token with censor characters inside matches a blocklist word of the same length. */
function wildcardHit(text: string, byLength: Map<number, string[]>): boolean {
  for (const raw of text.split(/\s+/)) {
    const tok = raw.replace(EDGE_TRIM, "");
    if (tok.length < 3 || tok.length > 24) continue;
    let literal = 0;
    let wild = 0;
    for (const ch of tok) {
      if (WILDCARDS.includes(ch)) wild++;
      else literal++;
    }
    if (wild === 0 || literal < 2 || !/^[a-z*#%&^~]+$/.test(tok)) continue;
    for (const candidate of tok.endsWith("s") && tok.length > 3 ? [tok, tok.slice(0, -1)] : [tok]) {
      for (const word of byLength.get(candidate.length) ?? []) {
        let match = true;
        for (let i = 0; i < word.length; i++) {
          const c = candidate[i];
          if (c !== word[i] && !WILDCARDS.includes(c)) {
            match = false;
            break;
          }
        }
        if (match) return true;
      }
    }
  }
  return false;
}

function hitsBlocklist(text: string, strict: boolean): boolean {
  const { regex, byLength } = matchers(strict);
  const folded = fold(text);
  const vs = variants(folded);
  return vs.some((v) => regex.test(v)) || wildcardHit(leet(folded, LEET), byLength);
}

// ---------- Contact info and spam ----------

const URL_SCHEME = /(?:https?:\/\/|ftp:\/\/|www\.)\S+/i;
const URL_DOMAIN =
  /\b[a-z0-9][a-z0-9-]+\.(?:com|net|org|io|gg|xyz|app|dev|ai|info|biz|link|click|top|shop|site|online|store|live)\b/i;
const URL_SHORTENER = /\b(?:bit\.ly|t\.co|goo\.gl|tinyurl\.com|discord\.gg)\b/i;
const URL_DOT_WORD = /\b[a-z0-9-]{2,}\s*(?:\[dot\]|\(dot\)|\{dot\})\s*[a-z]{2,}/i;
const EMAIL = /[a-z0-9._%+-]+\s?(?:@|\[at\]|\(at\))\s?[a-z0-9-]+(?:\.|\[dot\]|\(dot\))[a-z]{2,}/i;
// 7+ digits, optionally broken up by spaces/dashes/dots/brackets: phone numbers (and long digit strings).
const PHONE = /(?:\+?\(?\d[\s().-]{0,2}){7,}/;

function hasContactInfo(plain: string): boolean {
  return URL_SCHEME.test(plain) || URL_DOMAIN.test(plain) || URL_SHORTENER.test(plain) || URL_DOT_WORD.test(plain) || EMAIL.test(plain) || PHONE.test(plain);
}

const SAME_CHAR_RUN = re("(\\S)\\1{5,}", "iu");
const SHORT_CHUNK_RUN = re("(\\S{2,4})\\1{3,}", "iu");

function isSpam(text: string): boolean {
  if (SAME_CHAR_RUN.test(text)) return true;
  const chunk = SHORT_CHUNK_RUN.exec(text);
  if (chunk && chunk[0].length >= 10) return true;
  const alnum = [...text.toLowerCase()].filter((c) => re("[\\p{L}\\p{N}]").test(c));
  const distinct = new Set(alnum).size;
  return (alnum.length >= 10 && distinct <= 2) || (alnum.length >= 12 && distinct <= 3);
}

// ---------- Public API ----------

/** Normalise + check user text (ideas, names, option labels, narration). */
export function checkText(text: string, opts: FilterOpts = {}): FilterResult {
  const maxLen = opts.maxLen ?? 140;
  const clean = normalizeText(text);
  if (clean === "") return { ok: false, reason: "EMPTY" };
  if (countChars(clean) > maxLen) return { ok: false, reason: "TOO_LONG" };
  const plain = clean.normalize("NFKC").toLowerCase();
  if (hasContactInfo(plain) || isSpam(clean) || hitsBlocklist(clean, opts.strict ?? false)) {
    return { ok: false, reason: "BLOCKED" };
  }
  return { ok: true, text: clean };
}

export function isClean(text: string, strict = true): boolean {
  return checkText(text, { strict, maxLen: 10_000 }).ok;
}
