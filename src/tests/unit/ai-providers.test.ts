import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const h = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  openaiChat: vi.fn(),
  openaiEmbed: vi.fn(),
  openaiSpeech: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: h.anthropicCreate };
  },
}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: h.openaiChat } };
    embeddings = { create: h.openaiEmbed };
    audio = { speech: { create: h.openaiSpeech } };
  },
}));
vi.mock("@/lib/ingest/filter", () => ({
  checkText: (t: string) => ({ ok: true, text: t.replace(/\s+/g, " ").trim() }),
  isClean: () => true,
}));

import { resetConfig } from "@/lib/config";
import { distillRound } from "@/lib/ai/distill";
import { queueEmbedding, resetEmbeddings } from "@/lib/ai/embed";
import { generateFinale } from "@/lib/ai/finale";
import { narrateOutcome } from "@/lib/ai/narrate";
import { callChain, callJSON, LlmError, availableProviders } from "@/lib/ai/providers";
import { generatePrompt } from "@/lib/ai/prompts";
import { synthesize } from "@/lib/ai/tts";
import { translateBundle } from "@/lib/ai/translate";
import { generateBotIdeas } from "@/lib/bots/ideas";
import { cannedIdeas } from "@/lib/bots/canned";
import { PRESETS } from "@/lib/presets";

const ENV_KEYS = [
  "LLM_MODE",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_FAST_MODEL",
  "OPENAI_TTS_MODEL",
  "FEATURE_TTS",
  "FEATURE_MULTILINGUAL",
  "ANTHROPIC_FAST_MODEL",
  "ANTHROPIC_SMART_MODEL",
] as const;
const saved: Record<string, string | undefined> = {};
function setEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) {
    if (!(k in saved)) saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, env);
  resetConfig();
}
beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  resetEmbeddings();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetConfig();
});

const Schema = z.object({ answer: z.string().min(3).max(20), n: z.number().int() });
const toolUse = (input: unknown) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id: "t", name: "submit_result", input }],
  usage: { input_tokens: 1, output_tokens: 1 },
});
const args = { role: "fast" as const, system: "sys", user: "usr", schema: Schema, timeoutMs: 4000, name: "unit" };

