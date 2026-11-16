import { describe, expect, it } from "vitest";
import { createSynth, cueFor, tickDue, ttsKey } from "@/components/screen/sound";

describe("tickDue", () => {
  it("ticks once per second in the last five seconds of STORM and VOTE", () => {
    let prev: number | null = null;
    const ticks: number[] = [];
    for (const s of [30, 12, 6, 5, 5, 4, 3, 3, 2, 1, 0]) {
      if (tickDue("STORM", s, prev, false)) ticks.push(s);
      prev = s;
    }
    expect(ticks).toEqual([5, 4, 3, 2, 1]);
    expect(tickDue("VOTE", 3, 4, false)).toBe(true);
  });

  it("stays quiet in other phases, when paused, and with no countdown", () => {
    expect(tickDue("PROMPT", 3, 4, false)).toBe(false);
    expect(tickDue("REVEAL", 3, 4, false)).toBe(false);
    expect(tickDue("STORM", 3, 4, true)).toBe(false);
    expect(tickDue("STORM", null, 4, false)).toBe(false);
    expect(tickDue("STORM", 0, 1, false)).toBe(false);
  });
});

describe("cueFor", () => {
  it("whooshes when the options appear and stings on the reveal", () => {
    expect(cueFor("DISTILL", "VOTE")).toBe("whoosh");
    expect(cueFor("VOTE", "REVEAL")).toBe("sting");
  });

  it("is silent on first paint, on the same phase and on other phases", () => {
    expect(cueFor(null, "REVEAL")).toBeNull();
    expect(cueFor("REVEAL", "REVEAL")).toBeNull();
    expect(cueFor("PROMPT", "STORM")).toBeNull();
    expect(cueFor("REVEAL", "FINALE")).toBeNull();
  });
});

describe("ttsKey", () => {
  const base = { showId: "sh_1", roundNo: 2 };
  it("exists only when a clip exists, and changes per round", () => {
    expect(ttsKey(null)).toBeNull();
    expect(ttsKey({ ...base, outcome: undefined })).toBeNull();
    expect(ttsKey({ ...base, outcome: { optionId: "o", narration: "x", credit: [], more: 0 } })).toBeNull();
    const a = ttsKey({ ...base, outcome: { optionId: "o", narration: "x", credit: [], more: 0, ttsUrl: "/api/tts/a" } });
    const b = ttsKey({ showId: "sh_1", roundNo: 3, outcome: { optionId: "o", narration: "x", credit: [], more: 0, ttsUrl: "/api/tts/a" } });
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

describe("createSynth", () => {
  it("returns null without a browser instead of throwing", () => {
    expect(createSynth()).toBeNull();
  });
});
