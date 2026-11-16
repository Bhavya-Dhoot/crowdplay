// FEATURE_MULTILINGUAL, server side (F7, AI_PROMPTS §9): buildPublicState fills state.i18n for the players'
// other languages, one batched translateBundle call per content version, and a publish never waits for it.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TranslateInput } from "@/lib/ai/translate";
import { resetConfig } from "@/lib/config";
import { useTestDb, type Db } from "@/lib/db/client";
import { resetEngineSingletons, setEngineClock, settleEffects } from "@/lib/engine/advance";
import { settlePendingEffects } from "@/lib/engine/effects";
import type { I18nBundle } from "@/lib/realtime/types";
import { ai, botCalls, makeUser, rt } from "./engine-harness";
import { getState, hostAct, installClock, joinAs, newShow, stormIdeas, tickToDeadline, type Show } from "./engine-flow";

const tr = vi.hoisted(() => {
  const t = {
    calls: [] as { input: TranslateInput; langs: string[] }[],
    mode: "ok" as "ok" | "throw" | "hang" | "empty" | "defer",
    release: (() => {}) as () => void,
    gate: Promise.resolve() as Promise<void>,
    hold() {
      this.gate = new Promise<void>((resolve) => (this.release = resolve));
    },
    reset() {
      this.calls.length = 0;
      this.mode = "ok";
      this.release = () => {};
      this.gate = Promise.resolve();
    },
  };
  return t;
});

vi.mock("@/lib/ai/translate", () => ({
  translateBundle: async (input: TranslateInput, langs: string[]) => {
    tr.calls.push({ input: structuredClone(input), langs: [...langs] });
    if (tr.mode === "throw") throw new Error("translator down");
    if (tr.mode === "hang") return new Promise<Record<string, I18nBundle>>(() => {});
    if (tr.mode === "empty") return {};
    if (tr.mode === "defer") await tr.gate;
    const out: Record<string, I18nBundle> = {};
    for (const l of langs) {
      const b: I18nBundle = {};
      if (input.prompt) b.prompt = { title: `[${l}] ${input.prompt.title}`, text: `[${l}] ${input.prompt.text}` };
      if (input.options) b.options = Object.fromEntries(Object.entries(input.options).map(([id, label]) => [id, `[${l}] ${label}`]));
      if (input.narration) b.narration = `[${l}] ${input.narration}`;
      out[l] = b;
    }
    return out;
  },
}));
vi.mock("@/lib/realtime/index", async () => (await import("./engine-harness")).realtimeModule());
vi.mock("@/lib/ai/distill", async () => (await import("./engine-harness")).distillModule());
vi.mock("@/lib/ai/narrate", async () => (await import("./engine-harness")).narrateModule());
vi.mock("@/lib/ai/prompts", async () => (await import("./engine-harness")).promptsModule());
vi.mock("@/lib/ai/finale", async () => (await import("./engine-harness")).finaleModule());
vi.mock("@/lib/bots/runner", async () => (await import("./engine-harness")).botsModule());
vi.mock("@/lib/presets", async () => (await import("./engine-harness")).presetsModule());

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await useTestDb());
});
afterAll(async () => {
  resetEngineSingletons();
  setEngineClock(null);
  await close();
});

const savedFlag = process.env.FEATURE_MULTILINGUAL;
function setFlag(on: boolean): void {
  if (on) process.env.FEATURE_MULTILINGUAL = "1";
  else delete process.env.FEATURE_MULTILINGUAL;
  resetConfig();
}
beforeEach(() => {
  resetEngineSingletons(); // also drops the translation cache
  rt.reset();
  ai.reset();
  tr.reset();
  botCalls.starts.length = 0;
  botCalls.votes.length = 0;
  installClock();
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.FEATURE_MULTILINGUAL;
  else process.env.FEATURE_MULTILINGUAL = savedFlag;
  resetConfig();
});

/** A show whose players joined with the given languages (the show language is "en"); padded with English players up to the 3 the idea fixtures need. */
async function showWith(langs: string[]): Promise<Show> {
  const all = [...langs, ...Array<string>(Math.max(0, 3 - langs.length)).fill("en")];
  const s = await newShow({ autoAdvance: true, names: all.map((_, i) => `Player${i + 1}`), join: false });
  for (const [i, p] of s.players.entries()) expect((await joinAs(s.code, p, { lang: all[i] })).status).toBe(200);
  await settleEffects(); // the joins' coalesced stats publishes go out now, in LOBBY
  return s;
}

