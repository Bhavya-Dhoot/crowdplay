// Load simulation (GOAL F5, TECH_SPEC §13): N senders x M ideas per round, spread over a window, through the real
// idea-ingestion path, then the real engine distills each round. Reports ideas attempted / accepted / rejected
// by code / dropped, and the STORM-end -> options-saved time per round (p50, p95; exit 1 if p95 > 8000 ms).
//
//   pnpm load:sim                      in-process (default): REALTIME_MODE=mock, LLM_MODE=mock, fresh PGlite at
//                                      .data/load-sim, ingestIdea() called directly, real ticker + engine
//   pnpm load:sim --http <baseUrl>     the same senders against a RUNNING server's HTTP API (session, room create,
//                                      join, POST /api/rooms/CODE/ideas, GET /state). Start the server first, e.g.
//                                      `REALTIME_MODE=mock LLM_MODE=mock PROMPT_MS=1500 REVEAL_MS=1500 pnpm start`
//                                      (server defaults of 6 s prompt / 12 s reveal also work, rounds just take longer).
//   flags: --senders 300  --ideas 5  --window-ms 30000  --rounds 5
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const P95_BUDGET_MS = 8000;
const MIN_GAP_MS = 2250; // every sender honours the server's 1-idea-per-2-s limit with margin for timer jitter
const STORM_TAIL_MS = 1000; // the storm outlasts the last scheduled send so it can still land
const POLL_MS = 15;
const DISTILL_WAIT_MS = 30_000;
const HTTP_TIMEOUT_MS = 10_000;

type Args = { senders: number; ideas: number; windowMs: number; rounds: number; http: string | null };

function parseCli(): Args {
  const { values } = parseArgs({
    options: {
      senders: { type: "string", default: "300" },
      ideas: { type: "string", default: "5" },
      "window-ms": { type: "string", default: "30000" },
      rounds: { type: "string", default: "5" },
      http: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log("pnpm load:sim [--senders 300] [--ideas 5] [--window-ms 30000] [--rounds 5] [--http <baseUrl>]");
    process.exit(0);
  }
  const int = (name: string, raw: string, min: number): number => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) fail(`--${name} must be an integer >= ${min} (got "${raw}")`);
    return n;
  };
  const a: Args = {
    senders: int("senders", values.senders, 1),
    ideas: int("ideas", values.ideas, 1),
    windowMs: int("window-ms", values["window-ms"], 1000),
    rounds: int("rounds", values.rounds, 1),
    http: values.http ? values.http.replace(/\/+$/, "") : null,
  };
  if (a.ideas > 12) fail("--ideas is capped at 12 by the per-round idea cap");
  if (a.http && a.rounds < 3) fail("--rounds must be >= 3 with --http (the room-create API's minimum)");
  if (a.windowMs < (a.ideas - 1) * MIN_GAP_MS + 500) {
    fail(`--window-ms ${a.windowMs} is too short for ${a.ideas} ideas per sender at 1 idea / 2 s (need >= ${(a.ideas - 1) * MIN_GAP_MS + 500})`);
  }
  return a;
}

function fail(msg: string): never {
  console.error(`load-sim: ${msg}`);
  process.exit(1);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- stats ----------

/** Nearest-rank percentile (no interpolation): with 5 rounds, p95 is the slowest round. */
function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}
const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n)) : "n/a");

// ---------- synthetic ideas ----------

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAILS = [
  "at midnight", "with a kazoo", "wearing a tutu", "before breakfast", "while humming", "with a borrowed map",
  "on a skateboard", "using a spoon", "after a nap", "with the dog", "in slow motion", "backwards",
  "holding a lantern", "with a very long rope", "pretending to be a plant", "using only snacks", "with glitter",
  "in a cardboard box", "after one more coffee", "with a flashlight", "but quietly", "and bring a ladder",
  "with a whistle", "on tiptoe", "using a toy robot", "with a secret handshake", "in a trench coat", "by bike",
];
const VERBS = [
  "borrow", "hide", "bribe", "tickle", "launch", "sneak past", "reroute", "trade", "befriend", "paint", "swap", "juggle",
  "whisper to", "repaint", "distract", "tunnel under", "stack", "unplug", "lasso", "serenade",
];
const THINGS = [
  "a giant kazoo", "the janitor's cart", "a suspicious pigeon", "three rubber ducks", "the old elevator", "a borrowed cape",
  "the security camera", "a tray of cupcakes", "a velvet rope", "the night manager", "a cardboard robot", "the lobby fountain",
  "a stack of menus", "the grand piano", "a tiny drone", "the chandelier", "a mop bucket", "the loading dock", "a pair of binoculars",
  "the gift shop mannequin",
];
const PLACES = [
  "in the laundry room", "behind the stage", "on the roof", "by the pool", "under the stairs", "in the parking garage",
  "near the kitchen", "at the front desk", "inside the freezer", "on the balcony", "in the ballroom", "next to the vault door",
  "in the glass elevator", "at the back entrance", "in the boiler room",
];
const LONG_TAIL_SHARE = 0.2;

