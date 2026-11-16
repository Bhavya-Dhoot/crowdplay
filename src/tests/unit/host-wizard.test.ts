import { describe, expect, it } from "vitest";
import {
  estimateMinutes,
  initialForm,
  nextPremise,
  nextTitle,
  PRESET_ORDER,
  sliderFill,
  STORM_SECONDS,
  TITLE_SUGGESTION,
  validateWizard,
  VOTE_SECONDS,
} from "@/components/host/wizardLogic";
import { PRESET_IDS } from "@/lib/api/contracts";
import { PRESETS } from "@/lib/presets";

describe("wizard defaults", () => {
  it("every preset is offered, in the contract's id set", () => {
    expect([...PRESET_ORDER].sort()).toEqual([...PRESET_IDS].sort());
    for (const id of PRESET_ORDER) expect(TITLE_SUGGESTION[id].length).toBeGreaterThanOrEqual(2);
  });

  it("the default form is valid as it stands", () => {
    const v = validateWizard(initialForm("Brave Otter"));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.hostName).toBe("Brave Otter");
      expect(v.body.preset).toBe("heist");
      expect(v.body.roundsTotal).toBe(5);
      expect(v.body.stormMs).toBe(30_000);
      expect(v.body.voteMs).toBe(12_000);
      expect(v.body.autoAdvance).toBe(true);
      expect(v.body.strictFilter).toBe(true);
    }
  });

  it("offers exactly the spec's timings", () => {
    expect([...STORM_SECONDS]).toEqual([20, 30, 45]);
    expect([...VOTE_SECONDS]).toEqual([10, 12, 20]);
  });
});

describe("preset switching keeps the host's own words", () => {
  it("swaps premise and title while they are still the defaults", () => {
    expect(nextPremise("heist", PRESETS.heist.premise, "space")).toBe(PRESETS.space.premise);
    expect(nextTitle("heist", TITLE_SUGGESTION.heist, "space")).toBe(TITLE_SUGGESTION.space);
    expect(nextPremise("custom", "   ", "fantasy")).toBe(PRESETS.fantasy.premise);
  });

  it("keeps an edited premise and title", () => {
    expect(nextPremise("heist", "My own heist, with llamas.", "space")).toBe("My own heist, with llamas.");
    expect(nextTitle("heist", "Llama Night", "space")).toBe("Llama Night");
  });

  it("custom starts empty, so it must be written before Create works", () => {
    const f = initialForm("Sam");
    const premise = nextPremise(f.preset, f.premise, "custom");
    expect(premise).toBe(PRESETS.custom.premise);
    const v = validateWizard({ ...f, preset: "custom", premise });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.premise).toMatch(/Describe your story/);
  });
});

describe("validateWizard", () => {
  const ok = initialForm("Sam Host");

  it("flags a short name, title and premise with friendly messages", () => {
    const v = validateWizard({ ...ok, hostName: " a ", title: "x", premise: "too short" });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.hostName).toMatch(/at least 2/);
      expect(v.errors.title).toMatch(/at least 2/);
      expect(v.errors.premise).toMatch(/10 characters/);
    }
  });

  it("flags values over the limits", () => {
    const v = validateWizard({ ...ok, hostName: "n".repeat(21), title: "t".repeat(61), premise: "p".repeat(401) });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.hostName).toMatch(/20/);
      expect(v.errors.title).toMatch(/60/);
      expect(v.errors.premise).toMatch(/400/);
    }
  });

  it("counts characters, not UTF-16 units", () => {
    const v = validateWizard({ ...ok, hostName: "🎲".repeat(20) });
    expect(v.ok).toBe(true);
  });

  it("trims before sending and passes the toggles through", () => {
    const v = validateWizard({ ...ok, hostName: "  Sam  ", title: "  Night  ", autoAdvance: false, strictFilter: false, rounds: 10, stormS: 45, voteS: 20 });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.hostName).toBe("Sam");
      expect(v.body.title).toBe("Night");
      expect(v.body.autoAdvance).toBe(false);
      expect(v.body.strictFilter).toBe(false);
      expect(v.body.roundsTotal).toBe(10);
      expect(v.body.stormMs).toBe(45_000);
      expect(v.body.voteMs).toBe(20_000);
    }
  });

  it("rejects a round count outside 3 to 10", () => {
    expect(validateWizard({ ...ok, rounds: 2 }).ok).toBe(false);
    expect(validateWizard({ ...ok, rounds: 11 }).ok).toBe(false);
  });
});

describe("estimateMinutes and sliderFill", () => {
  it("is an upper bound built from the engine's per-phase defaults", () => {
    // 5 rounds x (6 prompt + 30 storm + 8 distill + 12 vote + 12 reveal) = 340 s -> 6 min
    expect(estimateMinutes(5, 30, 12)).toBe(6);
    expect(estimateMinutes(3, 20, 10)).toBe(3);
    expect(estimateMinutes(10, 45, 20)).toBe(16);
  });

  it("sliderFill spans 0..100 across 3..10", () => {
    expect(sliderFill(3)).toBe(0);
    expect(sliderFill(10)).toBe(100);
    expect(sliderFill(7)).toBe(57);
  });
});