/** PROMPT -> STORM -> DISTILL -> VOTE with a few ideas; leaves the room in VOTE. */
async function playToVote(s: Show, opts: { settle: boolean } = { settle: true }): Promise<void> {
  await tickToDeadline(s.roomId);
  await stormIdeas(s, 1);
  await tickToDeadline(s.roomId);
  if (opts.settle) await settleEffects();
  else await settlePendingEffects();
}

const published = (phase: string) => rt.states.map((p) => p.state).filter((st) => st.phase === phase);
const bundle = (lang: string, st: { i18n?: Record<string, I18nBundle> }): I18nBundle | undefined => st.i18n?.[lang];

describe("flag off", () => {
  it("never calls translateBundle and never puts i18n on a state, whatever languages the players picked", async () => {
    setFlag(false);
    const s = await showWith(["es", "hi", "en"]);
    await hostAct(s, { action: "start" });
    await playToVote(s);

    expect((await getState(s)).phase).toBe("VOTE");
    expect(rt.states.length).toBeGreaterThanOrEqual(4); // PROMPT, STORM, DISTILL, VOTE
    expect(rt.states.every((p) => p.state.i18n === undefined)).toBe(true);
    expect((await getState(s)).i18n).toBeUndefined();
    expect(tr.calls).toHaveLength(0);
  });
});

describe("flag on", () => {
  beforeEach(() => setFlag(true));

  it("publishes without i18n first, then re-publishes (new version) with the bundle for the players' other languages", async () => {
    // es + es-MX share one short code; en-GB is the show language; so the languages are es (2 players) and hi.
    const s = await showWith(["es", "es-MX", "hi", "en-GB"]);
    await hostAct(s, { action: "start" });
    await settleEffects();

    expect(tr.calls).toHaveLength(1);
    expect(tr.calls[0].langs).toEqual(["es", "hi"]);
    expect(tr.calls[0].input.prompt?.title).toBe("Opening: heist");
    expect(tr.calls[0].input.options).toBeUndefined();

    const prompts = published("PROMPT");
    expect(prompts.length).toBeGreaterThanOrEqual(2);
    const first = prompts[0];
    const last = prompts.at(-1)!;
    expect(first.i18n).toBeUndefined(); // the first publish did not wait for the translator
    expect(last.v).toBeGreaterThan(first.v);
    expect(Object.keys(last.i18n ?? {}).sort()).toEqual(["es", "hi"]);
    expect(bundle("es", last)?.prompt?.title).toBe("[es] Opening: heist");
    expect(bundle("hi", last)?.prompt?.text).toBe(`[hi] ${last.prompt?.text}`);
    expect(last.i18n).not.toHaveProperty("en");
    // i18n has no Open Channel metadata key: it rides in the CP:State message, which phaseChanged asks the transport to send.
    expect(rt.states.filter((p) => p.state.i18n).every((p) => p.phaseChanged)).toBe(true);

    // A reader (GET /state) gets the cached bundle straight away.
    expect(bundle("es", await getState(s))?.prompt?.title).toBe("[es] Opening: heist");
  });

  it("translates each content version once: prompt, then the ballot, then the narration", async () => {
    const s = await showWith(["es", "hi"]);
    await hostAct(s, { action: "start" });
    await settleEffects();
    await playToVote(s);
    expect(tr.calls).toHaveLength(2); // STORM and DISTILL show the same prompt, so no new call

    const vote = await getState(s);
    expect(vote.phase).toBe("VOTE");
    expect(tr.calls[1].input.options).toEqual(Object.fromEntries((vote.options ?? []).map((o) => [o.id, o.label])));
    for (const o of vote.options ?? []) expect(bundle("es", vote)?.options?.[o.id]).toBe(`[es] ${o.label}`);
    expect(bundle("es", vote)?.prompt).toBeDefined(); // the prompt is still translated alongside the options

    await tickToDeadline(s.roomId); // VOTE -> REVEAL: narration arrives
    await settleEffects();
    const reveal = await getState(s);
    expect(reveal.phase).toBe("REVEAL");
    expect(reveal.outcome?.narration).toBeTruthy();
    expect(tr.calls).toHaveLength(3);
    expect(tr.calls[2].input.narration).toBe(reveal.outcome?.narration);
    expect(bundle("hi", reveal)?.narration).toBe(`[hi] ${reveal.outcome?.narration}`);
    expect(published("REVEAL").at(-1)?.i18n?.hi?.narration).toBe(`[hi] ${reveal.outcome?.narration}`);
  });

  it("keeps what is still valid while the next version translates (no flicker back to the original prompt)", async () => {
    const s = await showWith(["es"]);
    await hostAct(s, { action: "start" });
    await settleEffects();

    tr.mode = "defer";
    tr.hold();
    await playToVote(s, { settle: false });
    const pending = await getState(s);
    expect(pending.phase).toBe("VOTE");
    expect(bundle("es", pending)?.prompt?.title).toBe("[es] Opening: heist");
    expect(bundle("es", pending)?.options).toBeUndefined();
    expect(published("VOTE").at(-1)?.i18n?.es?.options).toBeUndefined();

    tr.release();
    await settleEffects();
    expect(Object.keys(bundle("es", await getState(s))?.options ?? {})).toHaveLength(3);
  });

  it("translates a language that joins later (one more call for the new language set)", async () => {
    const s = await showWith(["es"]);
    await hostAct(s, { action: "start" });
    await settleEffects();
    expect(tr.calls.map((c) => c.langs)).toEqual([["es"]]);

    const late = await makeUser(db, "Latecomer");
    expect((await joinAs(s.code, late, { lang: "fr-FR" })).status).toBe(200);
    await settleEffects();
    expect(tr.calls.map((c) => c.langs)).toEqual([["es"], ["es", "fr"]]);
    expect(Object.keys((await getState(s)).i18n ?? {}).sort()).toEqual(["es", "fr"]);
  });

  it("asks for at most 6 languages, the most common first", async () => {
    const s = await showWith(["pt", "ja", "ko", "de", "fr", "it", "es", "es", "hi"]);
    await hostAct(s, { action: "start" });
    await settleEffects();
    expect(tr.calls).toHaveLength(1);
    expect(tr.calls[0].langs).toEqual(["es", "de", "fr", "hi", "it", "ja"]);
  });

  it("does nothing when every player speaks the show language", async () => {
    const s = await showWith(["en", "en-US"]);
    await hostAct(s, { action: "start" });
    await settleEffects();
    expect(tr.calls).toHaveLength(0);
    expect(rt.states.every((p) => p.state.i18n === undefined)).toBe(true);
  });
});