/** Ideas for one round, like a crowd: lines from the heist preset's canned pool (45% two obvious directions / 35% varied /
 *  20% odd) repeated across senders, ~35% with a casual tail, and a long tail (20%) of one-off sentences built from word lists
 *  so that hundreds of ideas stand alone. Synthetic: there are no real users in this run. */
async function ideaTexts(count: number, round: number): Promise<string[]> {
  const { cannedIdeas, sampleCanned } = await import("../src/lib/bots/canned");
  const poolSize = cannedIdeas("heist").length;
  const next = rng(1000 + round);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(next() * xs.length)];
  const oneOffs = Math.round(count * LONG_TAIL_SHARE);
  const out: string[] = Array.from({ length: oneOffs }, () => `${pick(VERBS)} ${pick(THINGS)} ${pick(PLACES)}`);
  for (let chunk = 0; out.length < count; chunk++) {
    for (const line of sampleCanned("heist", Math.min(poolSize, count - out.length), `load:${round}:${chunk}`)) {
      const tail = next() < 0.35 ? ` ${pick(TAILS)}` : "";
      out.push(`${line}${tail}`.slice(0, 120));
    }
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Send offsets (ms from storm start) for one sender: uniform over the window, never closer than MIN_GAP_MS. */
function sendOffsets(n: number, windowMs: number, next: () => number): number[] {
  const free = windowMs - (n - 1) * MIN_GAP_MS;
  const u = Array.from({ length: n }, () => next() * free).sort((a, b) => a - b);
  return u.map((x, k) => Math.round(x + k * MIN_GAP_MS));
}

// ---------- backends ----------

type Outcome = { kind: "accepted" } | { kind: "rejected"; code: string } | { kind: "dropped"; error: string };
type Observed = { phase: string; roundNo: number; startedAt: number; endsAt: number | null; hasOptions: boolean; published?: number; recap?: string };
type RoundFacts = {
  /** Ideas persisted for the round, any status (in-process only). */
  stored?: number;
  storedByStatus?: Record<string, number>;
  effectMs?: number | null;
  provider?: string | null;
  fallback?: boolean | null;
};

interface Backend {
  readonly label: string;
  setup(a: Args): Promise<void>;
  /** Engine time (ms since epoch) as the server sees it. */
  now(): number;
  observe(): Promise<Observed>;
  send(sender: number, roundNo: number, text: string, clientMsgId: string): Promise<Outcome>;
  facts(roundNo: number): Promise<RoundFacts>;
  finish(): Promise<{ finale: boolean }>;
}

const senderName = (i: number) => `Sender ${String(i + 1).padStart(4, "0")}`;
const senderIp = (i: number) => `10.0.${Math.floor(i / 250)}.${(i % 250) + 1}`;

async function inProcessBackend(a: Args): Promise<Backend> {
  const dataDir = path.resolve(process.cwd(), ".data", "load-sim");
  fs.rmSync(dataDir, { recursive: true, force: true });
  Object.assign(process.env, {
    REALTIME_MODE: "mock",
    LLM_MODE: "mock",
    PGLITE_DIR: dataDir,
    LOG_LEVEL: process.env.LOG_LEVEL ?? "silent",
    PROMPT_MS: "1500",
    REVEAL_MS: "1500",
    TIMING_SCALE: "1",
    ROOM_PLAYER_CAP: String(Math.max(450, a.senders + 50)),
  });
  delete process.env.DATABASE_URL;

  const { and, eq, sql } = await import("drizzle-orm");
  const { getDb, schema } = await import("../src/lib/db/client");
  const { advance, loadEngineState, settleEffects } = await import("../src/lib/engine/advance");
  const { startTicker, stopTicker } = await import("../src/lib/engine/ticker");
  const { newUserId } = await import("../src/lib/ids");
  const { ingestIdea } = await import("../src/lib/ingest/ideas");
  const { createRoom, joinRoom } = await import("../src/lib/rooms");

  const db = await getDb();
  const users = Array.from({ length: a.senders }, (_, i) => ({ id: newUserId(), displayName: senderName(i), isBot: false }));
  const host = { id: newUserId(), displayName: "Load Host", isBot: false };
  await db.insert(schema.users).values([host, ...users]);

  const { room, show } = await createRoom(
    {
      title: "Load Simulation",
      preset: "heist",
      premise: "A heist crew with a thousand ideas and one vault.",
      roundsTotal: a.rounds,
      stormMs: a.windowMs + STORM_TAIL_MS,
      voteMs: 3000,
      autoAdvance: true,
      strictFilter: true,
    },
    host,
  );
  for (const u of users) await joinRoom(room, u);
  console.error(`in-process: room ${room.code}, ${a.senders} participants joined, PGlite at ${dataDir}`);

  const roundIds = new Map<number, string>();
  const roundId = async (roundNo: number): Promise<string | null> => {
    const known = roundIds.get(roundNo);
    if (known) return known;
    const [r] = await db
      .select({ id: schema.rounds.id })
      .from(schema.rounds)
      .where(and(eq(schema.rounds.showId, show.id), eq(schema.rounds.roundNo, roundNo)));
    if (r) roundIds.set(roundNo, r.id);
    return r?.id ?? null;
  };

  await advance(room.id, { type: "HOST_START" });
  startTicker();

  const backend: Backend = {
    label: "in-process (ingestIdea called directly; REALTIME_MODE=mock, LLM_MODE=mock; PGlite)",
    async setup() {},
    now: () => Date.now(),
    async observe() {
      const e = await loadEngineState(room.id, db);
      if (!e) throw new Error("room vanished");
      let hasOptions = false;
      if (e.roundNo >= 1 && ["DISTILL", "VOTE", "REVEAL", "FINALE", "ENDED"].includes(e.phase)) {
        const rid = await roundId(e.roundNo);
        if (rid) {
          const [c] = await db
            .select({ n: sql<number>`count(*)::int` })
            .from(schema.options)
            .where(and(eq(schema.options.roundId, rid), sql`${schema.options.slot} is not null`));
          hasOptions = (c?.n ?? 0) > 0;
        }
      }
      return { phase: e.phase, roundNo: e.roundNo, startedAt: e.phaseStartedAt, endsAt: e.phaseEndsAt, hasOptions };
    },
    async send(sender, roundNo, text, clientMsgId) {
      try {
        const r = await ingestIdea({
          roomCode: room.code,
          userId: users[sender].id,
          roundNo,
          text,
          clientMsgId,
          source: "post",
          ip: senderIp(sender),
        });
        return r.ok ? { kind: "accepted" } : { kind: "rejected", code: r.code };
      } catch (err) {
        return { kind: "dropped", error: err instanceof Error ? err.message : String(err) };
      }
    },
    async facts(roundNo) {
      const rid = await roundId(roundNo);
      if (!rid) return {};
      const [r] = await db.select().from(schema.rounds).where(eq(schema.rounds.id, rid));
      const byStatus = await db
        .select({ status: schema.ideas.status, n: sql<number>`count(*)::int` })
        .from(schema.ideas)
        .where(eq(schema.ideas.roundId, rid))
        .groupBy(schema.ideas.status);
      const storedByStatus = Object.fromEntries(byStatus.map((x) => [x.status, x.n]));
      return {
        stored: byStatus.reduce((n, x) => n + x.n, 0),
        storedByStatus,
        effectMs: r?.distillMs ?? null,
        provider: r?.distillProvider ?? null,
        fallback: r?.fallbackUsed ?? null,
      };
    },
    async finish() {
      await waitFor(async () => (await backend.observe()).phase === "FINALE", 30_000, "FINALE");
      await settleEffects();
      const [s] = await db.select({ recap: schema.shows.storyRecap }).from(schema.shows).where(eq(schema.shows.id, show.id));
      stopTicker();
      return { finale: Boolean(s?.recap) };
    },
  };
  return backend;
}

async function httpBackend(a: Args, base: string): Promise<Backend> {
  const headers = (token: string | null, extra: Record<string, string> = {}) => ({
    "content-type": "application/json",
    ...(token ? { "x-cp-session": token } : {}),
    ...extra,
  });
  const call = async (method: string, url: string, token: string | null, body?: unknown, extra: Record<string, string> = {}) => {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: headers(token, extra),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, json };
  };
  const must = async (what: string, p: ReturnType<typeof call>) => {
    const r = await p;
    if (r.status >= 300 || !r.json || r.json.ok !== true) fail(`${what} failed: HTTP ${r.status} ${JSON.stringify(r.json)}`);
    return r.json;
  };
  const inBatches = async <T>(n: number, size: number, fn: (i: number) => Promise<T>): Promise<T[]> => {
    const out: T[] = new Array(n);
    for (let i = 0; i < n; i += size) {
      await Promise.all(Array.from({ length: Math.min(size, n - i) }, async (_, k) => void (out[i + k] = await fn(i + k))));
    }
    return out;
  };

  const session = async (name: string) => String((await must(`session ${name}`, call("POST", "/api/session", null, { displayName: name }))).sessionToken);
  const hostToken = await session("Load Host");
  const created = await must(
    "create room",
    call("POST", "/api/rooms", hostToken, {
      title: "Load Simulation",
      preset: "heist",
      premise: "A heist crew with a thousand ideas and one vault.",
      roundsTotal: a.rounds,
      stormMs: a.windowMs + STORM_TAIL_MS,
      voteMs: 3000,
      autoAdvance: true,
      strictFilter: true,
    }),
  );
  const code = String(created.code);
  const hostKey = String(created.hostKey);
  const tokens = await inBatches(a.senders, 25, (i) => session(senderName(i)));
  await inBatches(a.senders, 25, (i) => must(`join ${i}`, call("POST", `/api/rooms/${code}/join`, tokens[i], {})));
  await must("start", call("POST", `/api/rooms/${code}/host`, null, { action: "start" }, { "x-host-key": hostKey }));
  console.error(`http: ${base}, room ${code}, ${a.senders} participants joined`);

  let offset = 0; // server clock minus local clock, refreshed on every state poll
  const backend: Backend = {
    label: `HTTP against ${base} (real session, join, POST /api/rooms/CODE/ideas, GET /state)`,
    async setup() {},
    now: () => Date.now() + offset,
    async observe() {
      const t0 = Date.now();
      const r = await call("GET", `/api/rooms/${code}/state`, null);
      const t1 = Date.now();
      const s = (r.json?.state ?? null) as Record<string, unknown> | null;
      if (!s) throw new Error(`state poll failed: HTTP ${r.status}`);
      offset = Number(s.serverNow) - (t0 + t1) / 2;
      const phase = String(s.phase);
      const options = (s.options as unknown[] | undefined) ?? [];
      const stats = s.stats as { ideasThisRound?: number } | undefined;
      return {
        phase,
        roundNo: Number(s.roundNo),
        startedAt: Number(s.phaseStartedAt),
        endsAt: s.phaseEndsAt === null ? null : Number(s.phaseEndsAt),
        hasOptions: options.length > 0,
        published: stats?.ideasThisRound,
        recap: (s.finale as { recap?: string } | undefined)?.recap,
      };
    },
    async send(sender, roundNo, text, clientMsgId) {
      try {
        const r = await call("POST", `/api/rooms/${code}/ideas`, tokens[sender], { roundNo, text, clientMsgId }, { "x-forwarded-for": senderIp(sender) });
        if (r.json?.ok === true) return { kind: "accepted" };
        if (r.status < 500 && r.json?.ok === false && typeof r.json.code === "string") return { kind: "rejected", code: r.json.code };
        return { kind: "dropped", error: `HTTP ${r.status} ${JSON.stringify(r.json)}` };
      } catch (err) {
        return { kind: "dropped", error: err instanceof Error ? err.message : String(err) };
      }
    },
    async facts() {
      return {};
    },
    async finish() {
      let recap = "";
      await waitFor(
        async () => {
          recap = (await backend.observe()).recap ?? "";
          return recap.trim().length > 0;
        },
        60_000,
        "the finale recap",
      );
      return { finale: true };
    },
  };
  return backend;
}

