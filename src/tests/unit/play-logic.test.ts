import { describe, expect, it } from "vitest";
import {
  bodyKey,
  charsLeft,
  coachStep,
  composerLock,
  dockHeight,
  dockKey,
  groupByShow,
  insertChip,
  isLiveCanon,
  nearBottom,
  optionAria,
  optionFlags,
  pickLine,
  receiptCounts,
  receiptKey,
  shortLang,
  starterChips,
  supportLine,
  topCanonMakers,
  translateView,
  resultChips,
  votePercent,
  voteShare,
} from "@/components/play/logic";
import { STORM_NUDGES } from "@/lib/copy";
import { PRESETS } from "@/lib/presets";
import type { Phase, PublicOption, PublicState } from "@/lib/realtime/types";

const opt = (over: Partial<PublicOption> = {}): PublicOption => ({
  id: "o1",
  slot: "A",
  kind: "crowd",
  label: "Pick the lock",
  supporters: 23,
  credit: [],
  more: 0,
  ...over,
});

describe("bodyKey / dockHeight", () => {
  it("keeps STORM and DISTILL in one body so the feed does not remount", () => {
    expect(bodyKey("STORM")).toBe("storm");
    expect(bodyKey("DISTILL")).toBe("storm");
  });
  it("sends FINALE and ENDED to the finale body", () => {
    expect(bodyKey("FINALE")).toBe("finale");
    expect(bodyKey("ENDED")).toBe("finale");
  });
  it("covers every phase", () => {
    const phases: Phase[] = ["LOBBY", "PROMPT", "STORM", "DISTILL", "VOTE", "REVEAL", "FINALE", "ENDED"];
    for (const p of phases) {
      expect(bodyKey(p)).toBeTruthy();
      expect(dockKey(p)).toBeTruthy();
      expect(dockHeight(p)).toBeGreaterThanOrEqual(0);
    }
  });
  it("only the composer, distill and finale phases have a dock slot; the rest leave the bar to the cheers", () => {
    expect(dockKey("PROMPT")).toBe("composer");
    expect(dockKey("STORM")).toBe("composer");
    expect(dockKey("DISTILL")).toBe("distill");
    expect(dockKey("FINALE")).toBe("finale");
    expect(dockKey("ENDED")).toBe("finale");
    for (const p of ["LOBBY", "VOTE", "REVEAL"] as Phase[]) {
      expect(dockKey(p)).toBe("none");
      expect(dockHeight(p)).toBe(0);
    }
  });
  it("gives the composer phases the same dock height so they never shift", () => {
    expect(dockHeight("PROMPT")).toBe(dockHeight("STORM"));
    expect(dockHeight("STORM")).toBe(dockHeight("DISTILL"));
  });
});

describe("starter chips", () => {
  it("uses the preset's starters", () => {
    expect(starterChips("heist")).toEqual(PRESETS.heist.starters);
  });
  it("falls back to the generic nudges", () => {
    expect(starterChips(undefined)).toEqual([...STORM_NUDGES]);
  });
  it("inserts into an empty draft, appends otherwise", () => {
    expect(insertChip("", "a betrayal")).toBe("a betrayal");
    expect(insertChip("the cat", "a betrayal")).toBe("the cat a betrayal");
    expect(insertChip("the cat   ", "a betrayal")).toBe("the cat a betrayal");
  });
  it("never overflows the 140-character limit", () => {
    const long = "x".repeat(135);
    expect(insertChip(long, "a betrayal")).toBe(long);
    expect(insertChip("", "y".repeat(200)).length).toBe(140);
  });
  it("counts characters left", () => {
    expect(charsLeft("hello")).toBe(135);
    expect(charsLeft("x".repeat(140))).toBe(0);
  });
});

describe("composerLock", () => {
  const ok = { phase: "STORM" as Phase, paused: false, connection: "connected" as const, banned: false, muted: false };
  it("is open in a live STORM", () => {
    expect(composerLock(ok)).toBeNull();
  });
  it("says Get ready outside STORM", () => {
    expect(composerLock({ ...ok, phase: "PROMPT" })).toBe("Get ready…");
  });
  it("says Reconnecting when the transport is down, even before STORM", () => {
    expect(composerLock({ ...ok, connection: "disconnected" })).toBe("Reconnecting…");
    expect(composerLock({ ...ok, phase: "PROMPT", connection: "disconnected" })).toBe("Reconnecting…");
  });
  it("does not lock while the transport is still connecting", () => {
    expect(composerLock({ ...ok, connection: "connecting" })).toBeNull();
  });
  it("explains a mute and a ban in friendly words", () => {
    expect(composerLock({ ...ok, muted: true })).toMatch(/muted/i);
    expect(composerLock({ ...ok, banned: true })).toBe("You've been removed from this show.");
  });
  it("locks while paused", () => {
    expect(composerLock({ ...ok, paused: true })).not.toBeNull();
  });
});

