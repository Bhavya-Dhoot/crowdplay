import { describe, expect, it } from "vitest";
import { BLOCKLIST, BLOCKLIST_STRICT_EXTRA, blocklistWords } from "@/lib/ingest/blocklist";
import { checkText, isClean, normalizeText } from "@/lib/ingest/filter";

const blocked = (text: string, strict = false) => {
  const r = checkText(text, { strict });
  return !r.ok && r.reason === "BLOCKED";
};
const clean = (text: string, strict = true) => checkText(text, { strict }).ok;

describe("filter: normalising and length", () => {
  it("trims and collapses whitespace, tabs and newlines", () => {
    expect(checkText("  the   vault\t\nis   open  ")).toEqual({ ok: true, text: "the vault is open" });
  });

  it("strips zero-width characters", () => {
    expect(normalizeText("a​b﻿c")).toBe("abc");
  });

  it("EMPTY for blank input", () => {
    expect(checkText("")).toEqual({ ok: false, reason: "EMPTY" });
    expect(checkText("   \n\t ")).toEqual({ ok: false, reason: "EMPTY" });
    expect(checkText("​​")).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("TOO_LONG past 140 characters by default, ok at exactly 140", () => {
    const at140 = `${"abcdefghij ".repeat(12)}abcdefgh`;
    expect(at140.length).toBe(140);
    expect(checkText(at140).ok).toBe(true);
    expect(checkText(`${at140}i`)).toEqual({ ok: false, reason: "TOO_LONG" });
  });

  it("counts characters, not UTF-16 units (an emoji is one)", () => {
    const emojis = Array.from({ length: 70 }, (_, i) => String.fromCodePoint(0x1f600 + i)).join(""); // 70 characters, 140 UTF-16 units
    expect(checkText(emojis, { maxLen: 70 }).ok).toBe(true);
    expect(checkText(`${emojis}a`, { maxLen: 70 })).toEqual({ ok: false, reason: "TOO_LONG" });
  });

  it("length is checked before content", () => {
    expect(checkText("fuck ".repeat(40))).toEqual({ ok: false, reason: "TOO_LONG" });
  });

  it("honours maxLen (display names use 20)", () => {
    expect(checkText("Brave Otter", { maxLen: 20 }).ok).toBe(true);
    expect(checkText("A very long display name indeed", { maxLen: 20 })).toEqual({ ok: false, reason: "TOO_LONG" });
  });
});

describe("filter: blocklist", () => {
  it.each([
    "fuck this",
    "what the FUCK",
    "you are a shit",
    "such a bitch",
    "pure bullshit",
    "dickhead",
    "nigger",
    "faggot",
    "kill yourself",
    "kys",
  ])("blocks English: %s", (t) => expect(blocked(t)).toBe(true));

  it.each([
    "madarchod",
    "tu chutiya hai",
    "BHENCHOD",
    "bhosdike",
    "मादरचोद",
    "ये चूतिया है",
    "puta madre",
    "qué mierda",
    "eres un pendejo",
    "coño",
    "putain de merde",
    "quel connard",
    "du bist ein Arschloch",
    "so eine Scheiße",
    "scheisse",
    "seu filho da puta",
    "que porra",
    "vai tomar no cu e foda-se",
  ])("blocks other languages: %s", (t) => expect(blocked(t)).toBe(true));

  it("matches plurals and obvious inflections", () => {
    expect(blocked("those bitches")).toBe(true);
    expect(blocked("what a shithead")).toBe(true);
    expect(blocked("fucking hell")).toBe(true);
  });

  it("every entry blocks itself", () => {
    const missed = blocklistWords(true).filter((w) => !blocked(w, true));
    expect(missed).toEqual([]);
  });

  it("exports per-language lists for the Nexconn profanity sync", () => {
    expect(Object.keys(BLOCKLIST).sort()).toEqual(["de", "en", "es", "fr", "hi", "pt", "slurs"]);
    expect(blocklistWords(false)).toContain("fuck");
    expect(blocklistWords(false)).not.toContain("damn");
    expect(blocklistWords(true)).toEqual(expect.arrayContaining(["damn", ...BLOCKLIST_STRICT_EXTRA.slice(0, 3)]));
    expect(new Set(blocklistWords(true)).size).toBe(blocklistWords(true).length);
  });
});

describe("filter: evasion (leetspeak, diacritics, separators, stretching)", () => {
  it.each([
    "sh1t",
    "5hit",
    "$hit",
    "sh!t",
    "b!tch",
    "a55h0le",
    "f4ggot",
    "fuuuuuck",
    "shiiit",
    "f.u.c.k",
    "f u c k",
    "f-u-c-k",
    "f*ck",
    "sh*t",
    "f**k",
    "b*tch",
    "sh#t",
    "ｓｈｉｔ",
    "shít",
    "fùck",
    "fuсk", // Cyrillic с
    "sh1t!",
    "(sh1t)",
    "1d10t",
  ])("blocks %s", (t) => expect(blocked(t, t === "1d10t")).toBe(true));

  it("folds diacritics for other languages", () => {
    expect(blocked("CABRÓN")).toBe(true);
    expect(blocked("enculé")).toBe(true);
    expect(blocked("Arschlöcher")).toBe(true);
    expect(blocked("cuzão")).toBe(true);
  });

  it("keeps ñ distinct so coño blocks but cono (a cone) does not", () => {
    expect(blocked("coño")).toBe(true);
    expect(clean("el cono de helado")).toBe(true);
  });

  it("symbol lookalikes at the end of a word do not defeat the match", () => {
    expect(blocked("what a fuck!")).toBe(true);
    expect(blocked("shit!!")).toBe(true);
  });
});

describe("filter: no Scunthorpe false positives", () => {
  it.each([
    "class",
    "assistant",
    "Scunthorpe",
    "cocktail",
    "assassin",
    "bass guitar",
    "passion for glass",
    "Essex",
    "Sussex and Middlesex",
    "Dickens",
    "peacock",
    "Hancock",
    "cockpit",
    "cucumber",
    "Cumberland",
    "document",
    "circumstance",
    "grape juice",
    "therapist",
    "Penistone",
    "shiitake mushrooms",
    "analysis of the titan",
    "hello there",
    "the mass of the mission",
    "A button on the butte",
    "I assume the harbour is safe",
    "a cocker spaniel",
    "classic",
    "pass the compass",
    "Rapeseed oil",
  ])("keeps clean even in strict mode: %s", (t) => expect(clean(t, true)).toBe(true));

  it("leetspeak mapping leaves plain numbers alone", () => {
    expect(clean("Room 455 is locked", true)).toBe(true);
    expect(clean("Open door 3 at 12 o'clock", true)).toBe(true);
    expect(clean("Costs $50 or 5 coins", true)).toBe(true);
  });

  it("leetspeak words that spell innocent words stay clean", () => {
    expect(clean("h3ll0 th3r3", true)).toBe(true);
    expect(clean("m1ss10n 1mp0ss1bl3", true)).toBe(true);
  });
});

describe("filter: strict mode", () => {
  it("strict adds mild words, non-strict lets them through", () => {
    for (const w of ["damn it", "what the hell", "this is crap", "you idiot", "stupid plan", "piss off", "kick his ass"]) {
      expect(blocked(w, true)).toBe(true);
      expect(blocked(w, false)).toBe(false);
    }
  });

  it("strong words are blocked either way", () => {
    expect(blocked("fuck", true)).toBe(true);
    expect(blocked("fuck", false)).toBe(true);
  });

  it("strict mode keeps ordinary story language", () => {
    expect(clean("A bloody footprint leads to the cellar door", true)).toBe(true);
    expect(clean("The vampire bites the guard and escapes", true)).toBe(true);
    expect(clean("Dig a tunnel under the bank", true)).toBe(true);
  });
});

describe("filter: contact info", () => {
  it.each([
    "check out https://example.com/win",
    "go to www.free-stuff.net now",
    "visit bit.ly/abc123",
    "my site is coolgame.io",
    "join discord.gg/xyz",
    "example [dot] com",
    "mail me at bob@example.com",
    "bob (at) example.com",
    "call me on 9876543210",
    "call +91 98765 43210",
    "phone: (555) 123-4567",
    "555-1234",
  ])("blocks %s", (t) => expect(blocked(t)).toBe(true));

  it.each([
    "The heist is at 3 am with 12 guards",
    "Room 42 holds 5 keys",
    "In 1999, 2000 and 2001 something happened",
    "Mr. Smith meets Dr. Jones",
    "The end. Then silence",
    "e.g. a map or a key",
    "Plan B: use the vent",
  ])("keeps clean: %s", (t) => expect(clean(t)).toBe(true));
});

describe("filter: spam", () => {
  it.each(["aaaaaaaaaa", "!!!!!!!!!", "lollollollollol", "hahahahahahaha", "abababababab", "😂😂😂😂😂😂😂", "ok ok ok ok ok ok", "zzzzzz"])(
    "blocks repeated-character spam: %s",
    (t) => expect(blocked(t)).toBe(true),
  );

  it("blocks very low character variety in long text", () => {
    expect(blocked("abcabcabcabcabcabcabc")).toBe(true);
  });

  it.each(["Mwahahaha, the plan works", "aaah!", "Wooooo", "Hmmmm, suspicious", "ok go go go", "The cat sat on the mat"])(
    "keeps ordinary text: %s",
    (t) => expect(clean(t)).toBe(true),
  );
});

describe("filter: display names", () => {
  const name = (n: string) => checkText(n, { strict: true, maxLen: 20 });

  it("accepts normal names and collapses spacing", () => {
    expect(name("  Brave   Otter ")).toEqual({ ok: true, text: "Brave Otter" });
    expect(name("Priya")).toEqual({ ok: true, text: "Priya" });
    expect(name("José 🎲")).toEqual({ ok: true, text: "José 🎲" });
    expect(name("Ananya Sharma").ok).toBe(true);
  });

  it("rejects profanity, links and contact details in names", () => {
    expect(name("shithead")).toEqual({ ok: false, reason: "BLOCKED" });
    expect(name("sh1thead")).toEqual({ ok: false, reason: "BLOCKED" });
    expect(name("visit my.site.com")).toEqual({ ok: false, reason: "BLOCKED" });
    expect(name("me@mail.com")).toEqual({ ok: false, reason: "BLOCKED" });
    expect(name("9876543210")).toEqual({ ok: false, reason: "BLOCKED" });
  });

  it("rejects names that are too long", () => {
    expect(name("A name that is much too long")).toEqual({ ok: false, reason: "TOO_LONG" });
  });
});

describe("isClean", () => {
  it("defaults to strict and has no length cap in practice", () => {
    expect(isClean("a perfectly fine option label")).toBe(true);
    expect(isClean("damn")).toBe(false);
    expect(isClean("damn", false)).toBe(true);
    expect(isClean("fuck", false)).toBe(false);
    expect(isClean(`${"word ".repeat(100)}end`)).toBe(true);
  });
});