describe("translation failure leaves the state alone", () => {
  beforeEach(() => setFlag(true));

  it("a throwing translator: no i18n, no extra publish, the show plays on", async () => {
    tr.mode = "throw";
    const s = await showWith(["es", "hi"]);
    await hostAct(s, { action: "start" });
    await settleEffects();
    const afterStart = rt.states.length;
    await playToVote(s);

    expect(tr.calls.length).toBeGreaterThan(0);
    const st = await getState(s);
    expect(st.phase).toBe("VOTE");
    expect(st.options).toHaveLength(3);
    expect(st.i18n).toBeUndefined();
    expect(rt.states.every((p) => p.state.i18n === undefined)).toBe(true);
    expect(rt.states.length).toBeGreaterThan(afterStart); // phases kept publishing
  });

  it("an empty answer is not retried on every publish", async () => {
    tr.mode = "empty";
    const s = await showWith(["es"]);
    await hostAct(s, { action: "start" });
    await settleEffects();
    expect(tr.calls).toHaveLength(1);
    await getState(s);
    await getState(s);
    await settleEffects();
    expect(tr.calls).toHaveLength(1);
    expect((await getState(s)).i18n).toBeUndefined();
  });

  it("a translator that never answers: the publish is immediate, and after the 3 s cap the state is still without i18n", async () => {
    tr.mode = "hang";
    const s = await showWith(["es"]);
    const t0 = Date.now();
    const started = await hostAct(s, { action: "start" });
    expect(Date.now() - t0).toBeLessThan(2500);
    expect(started.body.state.phase).toBe("PROMPT");
    expect(started.body.state.i18n).toBeUndefined();
    expect(published("PROMPT")).toHaveLength(1); // out before the translator gave up
    expect(tr.calls).toHaveLength(1);

    await settleEffects(); // waits for the 3 s timeout
    expect(published("PROMPT")).toHaveLength(1);
    expect((await getState(s)).i18n).toBeUndefined();
    expect((await getState(s)).phase).toBe("PROMPT");
  });
});
