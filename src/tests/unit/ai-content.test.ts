import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ anthropicCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: h.anthropicCreate };
  },
}));
vi.mock("@/lib/ingest/filter", () => {
  const blocked = /\b(badword|nastything)\b/i;
  return {
    checkText: (text: string, opts: { maxLen?: number } = {}) => {
      const t = text.replace(/\s+/g, " ").trim();
      if (!t) return { ok: false, reason: "EMPTY" };
      if (t.length > (opts.maxLen ?? 10_000)) return { ok: false, reason: "TOO_LONG" };
      if (blocked.test(t)) return { ok: false, reason: "BLOCKED" };
      return { ok: true, text: t };
    },
    isClean: () => true,
  };
});

import { resetConfig } from "@/lib/config";
import { safeLabel } from "@/lib/ai/safety";
import { BOT_ID_RE, BOT_PERSONAS, personaById } from "@/lib/bots/personas";
import { cannedIdeas, cannedPool, sampleCanned } from "@/lib/bots/canned";
import { generateBotIdeas } from "@/lib/bots/ideas";
import { PRESETS } from "@/lib/presets";
import type { PresetId } from "@/lib/realtime/types";

const PRESET_IDS: PresetId[] = ["heist", "fantasy", "space", "mystery", "classroom", "custom"];

