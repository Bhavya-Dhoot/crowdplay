import { rm } from "node:fs/promises";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ anthropicCreate: vi.fn(), openaiSpeech: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: h.anthropicCreate };
  },
}));
vi.mock("openai", () => ({
  default: class {
    audio = { speech: { create: h.openaiSpeech } };
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

import { GET } from "@/app/api/tts/[id]/route";
import { resetConfig } from "@/lib/config";
import { synthesize, ttsFile } from "@/lib/ai/tts";
import { translateBundle } from "@/lib/ai/translate";

const KEYS = [
  "LLM_MODE",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_TTS_MODEL",
  "OPENAI_TTS_VOICE",
  "FEATURE_TTS",
  "FEATURE_MULTILINGUAL",
] as const;
const saved: Record<string, string | undefined> = {};
function setEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) {
    if (!(k in saved)) saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, env);
  resetConfig();
}
beforeEach(() => {
  h.anthropicCreate.mockReset();
  h.openaiSpeech.mockReset();
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetConfig();
});

const written: string[] = [];
afterAll(async () => {
  for (const id of written) await rm(ttsFile(id), { force: true });
});

const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const speech = () => ({ arrayBuffer: async () => MP3.buffer.slice(MP3.byteOffset, MP3.byteOffset + MP3.byteLength) });

describe("TTS (FEATURE_TTS)", () => {
  const on = { LLM_MODE: "live", OPENAI_API_KEY: "o", OPENAI_TTS_MODEL: "tts-model", FEATURE_TTS: "1" } as const;

  it("flag off: returns null and never calls OpenAI, even when everything else is configured", async () => {
    setEnv({ LLM_MODE: "live", OPENAI_API_KEY: "o", OPENAI_TTS_MODEL: "tts-model" });
    expect(await synthesize("The crew slips in.")).toBeNull();
    expect(h.openaiSpeech).not.toHaveBeenCalled();
  });

  it("mock mode, missing key or missing model: null", async () => {
    setEnv({ ...on, LLM_MODE: "mock" });
    expect(await synthesize("hello")).toBeNull();
    setEnv({ ...on, OPENAI_API_KEY: "" });
    expect(await synthesize("hello")).toBeNull();
    setEnv({ ...on, OPENAI_TTS_MODEL: "" });
    expect(await synthesize("hello")).toBeNull();
    expect(h.openaiSpeech).not.toHaveBeenCalled();
  });

  it("flag on: writes an mp3 once, returns its URL, serves it, and reuses it for the same text", async () => {
    setEnv({ ...on, OPENAI_TTS_VOICE: "verse" });
    h.openaiSpeech.mockResolvedValue(speech());
    const url = await synthesize("The crew dances through the lasers one by one.");
    expect(url).toMatch(/^\/api\/tts\/[a-f0-9]{32}$/);
    const id = url!.split("/").pop()!;
    written.push(id);
    const [p] = h.openaiSpeech.mock.calls[0] as [{ model: string; voice: string; input: string; response_format: string }];
    expect(p).toMatchObject({ model: "tts-model", voice: "verse", response_format: "mp3" });

    expect(await synthesize("The crew dances through the lasers one by one.")).toBe(url);
    expect(h.openaiSpeech).toHaveBeenCalledTimes(1);

    const res = await GET(new Request(`http://localhost${url}`), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("content-length")).toBe(String(MP3.length));
    expect(Buffer.from(await res.arrayBuffer())).toEqual(MP3);

    const part = await GET(new Request(`http://localhost${url}`, { headers: { range: "bytes=2-5" } }), { params: Promise.resolve({ id }) });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 2-5/${MP3.length}`);
    expect(Buffer.from(await part.arrayBuffer())).toEqual(MP3.subarray(2, 6));

    const bad = await GET(new Request(`http://localhost${url}`, { headers: { range: "bytes=500-600" } }), { params: Promise.resolve({ id }) });
    expect(bad.status).toBe(416);
  });

  it("flag on but OpenAI fails: null, no exception", async () => {
    setEnv(on);
    h.openaiSpeech.mockRejectedValue(new Error("tts down"));
    expect(await synthesize("A line that will not be voiced.")).toBeNull();
  });

  it.each(["../secret", "abc", "A".repeat(32), "g".repeat(32), "0".repeat(31), "0".repeat(33), "..%2f..%2fetc"])(
    "route rejects id %j with 404",
    async (id) => {
      const res = await GET(new Request("http://localhost/api/tts/x"), { params: Promise.resolve({ id }) });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ ok: false, code: "NOT_FOUND" });
    },
  );

  it("route returns 404 for a well-formed id with no file", async () => {
    const res = await GET(new Request("http://localhost/api/tts/x"), { params: Promise.resolve({ id: "f".repeat(32) }) });
    expect(res.status).toBe(404);
  });
});

