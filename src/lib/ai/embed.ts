// Incremental embeddings. Ideas are queued as they arrive and embedded in 500 ms micro-batches into a
// process-wide cache, so distill finds the vectors ready. Live = OpenAI embeddings (2.5 s timeout);
// mock/local = deterministic hashed bag-of-words (unigrams + bigrams, fixed dim, L2-normalised).
import { env } from "@/lib/config";
import { log } from "@/lib/log";
import { hashString, l2normalize, normalizeText, type Vec } from "./cluster";
import { openaiClient, raceTimeout } from "./providers";

export const LOCAL_DIM = 512;
const BATCH_MS = 500;
const PROVIDER_TIMEOUT_MS = 2500;
const PROVIDER_COOLDOWN_MS = 15_000;
const CHUNK = 256;
const MAX_CACHED = 6000;

export type VectorSource = "provider" | "local";

type Store = {
  vectors: Map<string, { vec: Vec; source: VectorSource }>;
  pending: { id: string; text: string }[];
  timer: ReturnType<typeof setTimeout> | null;
  inflight: Set<Promise<void>>;
  /** After a provider failure, skip the provider until this time so a down API cannot stall every batch. */
  downUntil: number;
};

const g = globalThis as unknown as { __cpEmbed?: Store };

function store(): Store {
  return (g.__cpEmbed ??= { vectors: new Map(), pending: [], timer: null, inflight: new Set(), downUntil: 0 });
}

/** Test hook: forget everything cached. */
export function resetEmbeddings(): void {
  const s = store();
  if (s.timer) clearTimeout(s.timer);
  g.__cpEmbed = undefined;
}

export function embeddingsLive(): boolean {
  const e = env();
  return e.LLM_MODE === "live" && Boolean(e.OPENAI_API_KEY);
}

// ---------- local hashed bag-of-words ----------

const STOP = new Set(
  (
    "a an the and or but if so to of in on at by for with from into onto up down out over as is are was were be been " +
    "it its this that these those i we you they he she me us them my our your their lets let just then than too very " +
    "can could should would will shall may might do does did have has had not no yes ok okay lol maybe imo what how " +
    "why when where who which there here also all some any one more most really actually obviously think say vote " +
    "gonna wanna need want go get got make made"
  ).split(" "),
);

function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Deterministic, offline vector: signed feature hashing of stemmed unigrams (1.0) and bigrams (0.6). */
export function hashedVector(text: string): Vec {
  const v = new Float32Array(LOCAL_DIM);
  const raw = normalizeText(text).split(" ").filter(Boolean);
  let toks = raw.filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
  if (toks.length === 0) toks = raw.map(stem);
  const add = (feature: string, weight: number) => {
    const h = hashString(feature);
    v[h % LOCAL_DIM] += (h & 0x80000000 ? -1 : 1) * weight;
  };
  for (let i = 0; i < toks.length; i++) {
    add(`u:${toks[i]}`, 1);
    if (i + 1 < toks.length) add(`b:${toks[i]} ${toks[i + 1]}`, 0.6);
  }
  return l2normalize(v);
}

// ---------- queue + flush ----------

function remember(s: Store, id: string, vec: Vec, source: VectorSource): void {
  s.vectors.set(id, { vec, source });
  if (s.vectors.size > MAX_CACHED) {
    // Map iterates in insertion order: drop the oldest entries.
    let drop = s.vectors.size - MAX_CACHED + 500;
    for (const k of s.vectors.keys()) {
      if (drop-- <= 0) break;
      s.vectors.delete(k);
    }
  }
}

async function embedWithProvider(texts: string[]): Promise<Vec[]> {
  const model = env().OPENAI_EMBED_MODEL;
  const ac = new AbortController();
  const res = await raceTimeout(
    openaiClient().embeddings.create(
      {
        model,
        input: texts,
        encoding_format: "float",
        // Shorter vectors cost less to compare; text-embedding-3 models support this natively.
        ...(model.startsWith("text-embedding-3") ? { dimensions: LOCAL_DIM } : {}),
      },
      { signal: ac.signal },
    ),
    PROVIDER_TIMEOUT_MS,
    ac,
    "openai:embeddings",
  );
  if (res.data.length !== texts.length) throw new Error("embedding count mismatch");
  return res.data.map((d) => l2normalize(Float32Array.from(d.embedding)));
}

async function embedBatch(s: Store, batch: { id: string; text: string }[]): Promise<void> {
  for (let i = 0; i < batch.length; i += CHUNK) {
    const part = batch.slice(i, i + CHUNK);
    try {
      const vecs = await embedWithProvider(part.map((p) => normalizeText(p.text) || p.text));
      part.forEach((p, k) => remember(s, p.id, vecs[k], "provider"));
    } catch (err) {
      s.downUntil = Date.now() + PROVIDER_COOLDOWN_MS;
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "embeddings failed; distill will use local vectors");
      return;
    }
  }
}

function flush(): void {
  const s = store();
  if (s.timer) {
    clearTimeout(s.timer);
    s.timer = null;
  }
  const batch = s.pending.splice(0);
  if (batch.length === 0) return;
  if (!embeddingsLive()) {
    for (const p of batch) remember(s, p.id, hashedVector(p.text), "local");
    return;
  }
  if (Date.now() < s.downUntil) return;
  const job: Promise<void> = embedBatch(s, batch).finally(() => s.inflight.delete(job));
  s.inflight.add(job);
}

/** Fire-and-forget: embed incrementally as ideas arrive (micro-batches). */
export function queueEmbedding(ideaId: string, text: string): void {
  const s = store();
  if (s.vectors.has(ideaId)) return;
  s.pending.push({ id: ideaId, text });
  if (!s.timer) {
    s.timer = setTimeout(flush, BATCH_MS);
    s.timer.unref?.();
  }
}

export type VectorSet = {
  vectors: Map<string, Vec>;
  source: VectorSource;
  /** True when a provider is configured but its vectors were unavailable: the lexical "LLM-only" path. */
  degraded: boolean;
};

/**
 * Vectors for these ideas. Waits up to `waitMs` for in-flight batches (and flushes the partial one).
 * Provider vectors are used only if every idea has one (vector spaces must not be mixed); otherwise
 * all ideas get local lexical vectors.
 */
export async function getVectors(
  ideas: { id: string; text: string }[],
  opts: { waitMs?: number } = {},
): Promise<VectorSet> {
  const s = store();
  const live = embeddingsLive();
  const waitMs = opts.waitMs ?? 800;

  if (live && Date.now() >= s.downUntil) {
    if (s.pending.length > 0) flush();
    if (waitMs > 0 && s.inflight.size > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cap = new Promise<void>((r) => {
        timer = setTimeout(r, waitMs);
      });
      await Promise.race([Promise.allSettled([...s.inflight]).then(() => undefined), cap]);
      clearTimeout(timer);
    }
  }

  if (live && ideas.length > 0) {
    const out = new Map<string, Vec>();
    for (const i of ideas) {
      const c = s.vectors.get(i.id);
      if (c?.source === "provider") out.set(i.id, c.vec);
    }
    if (out.size === ideas.length) return { vectors: out, source: "provider", degraded: false };
  }

  const vectors = new Map<string, Vec>();
  for (const i of ideas) {
    const c = s.vectors.get(i.id);
    vectors.set(i.id, c?.source === "local" ? c.vec : hashedVector(i.text));
  }
  return { vectors, source: "local", degraded: live && ideas.length > 0 };
}
