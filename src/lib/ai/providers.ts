// LLM access: one JSON-returning call with timeouts, zod validation and a single repair retry.
// LLM_MODE=mock (or no usable key) means availableProviders() is empty and callJSON throws before
// any SDK is constructed, so mock mode can never reach the network.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { env } from "@/lib/config";
import { log } from "@/lib/log";

export type LlmRole = "fast" | "smart";
export type LlmProvider = "anthropic" | "openai";

export type LlmErrorKind = "unavailable" | "timeout" | "http" | "refusal" | "invalid" | "empty";

export class LlmError extends Error {
  constructor(
    public readonly kind: LlmErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export type CallJSONArgs<T> = {
  role: LlmRole;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Wall-clock cap for the whole call, repair retry included. */
  timeoutMs: number;
  /** Label for logs and the OpenAI schema name. */
  name: string;
  /** Default: the first available provider (Anthropic, then OpenAI). */
  provider?: LlmProvider;
  maxTokens?: number;
  /** Rule check after zod. A returned problem triggers the single repair retry. */
  check?: (data: T) => string | null;
};

export type CallJSONResult<T> = { data: T; provider: LlmProvider; ms: number };

/** Providers usable right now. Empty unless LLM_MODE=live and the relevant keys/models exist. */
export function availableProviders(): LlmProvider[] {
  const e = env();
  if (e.LLM_MODE !== "live") return [];
  const out: LlmProvider[] = [];
  if (e.ANTHROPIC_API_KEY) out.push("anthropic");
  if (e.OPENAI_API_KEY && e.OPENAI_FAST_MODEL) out.push("openai");
  return out;
}

export const llmLive = (): boolean => availableProviders().length > 0;

export function modelFor(provider: LlmProvider, role: LlmRole): string {
  const e = env();
  if (provider === "anthropic") return role === "fast" ? e.ANTHROPIC_FAST_MODEL : e.ANTHROPIC_SMART_MODEL;
  return e.OPENAI_FAST_MODEL ?? "";
}

// ---------- clients ----------

let anthropicCache: { key: string; client: Anthropic } | null = null;
let openaiCache: { key: string; client: OpenAI } | null = null;

function anthropicClient(): Anthropic {
  const key = env().ANTHROPIC_API_KEY ?? "";
  if (!anthropicCache || anthropicCache.key !== key) {
    // Retries are ours to decide (they would eat the budget), so the SDK gets none.
    anthropicCache = { key, client: new Anthropic({ apiKey: key, maxRetries: 0 }) };
  }
  return anthropicCache.client;
}

export function openaiClient(): OpenAI {
  const key = env().OPENAI_API_KEY ?? "";
  if (!openaiCache || openaiCache.key !== key) {
    openaiCache = { key, client: new OpenAI({ apiKey: key, maxRetries: 0 }) };
  }
  return openaiCache.client;
}

// ---------- helpers ----------

/** Rejects after `ms` and aborts the request; never waits on an SDK that ignores the signal. */
export function raceTimeout<T>(p: Promise<T>, ms: number, ac: AbortController, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      ac.abort();
      reject(new LlmError("timeout", `${label} timed out after ${ms} ms`));
    }, Math.max(1, ms));
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(toLlmError(err, label));
      },
    );
  });
}

function toLlmError(err: unknown, label: string): LlmError {
  if (err instanceof LlmError) return err;
  const status = (err as { status?: number } | null)?.status;
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && err.name === "AbortError") return new LlmError("timeout", `${label} aborted`);
  return new LlmError("http", `${label}: ${msg}`, typeof status === "number" ? status : undefined);
}

type JsonSchema = Record<string, unknown>;

function toJsonSchema(schema: z.ZodType): JsonSchema {
  const js = z.toJSONSchema(schema) as JsonSchema;
  delete js.$schema;
  return js;
}

// OpenAI strict structured output rejects string length keywords; our own validators enforce them.
function forOpenAI(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forOpenAI);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "minLength" || k === "maxLength" || k === "minimum" || k === "maximum") continue;
      out[k] = forOpenAI(v);
    }
    return out;
  }
  return node;
}

const TOOL_NAME = "submit_result";