describe("votes", () => {
  const tally = { o1: 3, o2: 1, o3: 0 };
  it("computes shares and whole percents", () => {
    expect(voteShare(tally, 4, "o1")).toBe(0.75);
    expect(votePercent(tally, 4, "o1")).toBe(75);
    expect(votePercent(tally, 4, "o2")).toBe(25);
    expect(votePercent(tally, 4, "o3")).toBe(0);
  });
  it("is zero without votes or data", () => {
    expect(votePercent(undefined, undefined, "o1")).toBe(0);
    expect(votePercent({ o1: 2 }, 0, "o1")).toBe(0);
    expect(votePercent({}, 5, "o9")).toBe(0);
  });
  it("never exceeds 100 percent, even with a stale total", () => {
    expect(votePercent({ o1: 9 }, 3, "o1")).toBe(100);
  });
});

describe("option copy", () => {
  it("flags kinds", () => {
    expect(optionFlags({ kind: "wildcard" })).toEqual({ narrator: false, wildcard: true, boosted: false });
    expect(optionFlags({ kind: "narrator", boosted: true })).toEqual({ narrator: true, wildcard: false, boosted: true });
  });
  it("writes the supporters line, singular and plural, none for the narrator", () => {
    expect(supportLine(opt({ supporters: 23 }))).toBe("from 23 ideas");
    expect(supportLine(opt({ supporters: 1 }))).toBe("from 1 idea");
    expect(supportLine(opt({ supporters: 0 }))).toBeNull();
    expect(supportLine(opt({ kind: "narrator", supporters: 5 }))).toBeNull();
  });
  it("builds a full spoken label", () => {
    const text = optionAria(opt({ kind: "wildcard", slot: "C" }), "Fly away", 40, true, true);
    expect(text).toContain("Option C");
    expect(text).toContain("Wildcard");
    expect(text).toContain("40 percent");
    expect(text).toContain("from 23 ideas");
    expect(text).toContain("Your idea is on this option");
    expect(text).toContain("Selected");
  });
});

describe("resultChips (the personal line under the winner)", () => {
  const tally = { w: 12, x: 5, y: 3 };
  const base = { winnerId: "w", votedId: null as string | null, mineIds: [] as string[], tally, total: 20 };
  it("says nothing when nothing applies or there is no winner yet", () => {
    expect(resultChips(base)).toEqual([]);
    expect(resultChips({ ...base, winnerId: undefined, votedId: "w" })).toEqual([]);
  });
  it("says 'You called it' when my vote won", () => {
    expect(resultChips({ ...base, votedId: "w" })).toEqual([{ kind: "called", text: "You called it" }]);
  });
  it("says 'Your idea got N%' when my idea was on the ballot and lost, using my best option", () => {
    expect(resultChips({ ...base, mineIds: ["x"] })).toEqual([{ kind: "mine", text: "Your idea got 25%" }]);
    expect(resultChips({ ...base, mineIds: ["y", "x"] })).toEqual([{ kind: "mine", text: "Your idea got 25%" }]);
  });
  it("combines my vote winning with my idea losing", () => {
    expect(resultChips({ ...base, votedId: "w", mineIds: ["y"] }).map((c) => c.kind)).toEqual(["called", "mine"]);
  });
  it("celebrates my idea winning, once", () => {
    expect(resultChips({ ...base, mineIds: ["w"] })).toEqual([{ kind: "canon", text: "Your idea is canon" }]);
    expect(resultChips({ ...base, mineIds: ["w", "x"], votedId: "x" }).map((c) => c.kind)).toEqual(["canon"]);
  });
  it("does not divide by zero with no votes", () => {
    expect(resultChips({ winnerId: "w", votedId: null, mineIds: ["x"], tally: undefined, total: 0 })).toEqual([{ kind: "mine", text: "Your idea got 0%" }]);
  });
});

describe("feed scrolling", () => {
  it("detects the bottom within a slack", () => {
    expect(nearBottom(900, 100, 1000)).toBe(true);
    expect(nearBottom(860, 100, 1000)).toBe(true);
    expect(nearBottom(500, 100, 1000)).toBe(false);
  });
  it("cycles lines forever, also backwards", () => {
    expect(pickLine(["a", "b", "c"], 0)).toBe("a");
    expect(pickLine(["a", "b", "c"], 4)).toBe("b");
    expect(pickLine(["a", "b", "c"], -1)).toBe("c");
  });
});

describe("coachStep", () => {
  it("walks type -> watch -> vote", () => {
    expect(coachStep({ phase: "STORM", ideasThisRound: 0, voted: false })).toBe("type");
    expect(coachStep({ phase: "STORM", ideasThisRound: 1, voted: false })).toBe("watch");
    expect(coachStep({ phase: "DISTILL", ideasThisRound: 1, voted: false })).toBe("watch");
    expect(coachStep({ phase: "VOTE", ideasThisRound: 1, voted: false })).toBe("vote");
  });
  it("is quiet once I voted and in the other phases", () => {
    expect(coachStep({ phase: "VOTE", ideasThisRound: 1, voted: true })).toBeNull();
    for (const p of ["LOBBY", "PROMPT", "REVEAL", "FINALE", "ENDED"] as Phase[]) {
      expect(coachStep({ phase: p, ideasThisRound: 0, voted: false })).toBeNull();
    }
  });
});

