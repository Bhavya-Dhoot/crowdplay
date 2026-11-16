# CROWDPLAY — Technical Specification

Read with `NEXCONN_INTEGRATION.md` and `AI_PROMPTS.md`. This file is the source of truth for names, routes, schemas and state.

## 1. Stack (fixed)

| Layer | Choice |
|---|---|
| Runtime | Node 22, TypeScript strict |
| App | Next.js (App Router, latest stable), React, Tailwind CSS, Framer Motion |
| Server | Next.js route handlers + an in-process **ticker** (started from `instrumentation.ts`) |
| DB | Postgres via Drizzle ORM. `DATABASE_URL` set → `pg`. Unset → **PGlite** (`@electric-sql/pglite`) at `./.data/pglite` (zero-config dev and tests) |
| Realtime | **Nexconn** Web Chat SDK (client) + `@nexconn/server-sdk` (server). Mock transport for tests only |
| AI | Anthropic SDK (distiller, narrator), OpenAI SDK (embeddings, TTS, fallback LLM) |
| Validation | zod everywhere at boundaries |
| Tests | Vitest (unit/integration), Playwright (e2e) |
| Deploy | One long-running Node container (Railway / Fly.io / Render) via `Dockerfile`; managed Postgres (Neon). Must also work on Vercel (lazy advance, see §5.3) |

Package manager: `pnpm`. Single app, no monorepo.

## 2. Repository layout

```
/
├─ CLAUDE.md  README.md  Dockerfile  .env.example  drizzle.config.ts
├─ docs/                      # the spec files from this pack (copied in)
├─ scripts/
│  ├─ verify.sh               # the goal gate (see GOAL.md)
│  ├─ nexconn-smoke.ts        # live Nexconn checks (needs creds)
│  ├─ load-sim.ts             # N simulated senders through the mock or live transport
│  ├─ check-no-secret.ts      # greps client bundles for secrets
│  └─ seed-demo.ts
├─ src/
│  ├─ app/                    # routes (see §8)
│  ├─ components/             # ui/, play/, host/, screen/
│  ├─ styles/tokens.css
│  ├─ lib/
│  │  ├─ config.ts            # env parsing (zod), feature flags, timings
│  │  ├─ db/ (schema.ts, client.ts, migrations/)
│  │  ├─ auth/ (session.ts, hostKey.ts)
│  │  ├─ realtime/
│  │  │  ├─ types.ts          # RealtimeServer / RealtimeClient interfaces
│  │  │  ├─ nexconn.server.ts # ONLY file that imports @nexconn/server-sdk
│  │  │  ├─ nexconn.client.ts # ONLY file that imports the Nexconn web SDK
│  │  │  ├─ mock.server.ts  mock.client.ts   # SSE-based in-memory bus
│  │  │  └─ index.ts          # picks by REALTIME_MODE
│  │  ├─ engine/
│  │  │  ├─ machine.ts        # pure transition function
│  │  │  ├─ advance.ts        # idempotent advance(roomId) with DB lock
│  │  │  ├─ ticker.ts         # setInterval 250 ms over active rooms
│  │  │  ├─ publish.ts        # writes metadata + state messages
│  │  │  └─ tally.ts
│  │  ├─ ai/
│  │  │  ├─ embed.ts cluster.ts distill.ts narrate.ts safety.ts tts.ts
│  │  │  ├─ providers.ts      # anthropic/openai/mock with timeouts
│  │  │  └─ heuristics.ts     # no-LLM fallback
│  │  ├─ ingest/ (ideas.ts, webhook.ts, ratelimit.ts, filter.ts)
│  │  ├─ bots/ (personas.ts, runner.ts)
│  │  ├─ receipts.ts  metrics.ts  ids.ts  time.ts
│  └─ tests/ (unit/, integration/, e2e/)
```

**Rule:** nothing outside `lib/realtime/nexconn.*.ts` may import a Nexconn package. This contains SDK-surface risk in two files.

## 3. Environment

See `env.example`. Key switches:

| Var | Values | Meaning |
|---|---|---|
| `REALTIME_MODE` | `nexconn` \| `mock` | Production must be `nexconn`. `mock` only for tests/CI and local dev without creds. |
| `LLM_MODE` | `live` \| `mock` | `mock` = deterministic distiller/narrator for tests. |
| `INGEST_MODE` | `dual` (default) \| `webhook` \| `post` | How ideas reach the server. |
| `FEATURE_TTS`, `FEATURE_MULTILINGUAL`, `FEATURE_CHEERS` | `0/1` | Depth features. |