async function waitFor(cond: () => Promise<boolean>, timeoutMs: number, what: string, pollMs = 25): Promise<void> {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await sleep(pollMs);
  }
}

// ---------- the run ----------

type RoundResult = {
  round: number;
  attempted: number;
  accepted: number;
  rejected: Record<string, number>;
  dropped: number;
  droppedSamples: string[];
  ingestMs: number[];
  distillMs: number | null;
  facts: RoundFacts;
  published: number | undefined;
  reconciles: boolean;
  note: string;
};

async function runRound(a: Args, backend: Backend, round: number): Promise<RoundResult> {
  const st = await (async () => {
    let last: Observed | null = null;
    await waitFor(
      async () => {
        last = await backend.observe();
        return last.roundNo === round && last.phase === "STORM";
      },
      90_000,
      `round ${round} STORM`,
    );
    return last as unknown as Observed;
  })();
  const stormStart = st.startedAt;
  const stormEnd = st.endsAt ?? stormStart + a.windowMs + STORM_TAIL_MS;

  const total = a.senders * a.ideas;
  const texts = await ideaTexts(total, round);
  const next = rng(round * 7919);
  const res: RoundResult = {
    round,
    attempted: 0,
    accepted: 0,
    rejected: {},
    dropped: 0,
    droppedSamples: [],
    ingestMs: [],
    distillMs: null,
    facts: {},
    published: undefined,
    reconciles: false,
    note: "",
  };

  const sends: Promise<void>[] = [];
  for (let s = 0; s < a.senders; s++) {
    const offsets = sendOffsets(a.ideas, a.windowMs, next);
    offsets.forEach((off, k) => {
      const text = texts[s * a.ideas + k];
      const clientMsgId = randomUUID();
      sends.push(
        sleep(Math.max(0, stormStart + off - backend.now())).then(async () => {
          const t0 = performance.now();
          const o = await backend.send(s, round, text, clientMsgId);
          res.ingestMs.push(performance.now() - t0);
          res.attempted++;
          if (o.kind === "accepted") res.accepted++;
          else if (o.kind === "rejected") res.rejected[o.code] = (res.rejected[o.code] ?? 0) + 1;
          else {
            res.dropped++;
            if (res.droppedSamples.length < 3) res.droppedSamples.push(o.error);
          }
        }),
      );
    });
  }
  await Promise.all(sends);

  // STORM end -> options saved, observed on the engine's own clock.
  let saved: Observed | null = null;
  let savedAt = 0;
  try {
    await waitFor(
      async () => {
        const o = await backend.observe();
        if (o.roundNo === round && o.hasOptions) {
          saved = o;
          savedAt = backend.now();
          return true;
        }
        return false;
      },
      Math.max(DISTILL_WAIT_MS, stormEnd - backend.now() + DISTILL_WAIT_MS),
      `round ${round} options`,
      POLL_MS,
    );
    res.distillMs = Math.max(0, savedAt - stormEnd);
  } catch (err) {
    res.note = err instanceof Error ? err.message : String(err);
  }

  res.facts = await backend.facts(round);
  const rejectedBlocked = res.rejected.BLOCKED ?? 0;
  const published = (saved as Observed | null)?.published;
  res.published = published;
  if (res.facts.stored !== undefined) {
    // Every attempt that reached the database is accounted for: accepted + filter-blocked rows.
    res.reconciles = res.facts.stored === res.accepted + rejectedBlocked;
  } else {
    res.reconciles = published === undefined || published === res.accepted;
  }
  return res;
}

