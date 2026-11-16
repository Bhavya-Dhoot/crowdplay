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
import { fallbackFinale, generateFinale } from "@/lib/ai/finale";
import { appendSummary, narrateOutcome, templateNarration } from "@/lib/ai/narrate";
import { fallbackPrompt, generatePrompt, SCENES } from "@/lib/ai/prompts";
import { safeLabel, safeText } from "@/lib/ai/safety";
import type { NarrateInput, PromptInput, StoryContext } from "@/lib/ai/types";
import type { PresetId } from "@/lib/realtime/types";

const saved: Record<string, string | undefined> = {};
function live() {
  for (const k of ["LLM_MODE", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENAI_FAST_MODEL"]) {
    if (!(k in saved)) saved[k] = process.env[k];
    delete process.env[k];
  }
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

const toolUse = (input: unknown) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id: "t", name: "submit_result", input }],
  usage: {},
});

const story = (over: Partial<StoryContext> = {}): StoryContext => ({
  premise: "A heist at the Grand Aurelia.",
  preset: "heist",
  summary: "The crew reached the vault.",
  lastNarrations: ["They crept down the hall."],
  roundNo: 2,
  roundsTotal: 4,
  lang: "en",
  ...over,
});
const narrateIn = (over: Partial<NarrateInput> = {}): NarrateInput => ({
  story: story(),
  prompt: { title: "The Laser Maze", text: "Red lasers crisscross the floor." },
  winnerLabel: "The crew dances through the lasers one by one",
  sourceIdeas: ["dance through the lasers", "limbo under them lol"],
  isFinalRound: false,
  ...over,
});
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("narration", () => {
  it("mock mode uses the exact template from AI_PROMPTS §3", async () => {
    const r = await narrateOutcome(narrateIn());
    expect(r.provider).toBe("mock");
    expect(r.narration).toBe(
      "The crew dances through the lasers one by one. And just like that, everything changes — the story turns a corner no one saw coming.",
    );
    expect(r.beat).toBe("The crew dances through the lasers one by one");
    expect(r.beat.length).toBeLessThanOrEqual(90);
    expect(r.summary).toBe("The crew reached the vault. The crew dances through the lasers one by one.");
  });

  it("template does not double the closing punctuation", () => {
    expect(templateNarration("The vault opens!")).toMatch(/^The vault opens\. And just like that/);
  });

  it("keeps the running summary at or under 1,200 chars, newest first-class", () => {
    const long = "Earlier things happened. ".repeat(80);
    const s = appendSummary(long, "The crew escapes through the roof");
    expect(s.length).toBeLessThanOrEqual(1200);
    expect(s.endsWith("The crew escapes through the roof.")).toBe(true);
  });

  it("live: uses the model's narration, beat and summary", async () => {
    live();
    h.anthropicCreate.mockResolvedValue(
      toolUse({ narration: `${words(60)} and then the lights go out.`, beat: "The crew dances past the lasers", summary: "The crew reached the vault and passed the lasers." }),
    );
    const r = await narrateOutcome(narrateIn());
    expect(r.provider).toBe("anthropic");
    expect(r.fallbackUsed).toBe(false);
    expect(r.beat).toBe("The crew dances past the lasers");
    expect(r.narration.startsWith("word0")).toBe(true);
    const [p] = h.anthropicCreate.mock.calls[0] as [{ model: string; messages: { content: string }[] }];
    expect(p.model).toBe("claude-sonnet-5-5");
    expect(p.messages[0].content).toContain("WINNING CHOICE: The crew dances through the lasers one by one");
    expect(p.messages[0].content).toContain("<idea>limbo under them lol</idea>");
  });

  it("live: asks the model to close the story in the final round", async () => {
    live();
    h.anthropicCreate.mockResolvedValue(toolUse({ narration: words(50), beat: "The end arrives", summary: "It all ended." }));
    await narrateOutcome(narrateIn({ isFinalRound: true }));
    expect((h.anthropicCreate.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content).toMatch(/final round/);
  });

  it("live: a blocked word in the narration is replaced by the template (C1)", async () => {
    live();
    h.anthropicCreate.mockResolvedValue(
      toolUse({ narration: `${words(40)} badword ${words(10)}`, beat: "The crew moves on", summary: "The crew moved on." }),
    );
    const r = await narrateOutcome(narrateIn());
    expect(r.provider).toBe("template");
    expect(r.fallbackUsed).toBe(true);
    expect(r.narration).not.toContain("badword");
    expect(r.narration).toBe(templateNarration("The crew dances through the lasers one by one"));
  });

  it("live: unsafe beat or summary are replaced individually", async () => {
    live();
    h.anthropicCreate.mockResolvedValue(toolUse({ narration: words(50), beat: "badword beat here", summary: "badword summary here" }));
    const r = await narrateOutcome(narrateIn());
    expect(r.beat).toBe("The crew dances through the lasers one by one");
    expect(r.summary).not.toContain("badword");
    expect(r.summary).toContain("The crew reached the vault.");
  });

  it("live: strips @mentions so participant names never come from the model", async () => {
    live();
    h.anthropicCreate.mockResolvedValue(toolUse({ narration: `Thanks to @priya the lights fail. ${words(40)}`, beat: "Lights fail", summary: "Lights failed." }));
    const r = await narrateOutcome(narrateIn());
    expect(r.narration).not.toContain("@");
  });

  it("live: a narration over 90 words is repaired once, then the template is used", async () => {
    live();
    h.anthropicCreate.mockResolvedValue(toolUse({ narration: words(120), beat: "Too long", summary: "Too long." }));
    const r = await narrateOutcome(narrateIn());
    expect(r.provider).toBe("template");
    expect(r.narration.split(/\s+/).length).toBeLessThanOrEqual(90);
  });

  it("live: provider failure gives the template inside the time cap", async () => {
    live();
    h.anthropicCreate.mockRejectedValue(Object.assign(new Error("down"), { status: 503 }));
    const t0 = Date.now();
    const r = await narrateOutcome(narrateIn());
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.provider).toBe("template");
    expect(r.fallbackUsed).toBe(true);
    expect(r.narration).toContain("everything changes");
  });
});

