// PERF2 AI: embedding stragglers, the trimmed distill prompt, the narration schema, OPENAI_REASONING_EFFORT.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const h = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  openaiChat: vi.fn(),
  openaiEmbed: vi.fn(),
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
  },
}));
vi.mock("@/lib/ingest/filter", () => ({
  checkText: (t: string) => ({ ok: true, text: t.replace(/\s+/g, " ").trim() }),
  isClean: () => true,
}));

import { resetConfig } from "@/lib/config";
import { distillRound } from "@/lib/ai/distill";
import { flushEmbeddings, getVectors, hashedVector, queueEmbedding, resetEmbeddings } from "@/lib/ai/embed";
import { narrateOutcome } from "@/lib/ai/narrate";
import { callJSON, openaiReasoningEffort } from "@/lib/ai/providers";
import type { DistillIdea, DistillInput } from "@/lib/ai/types";
import { cannedIdeas } from "@/lib/bots/canned";
import { PRESETS } from "@/lib/presets";

const ENV_KEYS = ["LLM_MODE", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENAI_FAST_MODEL", "OPENAI_REASONING_EFFORT"] as const;
const saved: Record<string, string | undefined> = {};

function live(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) {
    if (!(k in saved)) saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, { LLM_MODE: "live" }, env);
  resetConfig();
}

beforeEach(() => {
  h.anthropicCreate.mockReset();
  h.openaiChat.mockReset();
  h.openaiEmbed.mockReset();
  resetEmbeddings();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetConfig();
  resetEmbeddings();
});

// ---------- embeddings ----------

/** A provider whose vectors are recognisable: the local hashed vector of the text. */
const providerVec = (text: string): number[] => Array.from(hashedVector(text));
const embedFake = async ({ input }: { input: string[] }) => ({ data: input.map((t) => ({ embedding: providerVec(t) })) });
const sampleIdeas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, text: `idea number ${i} about the vault door` }));
const inputsOfCall = (n: number) => (h.openaiEmbed.mock.calls[n][0] as { input: string[] }).input;

describe("embeddings: stragglers", () => {
  it("flushEmbeddings sends the partial batch at once instead of waiting for the timer", () => {
    live({ OPENAI_API_KEY: "k" });
    h.openaiEmbed.mockImplementation(embedFake);
    queueEmbedding("a", "first idea");
    queueEmbedding("b", "second idea");
    expect(h.openaiEmbed).not.toHaveBeenCalled();
    flushEmbeddings();
    expect(h.openaiEmbed).toHaveBeenCalledTimes(1);
    expect(inputsOfCall(0)).toHaveLength(2);
  });

  it("embeds the few ideas without a vector on the spot and keeps the provider vectors (no mixing)", async () => {
    live({ OPENAI_API_KEY: "k" });
    h.openaiEmbed.mockImplementation(embedFake);
    const ideas = sampleIdeas(40);
    for (const i of ideas.slice(0, 38)) queueEmbedding(i.id, i.text);
    const r = await getVectors(ideas, { waitMs: 500 });
    expect(r.source).toBe("provider");
    expect(r.degraded).toBe(false);
    expect(r.stragglers).toBe(2);
    expect(h.openaiEmbed).toHaveBeenCalledTimes(2); // the partial batch, then the two stragglers
    expect(inputsOfCall(1)).toHaveLength(2);
    expect(r.vectors.size).toBe(40);
  });

  it("with no stragglers it makes no extra call", async () => {
    live({ OPENAI_API_KEY: "k" });
    h.openaiEmbed.mockImplementation(embedFake);
    const ideas = sampleIdeas(30);
    for (const i of ideas) queueEmbedding(i.id, i.text);
    const r = await getVectors(ideas, { waitMs: 500 });
    expect(r).toMatchObject({ source: "provider", degraded: false, stragglers: 0 });
    expect(h.openaiEmbed).toHaveBeenCalledTimes(1);
  });

  it("too many missing vectors: local vectors for everyone, no straggler call", async () => {
    live({ OPENAI_API_KEY: "k" });
    h.openaiEmbed.mockImplementation(embedFake);
    const ideas = sampleIdeas(20);
    for (const i of ideas.slice(0, 12)) queueEmbedding(i.id, i.text);
    const r = await getVectors(ideas, { waitMs: 500 }); // 8 missing > max(5, 3%)
    expect(r.source).toBe("local");
    expect(r.degraded).toBe(true);
    expect(h.openaiEmbed).toHaveBeenCalledTimes(1);
  });

  it("a failing straggler call degrades to local vectors and the provider rests afterwards", async () => {
    live({ OPENAI_API_KEY: "k" });
    h.openaiEmbed.mockImplementationOnce(embedFake).mockRejectedValue(new Error("embeddings down"));
    const ideas = sampleIdeas(25);
    for (const i of ideas.slice(0, 23)) queueEmbedding(i.id, i.text);
    const r = await getVectors(ideas, { waitMs: 500 });
    expect(r).toMatchObject({ source: "local", degraded: true });
    expect(h.openaiEmbed).toHaveBeenCalledTimes(2);
    await getVectors(ideas, { waitMs: 500 });
    expect(h.openaiEmbed).toHaveBeenCalledTimes(2); // cooling down: no new call
  });

  it("waitMs 0 (the heuristic path) never calls the provider for stragglers", async () => {
    live({ OPENAI_API_KEY: "k" });
    h.openaiEmbed.mockImplementation(embedFake);
    const r = await getVectors(sampleIdeas(10), { waitMs: 0 });
    expect(r.source).toBe("local");
    expect(h.openaiEmbed).not.toHaveBeenCalled();
  });
});