describe("LLM_MODE=mock never touches the network", () => {
  it("has no providers even with keys present, and callJSON refuses", async () => {
    setEnv({ LLM_MODE: "mock", ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "o", OPENAI_FAST_MODEL: "m" });
    expect(availableProviders()).toEqual([]);
    await expect(callJSON(args)).rejects.toMatchObject({ kind: "unavailable" });
    await expect(callChain([{ role: "fast", timeoutMs: 1000 }], 1000, { system: "s", user: "u", schema: Schema, name: "x" })).rejects.toBeInstanceOf(
      LlmError,
    );
  });

  it("every AI entry point answers locally in mock mode", async () => {
    setEnv({
      LLM_MODE: "mock",
      ANTHROPIC_API_KEY: "k",
      OPENAI_API_KEY: "o",
      OPENAI_FAST_MODEL: "m",
      OPENAI_TTS_MODEL: "tts",
      FEATURE_TTS: "1",
      FEATURE_MULTILINGUAL: "1",
    });
    const story = { premise: "p", preset: "heist" as const, summary: "", lastNarrations: [], roundNo: 2, roundsTotal: 3, lang: "en" };
    const ideas = cannedIdeas("heist")
      .slice(0, 80)
      .map((text, i) => ({ id: `i${i}`, userId: `u${i}`, text, createdAt: i }));
    for (const i of ideas) queueEmbedding(i.id, i.text);
    const [d, n, p, f, t, tr, b] = await Promise.all([
      distillRound({
        roomId: "r",
        roundNo: 1,
        story,
        prompt: { title: "t", text: "x" },
        narratorOptions: PRESETS.heist.round1.narratorOptions,
        ideas,
      }),
      narrateOutcome({ story, prompt: { title: "t", text: "x" }, winnerLabel: "The crew slips in", sourceIdeas: ["a"], isFinalRound: false }),
      generatePrompt({ story, lastBeat: null }),
      generateFinale({ premise: "p", title: "T", beats: ["One.", "Two."], winningLabels: ["a", "b"] }),
      synthesize("hello there"),
      translateBundle({ narration: "Hello" }, ["es"]),
      generateBotIdeas({ preset: "heist", prompt: { title: "t", text: "x" }, count: 20, seed: "s" }),
    ]);
    await new Promise((r) => setTimeout(r, 650)); // let the embedding micro-batch flush
    expect(d.provider).toBe("mock");
    expect(n.provider).toBe("mock");
    expect(p.provider).toBe("mock");
    expect(f.provider).toBe("mock");
    expect(t).toBeNull();
    expect(tr).toEqual({});
    expect(b).toHaveLength(20);
    for (const fn of Object.values(h)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("callJSON (Anthropic)", () => {
  it("returns validated data with provider and elapsed ms", async () => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k" });
    h.anthropicCreate.mockResolvedValue(toolUse({ answer: "forty two", n: 42 }));
    const r = await callJSON(args);
    expect(r.data).toEqual({ answer: "forty two", n: 42 });
    expect(r.provider).toBe("anthropic");
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  it("forces the tool on Haiku and asks for low effort", async () => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k" });
    h.anthropicCreate.mockResolvedValue(toolUse({ answer: "forty two", n: 1 }));
    await callJSON(args);
    const [p] = h.anthropicCreate.mock.calls[0] as [Record<string, unknown>];
    expect(p.model).toBe("claude-haiku-5-5");
    expect(p.tool_choice).toEqual({ type: "tool", name: "submit_result" });
    expect(p.output_config).toEqual({ effort: "low" });
    expect((p.tools as { input_schema: { type: string } }[])[0].input_schema.type).toBe("object");
  });

  it("uses tool_choice auto on models that reject forced tool use", async () => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k" });
    h.anthropicCreate.mockResolvedValue(toolUse({ answer: "forty two", n: 1 }));
    await callJSON({ ...args, role: "smart" });
    const [p] = h.anthropicCreate.mock.calls[0] as [Record<string, unknown>];
    expect(p.model).toBe("claude-sonnet-5-5");
    expect(p.tool_choice).toEqual({ type: "auto" });
  });

  it("learns from a 400 about tool_choice and retries once with auto", async () => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k", ANTHROPIC_FAST_MODEL: "claude-some-future-model" });
    h.anthropicCreate
      .mockRejectedValueOnce(Object.assign(new Error("tool_choice: type tool is not supported for this model"), { status: 400 }))
      .mockResolvedValue(toolUse({ answer: "forty two", n: 7 }));
    const r = await callJSON(args);
    expect(r.data.n).toBe(7);
    expect(h.anthropicCreate).toHaveBeenCalledTimes(2);
    expect((h.anthropicCreate.mock.calls[1][0] as { tool_choice: unknown }).tool_choice).toEqual({ type: "auto" });
    // The next call goes straight to auto.
    h.anthropicCreate.mockClear();
    h.anthropicCreate.mockResolvedValue(toolUse({ answer: "forty two", n: 8 }));
    await callJSON(args);
    expect(h.anthropicCreate).toHaveBeenCalledTimes(1);
    expect((h.anthropicCreate.mock.calls[0][0] as { tool_choice: unknown }).tool_choice).toEqual({ type: "auto" });
  });

  it("repairs once: the retry carries the validation problem", async () => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k" });
    h.anthropicCreate.mockResolvedValueOnce(toolUse({ answer: "x", n: 1 })).mockResolvedValueOnce(toolUse({ answer: "fixed answer", n: 1 }));
    const r = await callJSON(args);
    expect(r.data.answer).toBe("fixed answer");
    const second = h.anthropicCreate.mock.calls[1][0] as { messages: { content: string }[] };
    expect(second.messages[0].content).toContain("previous answer was rejected");
    expect(second.messages[0].content).toContain("answer");
  });

  it("repairs on a failed rule check too, and throws after the second failure", async () => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k" });
    h.anthropicCreate.mockResolvedValue(toolUse({ answer: "valid text", n: 1 }));
    await expect(callJSON({ ...args, check: () => "rule broken" })).rejects.toMatchObject({ kind: "invalid" });
    expect(h.anthropicCreate).toHaveBeenCalledTimes(2);
  });

  it("does not retry when little time is left", async () => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k" });
    h.anthropicCreate.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 250));
      return toolUse({ answer: "x", n: 1 });
    });
    await expect(callJSON({ ...args, timeoutMs: 800 })).rejects.toBeInstanceOf(LlmError);
    expect(h.anthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("times out, aborts the request and rejects", async () => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k" });
    let signal: AbortSignal | undefined;
    h.anthropicCreate.mockImplementation((_p: unknown, o: { signal: AbortSignal }) => {
      signal = o.signal;
      return new Promise(() => {});
    });
    const t0 = Date.now();
    await expect(callJSON({ ...args, timeoutMs: 300 })).rejects.toMatchObject({ kind: "timeout" });
    expect(Date.now() - t0).toBeLessThan(900);
    expect(signal?.aborted).toBe(true);
  });

  it.each([
    ["a refusal", { stop_reason: "refusal", content: [], usage: {} }],
    ["no tool call", { stop_reason: "end_turn", content: [{ type: "text", text: "{}" }], usage: {} }],
    ["a truncated answer", { stop_reason: "max_tokens", content: [], usage: {} }],
  ])("throws on %s", async (_n, res) => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k" });
    h.anthropicCreate.mockResolvedValue(res);
    await expect(callJSON(args)).rejects.toBeInstanceOf(LlmError);
  });

  it("maps HTTP errors to LlmError with the status", async () => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k" });
    h.anthropicCreate.mockRejectedValue(Object.assign(new Error("overloaded"), { status: 529 }));
    await expect(callJSON(args)).rejects.toMatchObject({ kind: "http", status: 529 });
  });
});