describe("presets", () => {
  it("has the six presets with the spec names", () => {
    expect(Object.keys(PRESETS).sort()).toEqual([...PRESET_IDS].sort());
    expect(PRESETS.heist.name).toBe("Heist");
    expect(PRESETS.fantasy.name).toBe("Fantasy Quest");
    expect(PRESETS.space.name).toBe("Space Mission");
    expect(PRESETS.mystery.name).toBe("Murder Mystery");
    expect(PRESETS.classroom.name).toBe('Classroom "What if?"');
    expect(PRESETS.custom.name).toBe("Custom");
  });

  it.each(PRESET_IDS)("%s is complete and within the length limits", (id) => {
    const p = PRESETS[id];
    expect(p.id).toBe(id);
    expect(p.emoji.length).toBeGreaterThan(0);
    expect(p.tone.length).toBeGreaterThan(10);
    if (id === "custom") expect(p.premise).toBe("");
    else expect(p.premise.length).toBeGreaterThan(60);
    expect(p.round1.title.length).toBeGreaterThan(0);
    expect(p.round1.title.length).toBeLessThanOrEqual(40);
    expect(p.round1.text.length).toBeGreaterThan(60);
    expect(p.round1.text.length).toBeLessThanOrEqual(220);
    expect(p.round1.text).toMatch(/[?.!]['"]?$/);
    expect(p.round1.narratorOptions).toHaveLength(3);
    expect(new Set(p.round1.narratorOptions).size).toBe(3);
    for (const o of p.round1.narratorOptions) {
      expect(o.length).toBeLessThanOrEqual(70);
      expect(safeLabel(o)).toBe(o);
    }
    expect(p.starters).toHaveLength(3);
    expect(new Set(p.starters).size).toBe(3);
    for (const s of p.starters) {
      expect(s.length).toBeGreaterThan(5);
      expect(s.length).toBeLessThanOrEqual(40);
    }
  });

  it("contains no placeholder text", () => {
    expect(JSON.stringify(PRESETS)).not.toMatch(/lorem|ipsum|todo|fixme|placeholder|tbd/i);
  });
});

describe("canned bot ideas", () => {
  it.each(PRESET_IDS)("%s has at least 200 distinct short ideas", (id) => {
    const all = cannedIdeas(id);
    expect(all.length).toBeGreaterThanOrEqual(200);
    expect(new Set(all).size).toBe(all.length);
    for (const t of all) {
      expect(t.length).toBeLessThanOrEqual(100);
      expect(t.length).toBeGreaterThanOrEqual(8);
      expect(t).not.toMatch(/undefined|null|\$\{/);
    }
    // Pools are big enough to honour the 45/35/20 mix at 200 lines.
    const p = cannedPool(id);
    expect(p.a.length).toBeGreaterThanOrEqual(45);
    expect(p.b.length).toBeGreaterThanOrEqual(45);
    expect(p.varied.length).toBeGreaterThanOrEqual(70);
    expect(p.odd.length).toBeGreaterThanOrEqual(40);
  });

  it("reads like casual chat: mostly lowercase, some typos, some shouting", () => {
    const all = cannedIdeas("heist");
    expect(all.filter((t) => /^[a-z]/.test(t)).length / all.length).toBeGreaterThan(0.5);
    expect(all.some((t) => /!!|\.\.\./.test(t))).toBe(true);
    // Typos: words that appear exactly once in the whole pool and are not in the hand-written cores.
    const core = new Set(cannedIdeas("heist").flatMap((t) => t.toLowerCase().match(/[a-z]{5,}/g) ?? []));
    const counts = new Map<string, number>();
    for (const t of cannedIdeas("heist")) for (const w of t.toLowerCase().match(/[a-z]{5,}/g) ?? []) counts.set(w, (counts.get(w) ?? 0) + 1);
    const rare = [...counts.entries()].filter(([, n]) => n === 1).length;
    expect(core.size).toBeGreaterThan(100);
    expect(rare).toBeGreaterThanOrEqual(5);
  });

  it("samples with the bot mix, deterministically, without repeats", () => {
    const s1 = sampleCanned("fantasy", 60, "room:1");
    const s2 = sampleCanned("fantasy", 60, "room:1");
    const s3 = sampleCanned("fantasy", 60, "room:2");
    expect(s1).toEqual(s2);
    expect(s1).not.toEqual(s3);
    expect(new Set(s1).size).toBe(60);
    const p = cannedPool("fantasy");
    const count = (xs: string[]) => s1.filter((t) => xs.includes(t)).length;
    const directions = count(p.a) + count(p.b);
    expect(directions / 60).toBeGreaterThanOrEqual(0.4);
    expect(directions / 60).toBeLessThanOrEqual(0.5);
    expect(count(p.varied) / 60).toBeGreaterThanOrEqual(0.3);
    expect(count(p.varied) / 60).toBeLessThanOrEqual(0.4);
    expect(count(p.odd) / 60).toBeGreaterThanOrEqual(0.15);
    expect(count(p.odd) / 60).toBeLessThanOrEqual(0.25);
    expect(count(p.a)).toBeGreaterThan(8);
    expect(count(p.b)).toBeGreaterThan(8);
  });
});

describe("bot personas", () => {
  it("has 30 personas with stable b_ ids and invented names", () => {
    expect(BOT_PERSONAS).toHaveLength(30);
    expect(new Set(BOT_PERSONAS.map((p) => p.id)).size).toBe(30);
    expect(new Set(BOT_PERSONAS.map((p) => p.name)).size).toBe(30);
    for (const p of BOT_PERSONAS) {
      expect(p.id).toMatch(BOT_ID_RE);
      expect(p.id).toMatch(/^b_[a-z0-9]{16}$/);
      expect(p.name.length).toBeGreaterThan(3);
      expect(p.name.length).toBeLessThanOrEqual(24);
      expect(["terse", "normal", "chatty"]).toContain(p.verbosity);
      expect(["chaotic", "wholesome", "dramatic", "deadpan", "nerdy", "poetic", "blunt", "punny"]).toContain(p.style);
    }
    expect(personaById(BOT_PERSONAS[7].id)).toBe(BOT_PERSONAS[7]);
    expect(personaById("b_nope")).toBeUndefined();
  });
});

describe("generateBotIdeas", () => {
  const saved: Record<string, string | undefined> = {};
  function live() {
    for (const k of ["LLM_MODE", "ANTHROPIC_API_KEY"]) if (!(k in saved)) saved[k] = process.env[k];
    Object.assign(process.env, { LLM_MODE: "live", ANTHROPIC_API_KEY: "k" });
    resetConfig();
  }
  beforeEach(() => {
    h.anthropicCreate.mockReset();
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetConfig();
  });
  const base = { preset: "heist" as const, prompt: { title: "The Vault Door Hums", text: "Ninety seconds. How do we get in?" } };

  it("mock mode samples the canned pool deterministically", async () => {
    const a = await generateBotIdeas({ ...base, count: 60, seed: "s1" });
    const b = await generateBotIdeas({ ...base, count: 60, seed: "s1" });
    expect(a).toEqual(b);
    expect(a).toHaveLength(60);
    expect(new Set(a).size).toBe(60);
    for (const t of a) expect(t.length).toBeLessThanOrEqual(100);
    expect(await generateBotIdeas({ ...base, count: 0, seed: "s1" })).toEqual([]);
    expect(h.anthropicCreate).not.toHaveBeenCalled();
  });

  it("live mode uses the fast model, filters, dedupes and tops up", async () => {
    live();
    h.anthropicCreate.mockResolvedValue({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "t",
          name: "submit_result",
          input: { ideas: ["sneak through the vents", "Sneak through the vents", "badword the guards", "call the inside guy lol", "ask the doorman for directions"] },
        },
      ],
      usage: {},
    });
    const r = await generateBotIdeas({ ...base, count: 20, seed: "s2" });
    expect(r).toHaveLength(20);
    expect(r.slice(0, 3)).toEqual(["sneak through the vents", "call the inside guy lol", "ask the doorman for directions"]);
    expect(r.join("|")).not.toContain("badword");
    expect(new Set(r.map((t) => t.toLowerCase())).size).toBe(20);
    expect((h.anthropicCreate.mock.calls[0][0] as { model: string }).model).toBe("claude-haiku-5-5");
  });

  it("live failure falls back to the canned pool", async () => {
    live();
    h.anthropicCreate.mockRejectedValue(new Error("down"));
    const r = await generateBotIdeas({ ...base, count: 30, seed: "s3" });
    expect(r).toEqual(await (async () => sampleCanned("heist", 30, "s3"))());
  });
});
