// Multilingual mode (FEATURE_MULTILINGUAL): one batched fast-model call (3 s) translates the prompt,
// options and narration into the other active languages. Any failure returns {} and players see
// the original text.
import { z } from "zod";
import { features } from "@/lib/config";
import { log } from "@/lib/log";
import type { I18nBundle } from "../realtime/types";
import { callChain, llmLive } from "./providers";
import { safeText } from "./safety";

export type TranslateInput = {
  prompt?: { title: string; text: string };
  /** optionId -> label */
  options?: Record<string, string>;
  narration?: string;
};

const MAX_LANGS = 6;
const LANG_RE = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;

const OutSchema = z.object({
  translations: z.array(
    z.object({
      lang: z.string(),
      promptTitle: z.string().optional(),
      promptText: z.string().optional(),
      narration: z.string().optional(),
      options: z.array(z.object({ id: z.string(), label: z.string() })),
    }),
  ),
});

const SYSTEM = `You translate short pieces of a live story game for several audiences at once.
Translate every provided field into each requested language code, keeping the meaning, tone and length.
Keep option ids exactly as given. Do not add or remove content. Return only the JSON object required by the schema.`;

export async function translateBundle(input: TranslateInput, langs: string[]): Promise<Record<string, I18nBundle>> {
  if (!features().multilingual || !llmLive()) return {};
  const wanted = [...new Set(langs.filter((l) => LANG_RE.test(l)))].slice(0, MAX_LANGS);
  if (wanted.length === 0) return {};
  if (!input.prompt && !input.narration && !Object.keys(input.options ?? {}).length) return {};

  const payload = {
    languages: wanted,
    prompt: input.prompt ?? null,
    options: Object.entries(input.options ?? {}).map(([id, label]) => ({ id, label })),
    narration: input.narration ?? null,
  };
  try {
    const r = await callChain([{ role: "fast", timeoutMs: 3000 }], 3000, {
      system: SYSTEM,
      user: JSON.stringify(payload),
      schema: OutSchema,
      name: "translate",
      maxTokens: 2000,
    });
    const out: Record<string, I18nBundle> = {};
    for (const t of r.data.translations) {
      if (!wanted.includes(t.lang)) continue;
      const bundle: I18nBundle = {};
      const title = t.promptTitle ? safeText(t.promptTitle, 120) : null;
      const text = t.promptText ? safeText(t.promptText, 600) : null;
      if (input.prompt && title && text) bundle.prompt = { title, text };
      const labels: Record<string, string> = {};
      for (const o of t.options) {
        const label = safeText(o.label, 200);
        if (label && input.options && Object.hasOwn(input.options, o.id)) labels[o.id] = label;
      }
      if (Object.keys(labels).length > 0) bundle.options = labels;
      const narration = t.narration ? safeText(t.narration, 2000) : null;
      if (input.narration && narration) bundle.narration = narration;
      if (Object.keys(bundle).length > 0) out[t.lang] = bundle;
    }
    return out;
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "translation failed; showing originals");
    return {};
  }
}
