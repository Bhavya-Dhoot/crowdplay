import { describe, expect, it } from "vitest";
import { arrowPath, boxPath, checkPath, flatText, hash32, loopPath, ringPath, roundLoopPath, seeded, tiltOf, underlinePath } from "@/components/ui/doodle";
import { paperCardClass } from "@/components/ui/PaperCard";

describe("seeded hand-drawn geometry", () => {
  it("gives the same numbers for the same key, and different ones for another key", () => {
    const a = seeded("idea-1");
    const b = seeded("idea-1");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seeded("idea-1")()).not.toBe(seeded("idea-2")());
    expect(hash32("x")).toBe(hash32("x"));
  });

  it("keeps a note's tilt inside the range, one decimal, and stable per id", () => {
    for (const id of ["a", "b", "idea-42", "7", "ünï"]) {
      const t = tiltOf(id, 2.5);
      expect(Math.abs(t)).toBeLessThanOrEqual(2.5);
      expect(t).toBe(Math.round(t * 10) / 10);
      expect(tiltOf(id, 2.5)).toBe(t);
    }
    const spread = new Set(Array.from({ length: 40 }, (_, i) => tiltOf(`n${i}`)));
    expect(spread.size).toBeGreaterThan(10);
  });

  it("draws every path the same way twice (SSR and hydration agree) and from one stroke", () => {
    const draw = [
      () => loopPath(120, 60, "k"),
      () => roundLoopPath(300, 120, "k"),
      () => ringPath(56, 3, "k"),
      () => boxPath(80, 17, "k"),
      () => checkPath("k"),
      () => underlinePath(100, 10, "k"),
      () => arrowPath(64, 36, "k"),
    ];
    for (const d of draw) {
      expect(d()).toBe(d());
      expect(d().match(/M/g)).toHaveLength(1); // one pen stroke: pathLength=1 + dashoffset draws it start to end
      expect(d()).not.toMatch(/NaN|Infinity/);
    }
    expect(loopPath(120, 60, "a")).not.toBe(loopPath(120, 60, "b"));
  });

  it("flattens a label to its text", () => {
    expect(flatText("Canon")).toBe("Canon");
    expect(flatText(["1", " ", "Ideas"])).toBe("1 Ideas");
    expect(flatText(null)).toBe("");
  });
});

describe("paperCardClass (v3)", () => {
  it("adds the alternate radius after the press class, before custom classes", () => {
    expect(paperCardClass({ alt: true, pressable: true, className: "p-4" })).toBe("paper press paper-alt p-4");
  });
});