// OPENAI_REASONING_EFFORT: how hard gpt-5-family models think before answering. Unset = the parameter is not sent
// (the model's own default applies). Read from process.env because src/lib/config.ts is frozen (as MOCK_DISTILL_DELAY_MS).
const EFFORTS = new Set<string>(["none", "minimal", "low", "medium", "high", "xhigh"]);
const noReasoningEffort = new Set<string>(); // models that answered 400 to the parameter

/** The reasoning effort to send for this model, or undefined to omit the parameter. */
export function openaiReasoningEffort(model: string): OpenAI.ReasoningEffort | undefined {
  const v = process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  if (!v || !EFFORTS.has(v) || !/^gpt-5/i.test(model) || noReasoningEffort.has(model)) return undefined;
  return v as OpenAI.ReasoningEffort;
}

// Learned per model id from 400s, so an unexpected model id costs at most one extra round trip.
const noForcedTool = new Set<string>();
const noEffort = new Set<string>();

// Current Sonnet/Opus 5.5 reject a forced tool_choice; send "auto" plus an instruction instead.
const FORCED_TOOL_REJECTED = /(?:sonnet|opus|fable|mythos)-5-[1-9]|fable-5/;
const SUPPORTS_EFFORT = /(?:haiku|sonnet|opus|fable|mythos)-5/;

async function anthropicOnce(
  model: string,
  a: CallJSONArgs<unknown>,
  user: string,
  schema: JsonSchema,
  ms: number,
  retry = true,
): Promise<unknown> {
  const forced = !noForcedTool.has(model) && !FORCED_TOOL_REJECTED.test(model);
  const withEffort = !noEffort.has(model) && SUPPORTS_EFFORT.test(model);
  const ac = new AbortController();
  const started = Date.now();
  try {
    const res = await raceTimeout(
      anthropicClient().messages.create(
        {
          model,
          max_tokens: a.maxTokens ?? 1500,
          system: `${a.system}\n\nReturn the result by calling the ${TOOL_NAME} tool exactly once. Write no other text.`,
          messages: [{ role: "user", content: user }],
          tools: [
            {
              name: TOOL_NAME,
              description: "Submit the final structured result.",
              input_schema: schema as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: forced ? { type: "tool", name: TOOL_NAME } : { type: "auto" },
          ...(withEffort ? { output_config: { effort: "low" as const } } : {}),
        },
        { signal: ac.signal },
      ),
      ms,
      ac,
      `anthropic:${a.name}`,
    );
    if (res.stop_reason === "refusal") throw new LlmError("refusal", `anthropic:${a.name} refused`);
    if (res.stop_reason === "max_tokens") throw new LlmError("invalid", `anthropic:${a.name} hit max_tokens`);
    const block = res.content.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
    if (!block || block.type !== "tool_use") throw new LlmError("empty", `anthropic:${a.name} returned no tool call`);
    return block.input;
  } catch (err) {
    const e = toLlmError(err, `anthropic:${a.name}`);
    const left = ms - (Date.now() - started);
    if (retry && e.status === 400 && left > 800) {
      if (/tool_choice|forced tool|thinking/i.test(e.message) && forced) {
        noForcedTool.add(model);
        return anthropicOnce(model, a, user, schema, left, false);
      }
      if (/effort|output_config/i.test(e.message) && withEffort) {
        noEffort.add(model);
        return anthropicOnce(model, a, user, schema, left, false);
      }
    }
    throw e;
  }
}

async function openaiOnce(a: CallJSONArgs<unknown>, user: string, schema: JsonSchema, ms: number, retry = true): Promise<unknown> {
  const ac = new AbortController();
  const started = Date.now();
  const model = modelFor("openai", a.role);
  const effort = openaiReasoningEffort(model);
  let res: OpenAI.ChatCompletion;
  try {
    res = await raceTimeout(
      openaiClient().chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: a.system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: a.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "result",
              strict: true,
              schema: forOpenAI(schema) as JsonSchema,
            },
          },
          max_completion_tokens: a.maxTokens ?? 1500,
          ...(effort !== undefined ? { reasoning_effort: effort } : {}),
        },
        { signal: ac.signal },
      ),
      ms,
      ac,
      `openai:${a.name}`,
    );
  } catch (err) {
    // A model that rejects the parameter is remembered and retried once without it (like the Anthropic effort field).
    const left = ms - (Date.now() - started);
    if (retry && effort !== undefined && err instanceof LlmError && err.status === 400 && /reasoning|effort/i.test(err.message) && left > 800) {
      noReasoningEffort.add(model);
      return openaiOnce(a, user, schema, left, false);
    }
    throw err;
  }
  const msg = res.choices[0]?.message;
  if (msg?.refusal) throw new LlmError("refusal", `openai:${a.name} refused`);
  if (!msg?.content) throw new LlmError("empty", `openai:${a.name} returned no content`);
  try {
    return JSON.parse(msg.content);
  } catch {
    throw new LlmError("invalid", `openai:${a.name} returned non-JSON`);
  }
}