describe("translateBundle (FEATURE_MULTILINGUAL)", () => {
  const input = {
    prompt: { title: "The Vault Door Hums", text: "Ninety seconds. How do we get in?" },
    options: { opt1: "The crew slips in through the vents", opt2: "A loud distraction empties the lobby" },
    narration: "The crew dances through the lasers.",
  };
  const on = { LLM_MODE: "live", ANTHROPIC_API_KEY: "k", FEATURE_MULTILINGUAL: "1" } as const;
  const answer = (translations: unknown[]) => ({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "t", name: "submit_result", input: { translations } }],
    usage: {},
  });

  it("flag off: {} and no model call", async () => {
    setEnv({ LLM_MODE: "live", ANTHROPIC_API_KEY: "k" });
    expect(await translateBundle(input, ["es", "fr"])).toEqual({});
    expect(h.anthropicCreate).not.toHaveBeenCalled();
  });

  it("flag on in mock mode: {} and no model call", async () => {
    setEnv({ ...on, LLM_MODE: "mock" });
    expect(await translateBundle(input, ["es"])).toEqual({});
    expect(h.anthropicCreate).not.toHaveBeenCalled();
  });

  it("flag on: one batched fast-model call; unrequested languages, bad option ids and unsafe text are dropped", async () => {
    setEnv(on);
    h.anthropicCreate.mockResolvedValue(
      answer([
        {
          lang: "es",
          promptTitle: "La puerta de la boveda zumba",
          promptText: "Noventa segundos. Como entramos?",
          narration: "La tripulacion baila entre los lasers.",
          options: [
            { id: "opt1", label: "La tripulacion entra por los conductos" },
            { id: "ghost", label: "Una opcion que no existe" },
            { id: "opt2", label: "Una distraccion enorme vacia el vestibulo" },
          ],
        },
        { lang: "fr", promptTitle: "badword", promptText: "badword", narration: "badword", options: [{ id: "opt1", label: "badword" }] },
        { lang: "de", narration: "Nicht angefordert", options: [] },
      ]),
    );
    const out = await translateBundle(input, ["es", "fr"]);
    expect(h.anthropicCreate).toHaveBeenCalledTimes(1);
    expect((h.anthropicCreate.mock.calls[0][0] as { model: string }).model).toBe("claude-haiku-5-5");
    expect(Object.keys(out)).toEqual(["es"]);
    expect(out.es.prompt).toEqual({ title: "La puerta de la boveda zumba", text: "Noventa segundos. Como entramos?" });
    expect(out.es.options).toEqual({
      opt1: "La tripulacion entra por los conductos",
      opt2: "Una distraccion enorme vacia el vestibulo",
    });
    expect(out.es.narration).toBe("La tripulacion baila entre los lasers.");
  });

  it("caps the languages at six and ignores malformed codes", async () => {
    setEnv(on);
    h.anthropicCreate.mockResolvedValue(answer([]));
    await translateBundle(input, ["es", "fr", "de", "it", "pt", "ja", "ko", "zh", "not a lang", "EN-us!"]);
    const user = (h.anthropicCreate.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content;
    expect(JSON.parse(user).languages).toEqual(["es", "fr", "de", "it", "pt", "ja"]);
  });

  it("provider failure or timeout: {} so players see the original", async () => {
    setEnv(on);
    h.anthropicCreate.mockRejectedValue(new Error("down"));
    expect(await translateBundle(input, ["es"])).toEqual({});
    h.anthropicCreate.mockReset();
    h.anthropicCreate.mockImplementation(() => new Promise(() => {}));
    const t0 = Date.now();
    expect(await translateBundle(input, ["es"])).toEqual({});
    expect(Date.now() - t0).toBeLessThan(3600);
  }, 10_000);

  it("nothing to translate or no languages: {} without a call", async () => {
    setEnv(on);
    expect(await translateBundle({}, ["es"])).toEqual({});
    expect(await translateBundle(input, [])).toEqual({});
    expect(h.anthropicCreate).not.toHaveBeenCalled();
  });
});