describe("callJSON (OpenAI) and callChain", () => {
  it("uses structured output with a strict schema and the env model", async () => {
    setEnv({ LLM_MODE: "live", OPENAI_API_KEY: "o", OPENAI_FAST_MODEL: "fast-x" });
    h.openaiChat.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ answer: "forty two", n: 3 }) } }] });
    const r = await callJSON(args);
    expect(r.provider).toBe("openai");
    const [p] = h.openaiChat.mock.calls[0] as [{ model: string; response_format: { type: string; json_schema: { strict: boolean; schema: Record<string, unknown> } } }];
    expect(p.model).toBe("fast-x");
    expect(p.response_format.type).toBe("json_schema");
    expect(p.response_format.json_schema.strict).toBe(true);
    expect(JSON.stringify(p.response_format.json_schema.schema)).not.toMatch(/minLength|maxLength|\$schema/);
    expect(p.response_format.json_schema.schema.additionalProperties).toBe(false);
  });

  it("needs both OPENAI_API_KEY and OPENAI_FAST_MODEL", () => {
    setEnv({ LLM_MODE: "live", OPENAI_API_KEY: "o" });
    expect(availableProviders()).toEqual([]);
    setEnv({ LLM_MODE: "live", OPENAI_API_KEY: "o", OPENAI_FAST_MODEL: "m", ANTHROPIC_API_KEY: "k" });
    expect(availableProviders()).toEqual(["anthropic", "openai"]);
  });

  it("callChain moves to the next step when one fails and reports which one answered", async () => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k" });
    h.anthropicCreate.mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 500 })).mockResolvedValue(toolUse({ answer: "second try", n: 2 }));
    const r = await callChain(
      [
        { role: "smart", timeoutMs: 2000 },
        { role: "fast", timeoutMs: 2000 },
      ],
      5000,
      { system: "s", user: "u", schema: Schema, name: "chain" },
    );
    expect(r.stepIndex).toBe(1);
    expect((h.anthropicCreate.mock.calls[0][0] as { model: string }).model).toBe("claude-sonnet-5-5");
    expect((h.anthropicCreate.mock.calls[1][0] as { model: string }).model).toBe("claude-haiku-5-5");
  });
});
