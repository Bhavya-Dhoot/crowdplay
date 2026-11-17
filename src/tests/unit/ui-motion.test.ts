import { describe, expect, it } from "vitest";
import { paperCardClass } from "@/components/ui/PaperCard";
import { DURATION, EASE } from "@/components/ui/motionTokens";

describe("motion tokens", () => {
  it("keeps the spec durations and the arrive / exit curves", () => {
    expect(DURATION.fast * 1000).toBe(175);
    expect(EASE.arrive).toEqual([0.24, 1, 0.4, 1]);
    expect(EASE.exit).toEqual([0.3, 0, 0.6, 0.6]);
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