const REPAIR_MIN_MS = 1200;

/**
 * One validated JSON answer from one provider. Throws LlmError on any failure (callers fall back).
 * The repair retry runs only when the first answer arrived but failed validation and enough of the
 * time budget is left.
 */
export async function callJSON<T>(args: CallJSONArgs<T>): Promise<CallJSONResult<T>> {
  const avail = availableProviders();
  const provider = args.provider ?? avail[0];
  if (!provider || !avail.includes(provider)) {
    throw new LlmError("unavailable", `no LLM provider available for ${args.name}`);
  }
  const t0 = Date.now();
  const deadline = t0 + args.timeoutMs;
  const jsonSchema = toJsonSchema(args.schema);
  const a = args as unknown as CallJSONArgs<unknown>;
  let user = args.user;
  let problem = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const left = deadline - Date.now();
    if (left < (attempt === 0 ? 50 : REPAIR_MIN_MS)) break;
    const raw =
      provider === "anthropic"
        ? await anthropicOnce(modelFor("anthropic", args.role), a, user, jsonSchema, left)
        : await openaiOnce(a, user, jsonSchema, left);

    const parsed = args.schema.safeParse(raw);
    const issue = parsed.success
      ? (args.check?.(parsed.data) ?? null)
      : parsed.error.issues
          .slice(0, 4)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
    if (!issue) {
      const ms = Date.now() - t0;
      log.debug({ provider, name: args.name, ms, repaired: attempt > 0 }, "llm call ok");
      return { data: (parsed as { data: T }).data, provider, ms };
    }
    problem = issue;
    log.debug({ provider, name: args.name, problem }, "llm answer rejected");
    user =
      `${args.user}\n\nYour previous answer was rejected: ${issue}\n` +
      `Previous answer: ${JSON.stringify(raw).slice(0, 2000)}\nReturn a corrected answer.`;
  }
  if (problem) throw new LlmError("invalid", `${args.name}: ${problem}`);
  throw new LlmError("timeout", `${args.name}: no time left`);
}

export type ChainStep = { role: LlmRole; provider?: LlmProvider; timeoutMs: number };

/**
 * Tries the steps in order inside one overall budget and returns the first validated answer.
 * Steps whose provider is unavailable are skipped. Throws when nothing succeeded.
 */
export async function callChain<T>(
  steps: ChainStep[],
  budgetMs: number,
  args: Omit<CallJSONArgs<T>, "role" | "provider" | "timeoutMs">,
): Promise<CallJSONResult<T> & { stepIndex: number }> {
  const deadline = Date.now() + budgetMs;
  const avail = availableProviders();
  let last: unknown = new LlmError("unavailable", `no LLM provider available for ${args.name}`);
  const tried = new Set<string>();
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const provider = s.provider ?? avail[0];
    if (!provider || !avail.includes(provider)) continue;
    // OpenAI has one model id, so a smart->fast chain on OpenAI alone would repeat the same call.
    const key = `${provider}:${modelFor(provider, s.role)}`;
    if (tried.has(key)) continue;
    tried.add(key);
    const t = Math.min(s.timeoutMs, deadline - Date.now());
    if (t < 500) break;
    try {
      const r = await callJSON({ ...args, role: s.role, provider, timeoutMs: t });
      return { ...r, stepIndex: i };
    } catch (err) {
      last = err;
      log.warn({ name: args.name, provider, err: err instanceof Error ? err.message : String(err) }, "llm step failed");
    }
  }
  throw last instanceof Error ? last : new LlmError("unavailable", String(last));
}