The app must **refuse to start** in `NODE_ENV=production` with `REALTIME_MODE=mock` unless `ALLOW_MOCK_IN_PROD=1`.

## 4. Data model (Drizzle, Postgres)

All ids are text (nanoid). Timestamps `timestamptz`. Add indexes on all FKs.

```
users        id, display_name, is_bot bool, nexconn_user_id, created_at, deleted_at
rooms        id, code UNIQUE, channel_id, title, host_user_id, host_key_hash,
             strict_filter bool, is_demo bool, created_at
shows        id, room_id, premise, preset, rounds_total int, storm_ms, vote_ms,
             prompt_ms, reveal_ms, auto_advance bool, status, story_title,
             story_summary text, started_at, ended_at
engine_state room_id PK, show_id, round_no int, phase, phase_started_at,
             phase_ends_at, paused_remaining_ms int NULL, version bigint,
             payload jsonb, updated_at            -- single row per room, row-locked
rounds       id, show_id, round_no, prompt_title, prompt_text, status,
             ideas_count, contributors_count, distill_ms, distill_provider,
             fallback_used, votes_count, winner_option_id, narration, tts_url
ideas        id, round_id, user_id, text, client_msg_id, source ('webhook'|'post'|'bot'),
             status ('ok'|'blocked'|'deleted'), cluster_id int NULL, created_at
             UNIQUE(user_id, client_msg_id)
options      id, round_id, slot ('A'|'B'|'C'), kind ('crowd'|'wildcard'|'narrator'),
             label, source_idea_ids jsonb, supporters int, vetoed bool, rank int
votes        round_id, user_id, option_id, updated_at   PK(round_id, user_id)
receipts     id, user_id, show_id, round_id, type ('BALLOT'|'CANON'), option_id,
             idea_id, delivered_nexconn bool, created_at
participants room_id, user_id, joined_at, last_seen_at, muted bool, banned bool  PK(room_id,user_id)
webhook_events id (provider msg id) PK, received_at         -- dedupe
events       id, room_id, type, data jsonb, created_at      -- audit + metrics
```

## 5. Round engine

### 5.1 Phases and defaults
`LOBBY → PROMPT(6s) → STORM(30s) → DISTILL(≤8s hard cap 10s) → VOTE(12s) → REVEAL(12s) → PROMPT … → FINALE(open-ended) → ENDED`

`machine.ts` exports a **pure** function:
```ts
next(state: EngineState, now: number, trigger: Trigger): { state: EngineState; effects: Effect[] }
```
Triggers: `TICK`, `HOST_START`, `HOST_NEXT`, `HOST_END_STORM`, `HOST_EXTEND(ms)`, `HOST_PAUSE`, `HOST_RESUME`, `HOST_FORCE_WIN(optionId)`, `HOST_VETO(optionId)`, `HOST_REROLL`, `HOST_END_SHOW`, `DISTILL_DONE(result)`, `DISTILL_FAILED`.
Effects (executed by `advance.ts` after commit): `GEN_PROMPT`, `RUN_DISTILL`, `CLOSE_VOTE`, `GEN_NARRATION`, `SEND_RECEIPTS`, `PUBLISH`, `GEN_FINALE`, `START_BOTS`.

### 5.2 Idempotency and locking
- `advance(roomId, trigger)` runs in a transaction: `SELECT … FOR UPDATE` on `engine_state`, compute `next`, write, bump `version`, commit, then run effects.
- Effects are keyed `(roomId, roundNo, effectName)` in `events` so retries do not double-run (e.g. receipts sent once).
- With PGlite (single process) use an in-process mutex per room.

### 5.3 Triggers for time
1. `ticker.ts`: every 250 ms, for rooms with `phase_ends_at <= now`, call `advance(TICK)`. Started once from `instrumentation.ts` (guard against double start in dev).
2. **Lazy advance:** every room API read (`GET /state`) and every host heartbeat (1 s) also calls `advance(TICK)`. So the app still progresses on serverless hosts.

### 5.4 Pre-generation for speed
- The prompt for round N+1 is generated during REVEAL of round N (after the winner is known).
- Narration generation starts the instant VOTE closes; REVEAL shows the winner immediately and the narration text when ready (≤3 s typical; fallback template at 5 s).
- Embeddings are computed **incrementally** as ideas arrive (micro-batches every 500 ms), so DISTILL only clusters + labels.

