// Narrator voice (FEATURE_TTS only): OpenAI TTS -> mp3 under ./.data/tts/<id>.mp3, served by
// /api/tts/<id>. Returns null whenever audio is not available; the screen simply stays silent.
import { createHash } from "node:crypto";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, features } from "@/lib/config";
import { log } from "@/lib/log";
import { openaiClient, raceTimeout } from "./providers";

const TTS_TIMEOUT_MS = 6000;
const MAX_INPUT = 4096;

export const TTS_ID_RE = /^[a-f0-9]{32}$/;

export function ttsDir(): string {
  return path.resolve(process.cwd(), ".data", "tts");
}

export function ttsFile(id: string): string {
  return path.join(ttsDir(), `${id}.mp3`);
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Narration -> `/api/tts/<id>`, or null (flag off, mock mode, no key/model, or any error). */
export async function synthesize(text: string): Promise<string | null> {
  if (!features().tts) return null;
  const e = env();
  if (e.LLM_MODE !== "live" || !e.OPENAI_API_KEY || !e.OPENAI_TTS_MODEL) return null;
  const input = text.trim().slice(0, MAX_INPUT);
  if (!input) return null;

  const voice = e.OPENAI_TTS_VOICE ?? "alloy";
  const id = createHash("sha256").update(`${e.OPENAI_TTS_MODEL}\n${voice}\n${input}`).digest("hex").slice(0, 32);
  const url = `/api/tts/${id}`;
  try {
    if (await exists(ttsFile(id))) return url;
    const ac = new AbortController();
    const res = await raceTimeout(
      openaiClient().audio.speech.create(
        { model: e.OPENAI_TTS_MODEL, voice, input, response_format: "mp3" },
        { signal: ac.signal },
      ),
      TTS_TIMEOUT_MS,
      ac,
      "openai:tts",
    );
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0) return null;
    await mkdir(ttsDir(), { recursive: true });
    // Write then rename so a request never sees a half-written file.
    const tmp = `${ttsFile(id)}.${process.pid}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, ttsFile(id));
    return url;
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "tts failed; narration stays silent");
    return null;
  }
}
