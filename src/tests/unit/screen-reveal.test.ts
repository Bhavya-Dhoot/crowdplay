import { describe, expect, it } from "vitest";
import { allNarrator, leaderId, narrationLines, narrationSize, percentages, winnerOf } from "@/components/screen/reveal";
import type { PublicOption } from "@/lib/realtime/types";

const opt = (slot: "A" | "B" | "C", kind: PublicOption["kind"], id = `o_${slot}`): PublicOption => ({
  id,
  slot,
  kind,
  label: `Label ${slot}`,
  supporters: 0,
  credit: [],
  more: 0,
});
const OPTIONS = [opt("A", "crowd"), opt("B", "crowd"), opt("C", "wildcard")];

describe("percentages", () => {
  it("adds up to 100 with the largest remainder rule", () => {
    const p = percentages(["a", "b", "c"], { a: 1, b: 1, c: 1 });
    expect(p.a + p.b + p.c).toBe(100);
    expect(Object.values(p).sort()).toEqual([33, 33, 34]);
  });

  it("is all zero with no votes, and ignores junk counts", () => {
    expect(percentages(["a", "b", "c"], undefined)).toEqual({ a: 0, b: 0, c: 0 });
    expect(percentages(["a", "b", "c"], { a: 0, b: 0, c: 0 })).toEqual({ a: 0, b: 0, c: 0 });
    const p = percentages(["a", "b"], { a: -5, b: Number.NaN });
    expect(p).toEqual({ a: 0, b: 0 });
  });

  it("gives a clear winner its true share", () => {
    expect(percentages(["a", "b", "c"], { a: 15, b: 3, c: 2 })).toEqual({ a: 75, b: 15, c: 10 });
    expect(percentages(["a", "b", "c"], { a: 4 })).toEqual({ a: 100, b: 0, c: 0 });
  });
});

describe("narrationLines", () => {
  it("splits on sentence ends and keeps the punctuation", () => {
    expect(narrationLines("The vault opens. A cat walks out! Nobody moves?")).toEqual([
      "The vault opens.",
      "A cat walks out!",
      "Nobody moves?",
    ]);
  });

  it("keeps one line when there is no end mark, and handles blanks", () => {
    expect(narrationLines("no full stop here")).toEqual(["no full stop here"]);
    expect(narrationLines("   ")).toEqual([]);
    expect(narrationLines(null)).toEqual([]);
  });

  it("caps the number of lines by merging the tail", () => {
    const lines = narrationLines("One. Two. Three. Four. Five.", 3);
    expect(lines.length).toBe(3);
    expect(lines[2]).toBe("Three. Four. Five.");
  });

  it("does not split on an ellipsis inside a sentence start", () => {
    const lines = narrationLines("Then… silence. The door creaks.");
    expect(lines.join(" ")).toBe("Then… silence. The door creaks.");
  });
});

describe("narrationSize", () => {
  it("shrinks as the text grows", () => {
    expect(narrationSize("short")).toBeGreaterThan(narrationSize("x".repeat(250)));
    expect(narrationSize("x".repeat(250))).toBeGreaterThan(narrationSize("x".repeat(600)));
  });
});

describe("allNarrator / leaderId / winnerOf", () => {
  it("detects a round nobody wrote for", () => {
    expect(allNarrator([opt("A", "narrator"), opt("B", "narrator"), opt("C", "narrator")])).toBe(true);
    expect(allNarrator(OPTIONS)).toBe(false);
    expect(allNarrator(undefined)).toBe(false);
    expect(allNarrator([])).toBe(false);
  });

  it("finds the live leader and stays null before the first vote", () => {
    expect(leaderId(OPTIONS, { o_A: 2, o_B: 5, o_C: 1 })).toBe("o_B");
    expect(leaderId(OPTIONS, { o_A: 3, o_B: 3 })).toBe("o_A");
    expect(leaderId(OPTIONS, {})).toBeNull();
    expect(leaderId(undefined, undefined)).toBeNull();
  });

  it("resolves the winning option from the outcome", () => {
    const outcome = { optionId: "o_C", narration: null, credit: [], more: 0 };
    expect(winnerOf({ options: OPTIONS, outcome })?.slot).toBe("C");
    expect(winnerOf({ options: OPTIONS, outcome: undefined })).toBeNull();
    expect(winnerOf({ options: OPTIONS, outcome: { ...outcome, optionId: "missing" } })).toBeNull();
  });
});