// ---------- distill prompt ----------

function hash(s: string): number {
  let x = 7;
  for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return x;
}
const lines = [...cannedIdeas("heist")].sort((a, b) => (hash(a) % 997) - (hash(b) % 997));
const ideas: DistillIdea[] = lines.map((text, i) => ({ id: `idea${i}`, userId: `u${i % 40}`, text, createdAt: 1000 + i }));
const distillInput = (): DistillInput => ({
  roomId: "room1",
  roundNo: 1,
  story: { premise: "A heist.", preset: "heist", summary: "", lastNarrations: [], roundNo: 1, roundsTotal: 3, lang: "en" },
  prompt: { title: PRESETS.heist.round1.title, text: PRESETS.heist.round1.text },
  narratorOptions: PRESETS.heist.round1.narratorOptions,
  ideas,
});

describe("distill prompt size", () => {
  it("lists at most 3 representative ideas per crowd cluster and 20 wild clusters, and asks for two backups", async () => {
    live({ ANTHROPIC_API_KEY: "k" });
    h.anthropicCreate.mockRejectedValue(new Error("stop here")); // we only need the prompt
    await distillRound(distillInput());
    const [p] = h.anthropicCreate.mock.calls[0] as [{ system: string; messages: { content: string }[] }];
    expect(p.system).toMatch(/up to two backup/);
    const [crowdPart, wildPart] = p.messages[0].content.split("WILD CLUSTERS");
    const crowdBlocks = crowdPart.split(/\n(?=\[c\d+\])/).filter((b) => /^\[c\d+\]/.test(b));
    expect(crowdBlocks.length).toBeGreaterThan(2);
    expect(crowdBlocks.length).toBeLessThanOrEqual(8);
    const repCounts = crowdBlocks.map((b) => b.split("\n").filter((l) => l.startsWith("  - ")).length);
    expect(Math.max(...repCounts)).toBe(3);
    const wildCount = [...wildPart.matchAll(/\[c\d+\] size=/g)].length;
    expect(wildCount).toBeGreaterThan(0);
    expect(wildCount).toBeLessThanOrEqual(20);
  });
});

// ---------- narration ----------

