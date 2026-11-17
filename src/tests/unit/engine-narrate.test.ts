import { beforeEach, describe, expect, it, vi } from "vitest";
import { narrateWithTimeout } from "@/lib/engine/effects";
import { templateNarration } from "@/lib/bots/fallbacks";
import type { NarrateInput, NarrateResult } from "@/lib/ai/types";

const mocks = vi.hoisted(() => ({ narrate: vi.fn() }));
vi.mock("@/lib/ai/narrate", () => ({ narrateOutcome: mocks.narrate }));

const input: NarrateInput = {
  story: { premise: "p", preset: "heist", summary: "Earlier things happened.", lastNarrations: [], roundNo: 1, roundsTotal: 3, lang: "en" },
  prompt: { title: "t", text: "x" },
  winnerLabel: "Rob the vault",
  sourceIdeas: ["rob it"],
  isFinalRound: false,
};
const real: NarrateResult = { narration: "Real narration.", beat: "Real beat", summary: "Real summary", provider: "mock", ms: 3, fallbackUsed: false };

beforeEach(() => {
  mocks.narrate.mockReset();
});

describe("narrateWithTimeout (5 s race, then the template)", () => {
  it("returns the narrator's text when it answers in time", async () => {
    mocks.narrate.mockResolvedValue(real);
    expect(await narrateWithTimeout(input, 500)).toEqual(real);
  });

  it("falls back to the template when the narrator never answers", async () => {
    mocks.narrate.mockReturnValue(new Promise(() => {}));
    const t0 = Date.now();
    const r = await narrateWithTimeout(input, 60);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
    expect(r.narration).toBe(templateNarration("Rob the vault", { roundNo: 1, roundsTotal: 3, scene: "t", final: false }));
    expect(r.narration).toContain("“Rob the vault”");
    expect(r.narration).not.toMatch(/^Rob the vault./); // the label is part of the story, not a repeat of the card above it
    expect(r).toMatchObject({ beat: "Rob the vault", provider: "template", fallbackUsed: true });
    expect(r.summary).toBe("Earlier things happened. Rob the vault");
  });

  it("falls back immediately when the narrator throws or returns nothing usable", async () => {
    mocks.narrate.mockRejectedValue(new Error("down"));
    expect((await narrateWithTimeout(input, 5000)).provider).toBe("template");
    mocks.narrate.mockResolvedValue({ ...real, narration: "  " });
    expect((await narrateWithTimeout(input, 5000)).provider).toBe("template");
  });

  it("keeps the running summary within 1,200 characters", async () => {
    mocks.narrate.mockRejectedValue(new Error("down"));
    const long = { ...input, story: { ...input.story, summary: "x".repeat(1500) } };
    expect((await narrateWithTimeout(long, 5000)).summary.length).toBeLessThanOrEqual(1200);
  });
});