### 5.5 Published state (single shape everywhere)
```ts
type PublicState = {
  v: number; roomCode: string; showId: string;
  phase: Phase; roundNo: number; roundsTotal: number;
  phaseStartedAt: number; phaseEndsAt: number | null; serverNow: number; paused: boolean;
  title: string;
  prompt?: { title: string; text: string };
  options?: { id: string; slot: 'A'|'B'|'C'; kind: 'crowd'|'wildcard'|'narrator';
              label: string; supporters: number; credit: string[]; more: number }[];
  tally?: Record<string, number>; votesTotal?: number;
  outcome?: { optionId: string; narration: string | null; credit: string[]; more: number; ttsUrl?: string };
  stats: { players: number; ideasThisRound: number; ideasTotal: number; canonMakers: number };
  storySoFar: string[];          // last 3 one-line beats
};
```
Delivery order of preference (clients merge by highest `v`):
1. Nexconn Open Channel **metadata** keys (see `NEXCONN_INTEGRATION.md` §5).
2. Nexconn priority message `CP:State` carrying the same JSON (sent on every phase change, not on tally ticks).
3. `GET /api/rooms/:code/state` — on load, on reconnect, and every 2 s only while Nexconn is disconnected.

Clock sync: client computes `offset = serverNow - Date.now()` (median of 5 samples from `GET /api/time`), re-sampled every 5 min.

## 6. Idea pipeline

1. Client validates (length, cooldown), assigns `clientMsgId` (uuid), shows optimistic bubble.
2. Client sends Nexconn Open Channel message `CP:Idea {roundId, text, clientMsgId, name}`.
3. If `INGEST_MODE` is `dual` or `post`: client also `POST /api/rooms/:code/ideas`.
4. Server (webhook or POST) → `ingest/ideas.ts`: auth participant → phase/round check → rate limit → `filter.ts` (blocklist, strict mode regexes, length) → insert (`ON CONFLICT DO NOTHING`) → enqueue for embedding.
5. Rejections return `{ok:false, reason}`; client marks the bubble.
6. Host delete → `ideas.status='deleted'` + `CP:Moderation {hideIdeaIds}` message so screens remove it.

Rate limiting: in-memory token buckets keyed by user and IP (acceptable for single container); DB check for per-round cap.

## 7. Distill pipeline (`ai/distill.ts`)

```
ideas(ok) ──► embeddings (already cached) ──► cluster.ts (greedy cosine, τ=0.62,
            merge pass, min size 1) ──► candidates:
              crowd  = top 8 clusters by size (5 representative ideas each, nearest to centroid)
              wild   = up to 30 clusters with share ≤15% (prefer size 1–3), sampled for diversity
          ──► LLM (AI_PROMPTS.md §2) → 3 options with sourceClusterIds
          ──► validate (zod + rules FR-13..15) ──► expand clusters → source_idea_ids
          ──► supporters / contributors computed in SQL ──► save options ──► DISTILL_DONE
```
- Timeouts: embeddings 2.5 s (else skip to LLM-only on a 120-idea sample), primary LLM 5 s, secondary 3 s, then `heuristics.ts`.
- `heuristics.ts`: labels = cleaned representative idea of the two largest clusters + one random small cluster; truncate to 70 chars.
- Runner-up candidates (rank 4–6) are stored with `rank` for instant **veto** replacement.
- Judge Mode boost: if `rooms.is_demo` and the human has an OK idea not already used, their cluster is forced into the wildcard candidate set and flagged to the LLM as preferred.

## 8. Routes

### Pages
`/` · `/join/[code]` · `/play/[code]` · `/host/[code]` · `/screen/[code]` · `/try` · `/me` · `/story/[showId]` · `/impact` · `/how-it-works` · `/admin`