describe("narration schema", () => {
  const story = { premise: "p", preset: "heist" as const, summary: "The crew reached the vault.", lastNarrations: [], roundNo: 2, roundsTotal: 4, lang: "en" };
  const narrateIn = { story, prompt: { title: "t", text: "x" }, winnerLabel: "The crew slips in", sourceIdeas: ["a"], isFinalRound: false };
  const words = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");

  it("asks the model for the narration and the beat only; the running summary is the old one plus the beat", async () => {
    live({ ANTHROPIC_API_KEY: "k" });
    h.anthropicCreate.mockResolvedValue({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t", name: "submit_result", input: { narration: words, beat: "The crew slips in" } }],
      usage: {},
    });
    const r = await narrateOutcome(narrateIn);
    expect(r.provider).toBe("anthropic");
    expect(r.summary).toBe("The crew reached the vault. The crew slips in.");
    const [p] = h.anthropicCreate.mock.calls[0] as [{ system: string; tools: { input_schema: { properties: Record<string, unknown> } }[] }];
    expect(Object.keys(p.tools[0].input_schema.properties).sort()).toEqual(["beat", "narration"]);
    expect(p.system).not.toMatch(/running summary/);
  });
});

// ---------- OPENAI_REASONING_EFFORT ----------

const answer = (data: unknown) => ({ choices: [{ message: { content: JSON.stringify(data) } }] });
const schema = z.object({ ok: z.boolean() });
const call = () => callJSON({ role: "fast", system: "s", user: "u", schema, timeoutMs: 5000, name: "t" });
const sentEffort = (n: number) => (h.openaiChat.mock.calls[n][0] as Record<string, unknown>).reasoning_effort;

describe("OPENAI_REASONING_EFFORT", () => {
  it("is sent to gpt-5-family models when set", async () => {
    live({ OPENAI_API_KEY: "k", OPENAI_FAST_MODEL: "gpt-5.4-mini", OPENAI_REASONING_EFFORT: "none" });
    h.openaiChat.mockResolvedValue(answer({ ok: true }));
    await call();
    expect(sentEffort(0)).toBe("none");
  });

  it("is omitted when unset, blank or not a known level", async () => {
    for (const v of [undefined, "", "  ", "turbo"]) {
      h.openaiChat.mockReset();
      live({ OPENAI_API_KEY: "k", OPENAI_FAST_MODEL: "gpt-5.4-mini", ...(v === undefined ? {} : { OPENAI_REASONING_EFFORT: v }) });
      h.openaiChat.mockResolvedValue(answer({ ok: true }));
      await call();
      expect("reasoning_effort" in (h.openaiChat.mock.calls[0][0] as object)).toBe(false);
    }
  });

  it("is omitted for models outside the gpt-5 family", async () => {
    live({ OPENAI_API_KEY: "k", OPENAI_FAST_MODEL: "gpt-4o-mini", OPENAI_REASONING_EFFORT: "none" });
    h.openaiChat.mockResolvedValue(answer({ ok: true }));
    await call();
    expect("reasoning_effort" in (h.openaiChat.mock.calls[0][0] as object)).toBe(false);
    expect(openaiReasoningEffort("gpt-4o-mini")).toBeUndefined();
    expect(openaiReasoningEffort("gpt-5-mini")).toBe("none");
  });

  it("a 400 about the parameter is retried once without it and remembered for that model", async () => {
    live({ OPENAI_API_KEY: "k", OPENAI_FAST_MODEL: "gpt-5.9-test", OPENAI_REASONING_EFFORT: "minimal" });
    h.openaiChat
      .mockRejectedValueOnce(Object.assign(new Error("Unsupported parameter: reasoning_effort"), { status: 400 }))
      .mockResolvedValue(answer({ ok: true }));
    const r = await call();
    expect(r.data).toEqual({ ok: true });
    expect(h.openaiChat).toHaveBeenCalledTimes(2);
    expect(sentEffort(0)).toBe("minimal");
    expect("reasoning_effort" in (h.openaiChat.mock.calls[1][0] as object)).toBe(false);
    await call();
    expect("reasoning_effort" in (h.openaiChat.mock.calls[2][0] as object)).toBe(false);
  });
});
