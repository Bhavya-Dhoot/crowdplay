import { describe, expect, it } from "vitest";
import { allNarrator, labelEm, leaderId, narrationPx, percentages, winnerOf } from "@/components/screen/reveal";
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

describe("narrationPx", () => {
  it("is 44 px for a couple of sentences and shrinks as the text grows", () => {
    expect(narrationPx("short")).toBe(44);
    expect(narrationPx("x".repeat(250))).toBeLessThan(narrationPx("x".repeat(100)));
    expect(narrationPx("x".repeat(400))).toBeLessThan(narrationPx("x".repeat(250)));
  });

  it("never goes below 28 px, even for the longest narration the model may write", () => {
    expect(narrationPx("x".repeat(700))).toBe(28);
    expect(narrationPx(null)).toBe(44);
  });
});

describe("labelEm", () => {
  it("sizes a ballot label down as it gets longer", () => {
    expect(labelEm("The alarm plays a lullaby")).toBeGreaterThan(labelEm("We tunnel into the wrong bank and open a cafe"));
    expect(labelEm("We tunnel into the wrong bank and open a cafe")).toBeGreaterThan(labelEm("x".repeat(70)));
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
