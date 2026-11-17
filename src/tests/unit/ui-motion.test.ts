import { describe, expect, it } from "vitest";
import { paperCardClass } from "@/components/ui/PaperCard";
import { DURATION, DURATION_MS, EASE, SPRING, springToLinear } from "@/components/ui/motionTokens";
import { lightHex, lightIndex, lightVar, ROUND_LIGHTS } from "@/components/ui/stageLight";

const points = (easing: string): number[] => easing.replace(/^linear\(|\)$/g, "").split(",").map((s) => Number(s.trim()));

describe("motion tokens", () => {
  it("keeps the spec durations and the arrive / exit curves", () => {
    expect(DURATION_MS).toEqual({ fast: 175, medium: 410, slow: 975 });
    expect(DURATION.fast * 1000).toBe(175);
    expect(EASE.arrive).toEqual([0.24, 1, 0.4, 1]);
    expect(EASE.exit).toEqual([0.3, 0, 0.6, 0.6]);
    expect(SPRING.stamp).toMatchObject({ stiffness: 420, damping: 22 });
  });
});

describe("springToLinear", () => {
  it("starts at 0, settles at exactly 1 and overshoots for the stamp spring", () => {
    const { easing, durationMs } = springToLinear(SPRING.stamp.stiffness, SPRING.stamp.damping);
    const p = points(easing);
    expect(p[0]).toBe(0);
    expect(p[p.length - 1]).toBe(1);
    expect(Math.max(...p)).toBeGreaterThan(1.05); // overshoot = the "landing"
    expect(durationMs).toBeGreaterThan(300);
    expect(durationMs).toBeLessThanOrEqual(1600);
  });

  it("does not overshoot when critically damped (sheets)", () => {
    const p = points(springToLinear(SPRING.settle.stiffness, SPRING.settle.damping).easing);
    expect(Math.max(...p)).toBeLessThanOrEqual(1.001);
    expect(p.every((v, i) => i === 0 || v >= p[i - 1] - 1e-9)).toBe(true);
  });

  it("uses the requested number of samples", () => {
    expect(points(springToLinear(300, 24, 1, 10).easing)).toHaveLength(11);
  });
});

describe("stage light", () => {
  it("round 1 amber, 2 teal, 3 lilac, then cycles", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(lightIndex)).toEqual([1, 2, 3, 1, 2, 3, 1]);
    expect(ROUND_LIGHTS).toEqual(["#FFB547", "#4FD1C5", "#B892FF"]);
    expect(lightHex(2)).toBe("#4FD1C5");
    expect(lightVar(3)).toBe("var(--light-3)");
  });

  it("falls back to round 1 for the lobby and odd input", () => {
    for (const v of [0, -2, NaN, Infinity, null, undefined]) expect(lightIndex(v as number)).toBe(1);
    expect(lightIndex(2.9)).toBe(2);
  });
});

describe("paperCardClass", () => {
  it("builds the paper, gel, edge and press classes", () => {
    expect(paperCardClass()).toBe("paper");
    expect(paperCardClass({ tone: "paper-2", gel: "c", edge: "wild", pressable: true, className: "p-4" })).toBe(
      "paper paper-2 paper-gel-c paper-edge-wild press p-4",
    );
  });
});