describe("scene prompts", () => {
  const presets: PresetId[] = ["heist", "fantasy", "space", "mystery", "classroom", "custom"];
  const pin = (preset: PresetId, roundNo: number): PromptInput => ({ story: story({ preset, roundNo }), lastBeat: "The crew moved on" });

  it.each(presets)("%s has hand-written scenes within the length limits and three distinct narrator options", (preset) => {
    expect(SCENES[preset].length).toBeGreaterThanOrEqual(6);
    for (const s of SCENES[preset]) {
      expect(s.title.length).toBeLessThanOrEqual(40);
      expect(s.text.length).toBeLessThanOrEqual(220);
      expect(s.text.length).toBeGreaterThan(60);
      expect(s.narratorOptions).toHaveLength(3);
      for (const o of s.narratorOptions) {
        expect(o.length).toBeLessThanOrEqual(70);
        expect(o.length).toBeGreaterThanOrEqual(8);
        expect(safeLabel(o)).toBe(o);
      }
      expect(new Set(s.narratorOptions).size).toBe(3);
    }
    expect(new Set(SCENES[preset].map((s) => s.title)).size).toBe(SCENES[preset].length);
  });

  it("fallbackPrompt picks the scene by round number and wraps around", () => {
    const a = fallbackPrompt(pin("space", 2));
    const b = fallbackPrompt(pin("space", 3));
    const wrap = fallbackPrompt(pin("space", 2 + SCENES.space.length));
    expect(a.title).toBe(SCENES.space[0].title);
    expect(b.title).toBe(SCENES.space[1].title);
    expect(wrap.title).toBe(a.title);
    expect(a.ms).toBe(0);
    expect(a.provider).toBe("preset");
    expect(a.fallbackUsed).toBe(true);
    expect(a.narratorOptions).toHaveLength(3);
  });

  it("mock generatePrompt returns the preset scene without flagging a fallback", async () => {
    const r = await generatePrompt(pin("mystery", 3));
    expect(r.provider).toBe("mock");
    expect(r.fallbackUsed).toBe(false);
    expect(r.title).toBe(SCENES.mystery[1].title);
  });

  it("live: validated model scene is used", async () => {
    live();
    h.anthropicCreate.mockResolvedValue(
      toolUse({
        title: "The Cake Has Opinions",
        text: "The collapsed cake begins to whisper the names of suspects, and the room freezes. Detective, whose name do you chase?",
        narratorOptions: ["The detective chases the first name it whispers", "Everyone tries to quiet the cake at once", "The cake offers a deal in exchange for frosting"],
      }),
    );
    const r = await generatePrompt(pin("mystery", 3));
    expect(r.provider).toBe("anthropic");
    expect(r.title).toBe("The Cake Has Opinions");
    expect(r.narratorOptions).toHaveLength(3);
  });

  it("live: an unsafe title falls back to the preset scene", async () => {
    live();
    h.anthropicCreate.mockResolvedValue(
      toolUse({
        title: "A badword scene",
        text: "Something happens and everyone must decide what to do next, right now.",
        narratorOptions: ["Everyone runs to the left side", "Everyone runs to the right side", "Everyone stays exactly where they are"],
      }),
    );
    const r = await generatePrompt(pin("mystery", 3));
    expect(r.provider).toBe("preset");
    expect(r.title).toBe(SCENES.mystery[1].title);
  });

  it("live: near-identical narrator options are repaired once per model, then replaced by the preset scene", async () => {
    live();
    h.anthropicCreate.mockResolvedValue(
      toolUse({
        title: "The Door Opens",
        text: "A door swings open on its own and everyone looks at you to decide what happens next.",
        narratorOptions: ["Everyone walks through the door", "Everyone walks through the door!", "Everyone walks through the doors"],
      }),
    );
    const r = await generatePrompt(pin("custom", 2));
    expect(r.provider).toBe("preset");
    // Smart model and fast model each get one answer plus one repair.
    expect(h.anthropicCreate).toHaveBeenCalledTimes(4);
  });

  it("live: provider failure gives the preset scene immediately", async () => {
    live();
    h.anthropicCreate.mockRejectedValue(new Error("down"));
    const r = await generatePrompt(pin("heist", 4));
    expect(r.title).toBe(SCENES.heist[2].title);
    expect(r.fallbackUsed).toBe(true);
  });
});