function row(r: RoundResult): string {
  const rej = Object.values(r.rejected).reduce((n, x) => n + x, 0);
  const lat = r.ingestMs;
  return [
    r.round,
    r.attempted,
    r.accepted,
    rej,
    r.dropped,
    r.facts.stored ?? r.published ?? "n/a",
    `${fmt(percentile(lat, 50))} / ${fmt(percentile(lat, 95))} / ${fmt(Math.max(...lat))}`,
    r.distillMs === null ? "TIMEOUT" : fmt(r.distillMs),
    r.facts.effectMs === undefined || r.facts.effectMs === null ? "n/a" : fmt(r.facts.effectMs),
    r.facts.provider ?? "n/a",
    r.facts.fallback === undefined || r.facts.fallback === null ? "n/a" : r.facts.fallback ? "yes" : "no",
  ].join(" | ");
}

function report(a: Args, backend: Backend, results: RoundResult[], finale: boolean, startedAt: Date, wallMs: number): { md: string; pass: boolean } {
  const distill = results.map((r) => r.distillMs).filter((x): x is number => x !== null);
  const p50 = percentile(distill, 50);
  const p95 = percentile(distill, 95);
  const attempted = results.reduce((n, r) => n + r.attempted, 0);
  const accepted = results.reduce((n, r) => n + r.accepted, 0);
  const dropped = results.reduce((n, r) => n + r.dropped, 0);
  const rejectedByCode: Record<string, number> = {};
  for (const r of results) for (const [c, n] of Object.entries(r.rejected)) rejectedByCode[c] = (rejectedByCode[c] ?? 0) + n;
  const rejected = Object.values(rejectedByCode).reduce((n, x) => n + x, 0);

  const problems: string[] = [];
  if (distill.length !== results.length) problems.push(`${results.length - distill.length} round(s) never produced options`);
  if (!(p95 <= P95_BUDGET_MS)) problems.push(`distill p95 ${fmt(p95)} ms exceeds ${P95_BUDGET_MS} ms`);
  if (dropped > 0) problems.push(`${dropped} idea(s) dropped (neither accepted nor rejected with a reason)`);
  if (attempted !== a.senders * a.ideas * a.rounds) problems.push(`attempted ${attempted} != expected ${a.senders * a.ideas * a.rounds}`);
  if (attempted !== accepted + rejected + dropped) problems.push("attempted != accepted + rejected + dropped");
  for (const r of results) if (!r.reconciles) problems.push(`round ${r.round}: stored/published ideas do not reconcile with accepted`);
  if (!finale) problems.push("the show did not reach a finale with a recap");
  const pass = problems.length === 0;

  const lines: string[] = [];
  lines.push(`### Load simulation (F5) - ${startedAt.toISOString()}`);
  lines.push("");
  lines.push(`Command: \`pnpm load:sim${a.http ? ` --http ${a.http}` : ""}${a.senders !== 300 ? ` --senders ${a.senders}` : ""}${a.ideas !== 5 ? ` --ideas ${a.ideas}` : ""}${a.windowMs !== 30000 ? ` --window-ms ${a.windowMs}` : ""}${a.rounds !== 5 ? ` --rounds ${a.rounds}` : ""}\``);
  lines.push(`Mode: ${backend.label}`);
  lines.push(`Host: Node ${process.version}, ${os.platform()} ${os.arch()}, ${os.cpus()[0]?.model ?? "cpu"} x${os.cpus().length}; wall time ${(wallMs / 1000).toFixed(0)} s`);
  lines.push(
    `Load: ${a.senders} senders x ${a.ideas} ideas per round, sends spread uniformly over ${a.windowMs} ms (storm ${a.windowMs + STORM_TAIL_MS} ms), ` +
      `>= ${MIN_GAP_MS} ms between a sender's ideas, one IP per sender, ${a.rounds} rounds of one show (autoAdvance on, vote 3000 ms). ` +
      "Ideas: synthetic, not real users (heist preset canned pool, 45% two obvious directions / 35% varied / 20% odd, repeated across senders with casual tails, plus a 20% long tail of one-off sentences).",
  );
  lines.push(
    "Measured: distill = from the STORM phase's deadline to the first poll (every " + POLL_MS + " ms) that finds the round's ballot options saved, so it includes the 250 ms ticker and the DISTILL_DONE hand-off; " +
      "'Distill effect' is the engine's own rounds.distill_ms (effect start to saved).",
  );
  lines.push("");
  lines.push("| Round | Attempted | Accepted | Rejected | Dropped | Ideas stored | Ingest ms p50 / p95 / max | Distill ms (STORM end -> options saved) | Distill effect ms | Provider | Fallback |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) lines.push(`| ${row(r)} |`);
  lines.push("");
  lines.push(
    `Ideas attempted ${attempted} / accepted ${accepted} / rejected ${rejected}` +
      (rejected ? ` (${Object.entries(rejectedByCode).map(([c, n]) => `${c}: ${n}`).join(", ")})` : " (none)") +
      ` / dropped ${dropped}`,
  );
  const allLat = results.flatMap((r) => r.ingestMs);
  lines.push(`Ingest latency over all attempts: p50 ${fmt(percentile(allLat, 50))} ms, p95 ${fmt(percentile(allLat, 95))} ms, max ${fmt(Math.max(...allLat))} ms`);
  lines.push(`Distill ms per round: ${results.map((r) => (r.distillMs === null ? "TIMEOUT" : fmt(r.distillMs))).join(", ")}`);
  lines.push(`**Distill p50 ${fmt(p50)} ms, p95 ${fmt(p95)} ms** (nearest rank over ${distill.length} rounds), budget p95 <= ${P95_BUDGET_MS} ms: ${p95 <= P95_BUDGET_MS ? "PASS" : "FAIL"}`);
  lines.push(`Reconciliation: ${results.every((r) => r.reconciles) ? (results[0]?.facts.stored !== undefined ? "stored idea rows = accepted + filter-blocked rows, every round" : "published ideasThisRound = accepted, every round") : "MISMATCH (see problems)"}; finale reached with recap: ${finale ? "yes" : "no"}`);
  for (const r of results) if (r.droppedSamples.length) lines.push(`Round ${r.round} dropped examples: ${r.droppedSamples.join(" | ")}`);
  for (const r of results) if (r.note) lines.push(`Round ${r.round} note: ${r.note}`);
  lines.push(`Result: ${pass ? "PASS" : `FAIL - ${problems.join("; ")}`}`);
  lines.push("");
  lines.push(
    a.http
      ? "Other mode: `pnpm load:sim` runs in-process (default)."
      : "Other mode: `pnpm load:sim --http http://localhost:3000` drives the same senders through a running server's HTTP API (start it with REALTIME_MODE=mock LLM_MODE=mock first; see the header of scripts/load-sim.ts).",
  );
  if (!a.http) {
    lines.push("");
    lines.push("Caveat: in-process PGlite shares one thread with the senders and the distiller, so this is a pessimistic stand-in for a server with a separate Postgres; mock mode has no LLM/embedding latency (the live budget is in AI_PROMPTS §11).");
  }
  return { md: lines.join("\n"), pass };
}

async function main(): Promise<void> {
  const root = process.cwd();
  if (!fs.existsSync(path.join(root, "src", "lib", "db", "migrations"))) fail("run from the repository root (pnpm load:sim)");
  const a = parseCli();
  const startedAt = new Date();
  const t0 = Date.now();
  console.error(`load-sim: ${a.senders} senders x ${a.ideas} ideas / ${a.windowMs} ms, ${a.rounds} rounds, ${a.http ? `HTTP ${a.http}` : "in-process"}`);

  const backend = a.http ? await httpBackend(a, a.http) : await inProcessBackend(a);
  const results: RoundResult[] = [];
  for (let round = 1; round <= a.rounds; round++) {
    const r = await runRound(a, backend, round);
    results.push(r);
    console.error(`round ${round}: attempted ${r.attempted} accepted ${r.accepted} dropped ${r.dropped} distill ${r.distillMs === null ? "TIMEOUT" : `${fmt(r.distillMs)} ms`}`);
    if (r.distillMs === null) break;
  }
  let finale = false;
  try {
    finale = (await backend.finish()).finale;
  } catch (err) {
    console.error(`finish: ${err instanceof Error ? err.message : String(err)}`);
  }

  const { md, pass } = report(a, backend, results, finale, startedAt, Date.now() - t0);
  console.log(`\n${md}\n`);
  const out = path.join(root, "docs", "load-sim-results.md");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${md}\n`);
  console.error(`wrote ${path.relative(root, out)}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
