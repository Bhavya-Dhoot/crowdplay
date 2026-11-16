import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { distillRound } from "@/lib/ai/distill";
import { mockDistillDelayMs, mockDistillThink } from "@/lib/ai/mock";
import type { DistillInput } from "@/lib/ai/types";
import { cannedIdeas } from "@/lib/bots/canned";
import { resetConfig } from "@/lib/config";
import { PRESETS } from "@/lib/presets";

const KEYS = ["LLM_MODE", "MOCK_DISTILL_DELAY_MS", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

function setEnv(env: Partial<Record<(typeof KEYS)[number], string | undefined>>): void {
  for (const k of KEYS) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  resetConfig();
}

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetConfig();
});

describe("MOCK_DISTILL_DELAY_MS", () => {
  it("is 0 when unset, malformed or not positive", () => {
    setEnv({ LLM_MODE: "mock" });
    expect(mockDistillDelayMs()).toBe(0);
    for (const bad of ["abc", "-5", "0", ""]) {
      setEnv({ LLM_MODE: "mock", MOCK_DISTILL_DELAY_MS: bad });
      expect(mockDistillDelayMs()).toBe(0);
    }
  });

  it("applies in LLM_MODE=mock, capped at 10 s", () => {
    setEnv({ LLM_MODE: "mock", MOCK_DISTILL_DELAY_MS: "1500" });
    expect(mockDistillDelayMs()).toBe(1500);
    setEnv({ LLM_MODE: "mock", MOCK_DISTILL_DELAY_MS: "999999" });
    expect(mockDistillDelayMs()).toBe(10_000);
  });

  it("is ignored outside LLM_MODE=mock", () => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k", MOCK_DISTILL_DELAY_MS: "1500" });
    expect(mockDistillDelayMs()).toBe(0);
  });

  it("makes the mock distiller wait, and leaves the default instant", async () => {
    setEnv({ LLM_MODE: "mock", MOCK_DISTILL_DELAY_MS: "250" });
    const t0 = Date.now();
    await mockDistillThink();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(240);

    const ideas = cannedIdeas("heist").map((text, i) => ({ id: `i${i}`, userId: `u${i % 50}`, text, createdAt: 1000 + i }));
    const input: DistillInput = {
      roomId: "room-delay",
      roundNo: 1,
      story: { premise: "A heist.", preset: "heist", summary: "", lastNarrations: [], roundNo: 1, roundsTotal: 3, lang: "en" },
      prompt: { title: PRESETS.heist.round1.title, text: PRESETS.heist.round1.text },
      narratorOptions: PRESETS.heist.round1.narratorOptions,
      ideas,
    };
    const slow = await distillRound(input);
    expect(slow.provider, JSON.stringify(slow.options.map((o) => o.kind))).toBe("mock");
    expect(slow.ms).toBeGreaterThanOrEqual(240);

    setEnv({ LLM_MODE: "mock" });
    const fast = await distillRound(input);
    expect(fast.provider).toBe("mock");
    expect(fast.ms).toBeLessThan(240);
  });
});