describe("receipts", () => {
  const canon = { type: "CANON" as const, showId: "s1", roundNo: 2 };
  it("only celebrates a CANON receipt for the round on screen", () => {
    expect(isLiveCanon(canon, { showId: "s1", roundNo: 2 })).toBe(true);
    expect(isLiveCanon(canon, { showId: "s1", roundNo: 3 })).toBe(false);
    expect(isLiveCanon(canon, { showId: "s2", roundNo: 2 })).toBe(false);
    expect(isLiveCanon({ ...canon, type: "BALLOT" }, { showId: "s1", roundNo: 2 })).toBe(false);
    expect(isLiveCanon(canon, null)).toBe(false);
  });
  it("keys one receipt per type, show and round", () => {
    expect(receiptKey(canon)).toBe("CANON:s1:2");
    expect(receiptKey({ ...canon, type: "BALLOT" })).toBe("BALLOT:s1:2");
  });
  it("counts per show and ignores duplicates", () => {
    const rs = [
      { type: "BALLOT" as const, showId: "s1", roundNo: 1 },
      { type: "BALLOT" as const, showId: "s1", roundNo: 1 },
      { type: "CANON" as const, showId: "s1", roundNo: 1 },
      { type: "BALLOT" as const, showId: "s1", roundNo: 2 },
      { type: "CANON" as const, showId: "s2", roundNo: 1 },
    ];
    expect(receiptCounts(rs, "s1")).toEqual({ ballots: 2, canon: 1 });
    expect(receiptCounts(rs, "s2")).toEqual({ ballots: 0, canon: 1 });
    expect(receiptCounts(rs, "nope")).toEqual({ ballots: 0, canon: 0 });
  });
  it("groups receipts by show in first-seen order", () => {
    const g = groupByShow([{ showId: "b", n: 1 }, { showId: "a", n: 2 }, { showId: "b", n: 3 }]);
    expect(g.map((x) => x.showId)).toEqual(["b", "a"]);
    expect(g[0].items.map((i) => i.n)).toEqual([1, 3]);
  });
});

describe("canon makers", () => {
  it("returns the top five by count, stable on ties", () => {
    const makers = [
      { name: "a", bot: false, count: 1 },
      { name: "b", bot: false, count: 3 },
      { name: "c", bot: true, count: 3 },
      { name: "d", bot: false, count: 2 },
      { name: "e", bot: false, count: 1 },
      { name: "f", bot: false, count: 1 },
    ];
    expect(topCanonMakers(makers).map((m) => m.name)).toEqual(["b", "c", "d", "a", "e"]);
  });
});

describe("language", () => {
  it("shortens locales", () => {
    expect(shortLang("hi-IN")).toBe("hi");
    expect(shortLang("EN")).toBe("en");
    expect(shortLang("")).toBe("en");
    expect(shortLang(null)).toBe("en");
  });

  const state = {
    prompt: { title: "The Vault", text: "Open it." },
    options: [opt()],
    outcome: { optionId: "o1", narration: "It opened.", credit: [], more: 0 },
    i18n: { hi: { prompt: { title: "तिजोरी", text: "खोलो।" }, options: { o1: "ताला खोलो" }, narration: "यह खुल गई।" } },
  } as unknown as PublicState;

  it("uses the translation when one exists for my language", () => {
    const t = translateView(state, "hi", false);
    expect(t.available).toBe(true);
    expect(t.prompt?.title).toBe("तिजोरी");
    expect(t.label(state.options![0])).toBe("ताला खोलो");
    expect(t.narration).toBe("यह खुल गई।");
  });
  it("shows the original when asked", () => {
    const t = translateView(state, "hi", true);
    expect(t.available).toBe(true);
    expect(t.prompt?.title).toBe("The Vault");
    expect(t.label(state.options![0])).toBe("Pick the lock");
    expect(t.narration).toBe("It opened.");
  });
  it("changes nothing without a bundle (flag off)", () => {
    const t = translateView(state, "fr", false);
    expect(t.available).toBe(false);
    expect(t.prompt?.title).toBe("The Vault");
    expect(t.narration).toBe("It opened.");
    const bare = translateView({ ...state, i18n: undefined } as PublicState, "hi", false);
    expect(bare.available).toBe(false);
  });
  it("falls back per field when a bundle is partial", () => {
    const partial = { ...state, i18n: { hi: { narration: "यह खुल गई।" } } } as unknown as PublicState;
    const t = translateView(partial, "hi", false);
    expect(t.prompt?.title).toBe("The Vault");
    expect(t.label(state.options![0])).toBe("Pick the lock");
    expect(t.narration).toBe("यह खुल गई।");
  });
});