### API (all JSON, zod-validated, errors `{ok:false, code, message}`)

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | — | `{ok, realtimeMode, llmMode, db}` |
| `GET /api/time` | — | `{now}` |
| `POST /api/session` | — | `{displayName}` → cookie + `{user, nexconn:{appKey, token, area}}` |
| `DELETE /api/session` | cookie | delete my data |
| `POST /api/rooms` | cookie | create room + show config → `{code, hostKey, links}` |
| `GET /api/rooms/:code` | — | public room info |
| `POST /api/rooms/:code/join` | cookie | upsert participant; returns `PublicState` + my vote + my flags |
| `GET /api/rooms/:code/state` | — | `PublicState` (also lazy-advances) |
| `POST /api/rooms/:code/ideas` | cookie | idea ingestion (HTTP path) |
| `POST /api/rooms/:code/vote` | cookie | `{roundNo, optionId}` |
| `POST /api/rooms/:code/host` | host key header `x-host-key` | `{action, …}` — all host triggers + moderation |
| `GET /api/rooms/:code/host/feed` | host key | ideas of current round, players, metrics |
| `POST /api/try` | cookie | create demo room with bots, auto-start |
| `GET /api/me` | cookie | receipts + stats |
| `GET /api/story/:showId` | — | recap data |
| `GET /api/impact` | — | aggregated real usage (bots excluded) |
| `GET /api/admin/export` | `ADMIN_TOKEN` | CSV |
| `POST /api/nexconn/webhook` | signature | message events → ingestion |
| `GET /api/mock/stream` | — | SSE, **only** when `REALTIME_MODE=mock` |

## 9. Sessions and security

- Cookie `cp_session`: JWT (HS256, `SESSION_SECRET`), httpOnly, SameSite=Lax, 30 days. Fallback header `x-cp-session` from localStorage when cookies are blocked.
- Host key: random 32 chars; `hostKey` shown once; stored as SHA-256. Sent as `x-host-key`.
- Nexconn user id = `users.id` (prefix `u_`, 16 alnum). Bot users prefix `b_`. Narrator bot = `cp_narrator`.
- Webhook: verify signature per Nexconn docs, reject timestamps older than 5 min, dedupe by provider message id, and **never trust the body alone** — sender must be a participant of the room and the idea must pass the same pipeline.
- Security headers via `next.config`; no secrets in `NEXT_PUBLIC_*` except App Key and area.
- `scripts/check-no-secret.ts` fails if `NEXCONN_APP_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `SESSION_SECRET` values appear in `.next/static`.

## 10. Receipts

After options are saved → `BALLOT` receipts for contributors of all three options. After winner → `CANON` receipts for contributors of the winner. For each: insert row; send Nexconn Direct Channel message `CP:Receipt` from `cp_narrator`; client shows gold toast on arrival (or on next `/api/me` poll if the direct message fails — poll once at each REVEAL).

## 11. Bots (Judge Mode and load tests)

- 30 personas in `bots/personas.ts` (name, style, verbosity). Ideas: per round, an LLM call (or canned pool in mock mode) generates 60 short ideas in mixed styles for the current prompt; the runner schedules them across STORM with a bursty distribution.
- Bots send through the **Server API** as real Nexconn users (so screens receive them like any message) and are inserted with `source='bot'`.
- Votes: weighted random, slight bias to option A.
- All bot output carries `isBot:true` so UI shows 🤖.

## 12. Metrics

`metrics.ts` aggregates from tables: real users (non-bot, sent ≥1 idea or vote), shows completed, ideas, canon makers, median/p95 distill ms, fallback rate. `/impact` reads from this, cached 60 s.

## 13. Testing strategy

| Level | What |
|---|---|
| Unit | `machine.next` (every phase × trigger), tie-break, clustering thresholds, validators for LLM output (malformed, duplicates, unsafe, wrong ids), rate limiter, filter, time sync math |
| Integration (PGlite, mock realtime, mock LLM) | Full show via API calls: create → join ×N → ideas → distill → votes → reveal → finale; restart mid-round and resume; webhook + POST dedupe; veto replacement; zero-idea round; LLM failure → heuristic |
| E2E (Playwright, mock modes) | Host browser + 3 player contexts + screen page: complete 2 rounds; receipts appear; reconnect banner; `/try` completes with bots; mobile viewport 390×844 |
| Live smoke (`scripts/nexconn-smoke.ts`, needs creds) | issue token → create open channel → send `CP:State` → batch set + get metadata → send direct message → register low/priority types → webhook reachability note |
| Load (`scripts/load-sim.ts`) | 300 senders × 5 ideas in 30 s; assert distill ≤8 s p95 and no dropped ideas on the HTTP path |

## 14. Performance budgets

- Client bundle for `/play` ≤ 250 KB gzip excluding the Nexconn SDK.
- Tally publish coalesced to 2/s. Idea feed virtualised beyond 200 items. Screen rain capped at 40 nodes.

## 15. Deployment

- `Dockerfile`: multi-stage, `pnpm build`, `next start -p $PORT`. Health check `/api/health`.
- Migrations run on boot (`drizzle-kit migrate`).
- Webhook URL = `https://<host>/api/nexconn/webhook` configured in the Nexconn console.
- README documents Railway and Fly deploys step by step.