describe("finale", () => {
  const fin = { premise: "A heist.", title: "The Great Aurelia Caper", beats: ["The crew entered.", "Lasers were danced.", "The diamond was a cube"], winningLabels: ["a", "b", "c"] };

  it("fallback joins the beats and keeps the host's title", () => {
    const f = fallbackFinale(fin);
    expect(f.recap).toBe("The crew entered. Lasers were danced. The diamond was a cube.");
    expect(f.storyTitle).toBe("The Great Aurelia Caper");
    expect(f.tagline.length).toBeLessThanOrEqual(80);
  });

  it("mock mode returns the fallback without flagging it", async () => {
    const r = await generateFinale(fin);
    expect(r.provider).toBe("mock");
    expect(r.fallbackUsed).toBe(false);
    expect(r.recap).toContain("Lasers were danced");
  });

  it("live: valid output is used", async () => {
    live();
    h.anthropicCreate.mockResolvedValue(toolUse({ storyTitle: "The Cube Heist", recap: words(140), tagline: "Everybody wrote this one." }));
    const r = await generateFinale(fin);
    expect(r.provider).toBe("anthropic");
    expect(r.storyTitle).toBe("The Cube Heist");
    expect(r.recap.split(/\s+/)).toHaveLength(140);
  });

  it("live: unsafe text or provider failure falls back to the joined beats", async () => {
    live();
    h.anthropicCreate.mockResolvedValue(toolUse({ storyTitle: "The badword Heist", recap: words(140), tagline: "Fine tagline here." }));
    const r = await generateFinale(fin);
    expect(r.provider).toBe("template");
    expect(r.storyTitle).toBe("The Great Aurelia Caper");
    expect(r.recap).toContain("Lasers were danced");

    h.anthropicCreate.mockReset();
    h.anthropicCreate.mockRejectedValue(new Error("down"));
    const r2 = await generateFinale(fin);
    expect(r2.provider).toBe("template");
    expect(r2.fallbackUsed).toBe(true);
  });

  it("live: a recap far outside 120-180 words is repaired once per model then replaced", async () => {
    live();
    h.anthropicCreate.mockResolvedValue(toolUse({ storyTitle: "Short Story Title", recap: words(30), tagline: "A short tagline here." }));
    const r = await generateFinale(fin);
    expect(h.anthropicCreate).toHaveBeenCalledTimes(4);
    expect(r.provider).toBe("template");
  });
});

describe("safety helpers", () => {
  it("safeLabel enforces 8-70 chars, no emoji, no question, filter", () => {
    expect(safeLabel("The crew slips in")).toBe("The crew slips in");
    expect(safeLabel("Too short")).toBe("Too short");
    expect(safeLabel("short")).toBeNull();
    expect(safeLabel("x".repeat(71))).toBeNull();
    expect(safeLabel("A lovely plan \u{1F600} appears")).toBeNull();
    expect(safeLabel("Does anyone know the way?")).toBeNull();
    expect(safeLabel("A badword appears in the hall")).toBeNull();
  });
  it("safeText caps length and removes @mentions", () => {
    expect(safeText("Hello @bob and  friends", 50)).toBe("Hello and friends");
    expect(safeText("x".repeat(51), 50)).toBeNull();
    expect(safeText("nastything inside", 50)).toBeNull();
  });
});
