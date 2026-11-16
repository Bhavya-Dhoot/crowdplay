import { z } from "zod";

// Server-side configuration. Never import this from client components: it reads secrets.
// Client code gets what it needs (App Key, area, flags, realtime mode) from API responses.

const flag = z
  .enum(["0", "1", "true", "false"])
  .default("0")
  .transform((v) => v === "1" || v === "true");
const ms = (d: number) => z.coerce.number().int().positive().default(d);
const optional = z.string().min(1).optional();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PHASE: z.string().optional(),

  REALTIME_MODE: z.enum(["nexconn", "mock"]).default("mock"),
  LLM_MODE: z.enum(["live", "mock"]).default("mock"),
  INGEST_MODE: z.enum(["dual", "webhook", "post"]).default("dual"),
  ALLOW_MOCK_IN_PROD: flag,

  NEXCONN_APP_KEY: optional,
  NEXCONN_APP_SECRET: optional,
  NEXCONN_PRIMARY_API_DOMAIN: optional,
  NEXCONN_SECONDARY_API_DOMAIN: optional,
  NEXT_PUBLIC_NEXCONN_APP_KEY: optional,
  NEXT_PUBLIC_NEXCONN_AREA: optional,
  NEXCONN_WEBHOOK_SECRET: optional,

  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_FAST_MODEL: z.string().default("claude-haiku-5-5"),
  ANTHROPIC_SMART_MODEL: z.string().default("claude-sonnet-5-5"),
  OPENAI_API_KEY: optional,
  OPENAI_EMBED_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_FAST_MODEL: optional,
  OPENAI_TTS_MODEL: optional,
  OPENAI_TTS_VOICE: optional,

  APP_URL: z.string().default("http://localhost:3000"),
  SESSION_SECRET: optional,
  ADMIN_TOKEN: optional,
  DATABASE_URL: optional,
  PGLITE_DIR: z.string().default("./.data/pglite"),

  FEATURE_TTS: flag,
  FEATURE_MULTILINGUAL: flag,
  FEATURE_CHEERS: z
    .enum(["0", "1", "true", "false"])
    .default("1")
    .transform((v) => v === "1" || v === "true"),

  PROMPT_MS: ms(6000),
  STORM_MS: ms(30000),
  VOTE_MS: ms(12000),
  REVEAL_MS: ms(12000),
  DISTILL_BUDGET_MS: ms(8000),
  DISTILL_HARD_CAP_MS: ms(10000),
  ROOM_PLAYER_CAP: z.coerce.number().int().positive().default(450),
  // Test/demo knob: multiplies every phase duration (e.g. 0.2 in e2e). Never set in production.
  TIMING_SCALE: z.coerce.number().positive().max(1).default(1),
});

export type Env = z.infer<typeof EnvSchema>;

function readEnv(): Env {
  // Treat empty strings (KEY= in .env) as unset.
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string" && v.trim() !== "") raw[k] = v.trim();
  }
  return EnvSchema.parse(raw);
}

const g = globalThis as unknown as { __cpEnv?: Env };

/** Parsed env. Re-read in tests via resetConfig(). */
export function env(): Env {
  if (!g.__cpEnv) g.__cpEnv = readEnv();
  return g.__cpEnv;
}

export function resetConfig(): void {
  g.__cpEnv = undefined;
}

export type Features = { tts: boolean; multilingual: boolean; cheers: boolean };

export function features(): Features {
  const e = env();
  return { tts: e.FEATURE_TTS, multilingual: e.FEATURE_MULTILINGUAL, cheers: e.FEATURE_CHEERS };
}

export type DefaultTimings = {
  promptMs: number;
  stormMs: number;
  voteMs: number;
  revealMs: number;
  distillCapMs: number;
};

/** Default phase durations with TIMING_SCALE applied. Per-show storm/vote values override these. */
export function defaultTimings(): DefaultTimings {
  const e = env();
  const s = (n: number) => Math.max(1000, Math.round(n * e.TIMING_SCALE));
  return {
    promptMs: s(e.PROMPT_MS),
    stormMs: s(e.STORM_MS),
    voteMs: s(e.VOTE_MS),
    revealMs: s(e.REVEAL_MS),
    distillCapMs: s(e.DISTILL_HARD_CAP_MS),
  };
}

/** Scale a host-chosen duration by TIMING_SCALE (1 in production). */
export function scaled(msValue: number): number {
  return Math.max(1000, Math.round(msValue * env().TIMING_SCALE));
}

export function isLiveLlm(): boolean {
  const e = env();
  return e.LLM_MODE === "live" && Boolean(e.ANTHROPIC_API_KEY || e.OPENAI_API_KEY);
}

/**
 * Hard rule: production never runs on the mock transport by accident.
 * Called from instrumentation.ts at server start (not during `next build`).
 */
export function assertBootable(): void {
  const e = env();
  if (e.NEXT_PHASE === "phase-production-build") return;
  if (e.NODE_ENV === "production" && e.REALTIME_MODE === "mock" && !e.ALLOW_MOCK_IN_PROD) {
    throw new Error(
      "Refusing to start: REALTIME_MODE=mock in production. Set REALTIME_MODE=nexconn " +
        "(or ALLOW_MOCK_IN_PROD=1 for a local production test only).",
    );
  }
  if (e.REALTIME_MODE === "nexconn") {
    const missing = [
      "NEXCONN_APP_KEY",
      "NEXCONN_APP_SECRET",
      "NEXCONN_PRIMARY_API_DOMAIN",
      "NEXCONN_SECONDARY_API_DOMAIN",
    ].filter((k) => !e[k as keyof Env]);
    if (missing.length) throw new Error(`REALTIME_MODE=nexconn needs ${missing.join(", ")}`);
  }
  if (e.NODE_ENV === "production" && !e.SESSION_SECRET && !e.ALLOW_MOCK_IN_PROD) {
    throw new Error("SESSION_SECRET is required in production (32+ random chars).");
  }
}

/** HMAC secret for session JWTs. Dev/test fall back to a fixed, non-secret value. */
export function sessionSecret(): Uint8Array {
  const s = env().SESSION_SECRET ?? "crowdplay-dev-only-session-secret-not-for-prod";
  return new TextEncoder().encode(s);
}
