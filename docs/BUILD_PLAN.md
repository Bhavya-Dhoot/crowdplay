# CROWDPLAY — Build Plan

Ten phases. Each ends with a gate. Do them in order; phases 6–9 can be parallelised across subagents once Phase 5 passes.

## Phase 0 — Bootstrap
- `git init`; create Next.js app (TypeScript, App Router, Tailwind, ESLint); pnpm.
- Copy this pack into `docs/`; copy `env.example` → `.env.example`; put `CLAUDE.md` at repo root.
- Add Vitest, Playwright, Drizzle + PGlite + pg, zod, pino, nanoid, framer-motion, lucide-react, qrcode, canvas-confetti, jose.
- `src/lib/config.ts` (env schema, flags, timings), `scripts/verify.sh`, CI workflow (typecheck, lint, test).
- **Gate:** `pnpm typecheck && pnpm lint && pnpm test` green on an empty test.

## Phase 1 — Data and sessions
- Drizzle schema + migrations (TECH_SPEC §4); DB client with PGlite fallback.
- `POST /api/session`, cookie JWT, `GET /api/health`, `GET /api/time`.
- `ids.ts` (room codes without ambiguous chars), `filter.ts` (blocklist), `ratelimit.ts`.
- **Gate:** unit tests for ids, filter, ratelimit, session round-trip.

## Phase 2 — Realtime layer
- `realtime/types.ts` (freeze `PublicState`, message payloads, interfaces).
- Mock server bus + SSE route + mock client.
- Install `nexconn-chat` Skill and Nexconn packages; read types; implement `nexconn.server.ts` and `nexconn.client.ts`.
- `scripts/nexconn-smoke.ts` covering U1–U10; write `docs/NEXCONN_FINDINGS.md` (answers or "needs creds").
- **Gate:** contract test suite runs the same assertions against the mock adapter; smoke passes if creds exist.

## Phase 3 — Engine
- `machine.ts` pure transitions with exhaustive unit tests (every phase × trigger, pause/resume, extend, force-win, veto, reroll).
- `advance.ts` (row lock / mutex, effect idempotency), `ticker.ts`, lazy advance, `publish.ts`, `tally.ts`.
- Rooms API: create, join, state, host actions.
- **Gate:** integration test runs a 3-round show with stubbed AI effects; concurrency test (20 parallel `advance`); restart-resume test.

## Phase 4 — Ideas and AI
- Ingestion (HTTP + webhook, dedupe), incremental embeddings, `cluster.ts`, `distill.ts`, `narrate.ts`, prompt generator, `heuristics.ts`, `providers.ts` with timeouts and fallbacks, mock LLM mode.
- Veto/re-roll using stored backups; zero/low-idea rules.
- **Gate:** validator tests with bad LLM outputs; clustering fixture test; failure-injection tests (B1–B4).

## Phase 5 — Player loop UI (the spine on screen)
- Tokens, primitives, `PhaseHeader`, countdown with clock offset, `ConnectionBanner`, toasts.
- `/`, `/join/[code]`, `/play/[code]` with every phase state; vote flow; receipts toast; `/me`.
- **Gate:** Playwright: host via API + 3 players complete 2 rounds in mock mode; screenshots saved. **Commit and tag `spine-ok`.**

## Phase 6 — Host console
- Setup wizard, control column, live column with moderation, room column, counters, host heartbeat.
- **Gate:** e2e host drives a show manually; veto, re-roll, force-win, ban covered.

## Phase 7 — Screen / overlay
- `/screen/[code]` all phases, idea rain, bars, reveal, finale credits, OBS mode, optional sounds/TTS playback.
- **Gate:** visual screenshots per phase at 1920×1080; no layout shift.

## Phase 8 — Judge Mode and bots
- Personas, canned pools, bot runner through the realtime server adapter, `/try` with coach marks and demo boost, banner.
- **Gate:** e2e `/try` completes 3 rounds unattended; judge idea reaches ballot; bots excluded from `/api/impact`.

## Phase 9 — Depth
- Finale recap + `/story/[showId]` + OG image; `/impact`; `/how-it-works` (diagram + Feature → Nexconn table); presets; cheers; admin export; TTS and multilingual behind flags.
- `scripts/load-sim.ts` and results.
- **Gate:** GOAL §F items checked.

## Phase 10 — Hardening and ship
- Accessibility pass, reduced motion, Lighthouse reports, error/empty states matrix, copy pass.
- Security pass: headers, secret check, webhook checks, rate limits.
- Live run with real Nexconn + live LLM if creds exist; fix findings.
- Dockerfile, deploy docs, README, `docs/WRITEUP.md`, `docs/DEMO_SCRIPT.md`, `docs/VERIFICATION.md`.
- **Gate:** `pnpm verify` green; GOAL fully satisfied.

## Order of sacrifice if anything must give
Never cut: spine, Judge Mode, safety, host console, screen. Cut last-to-first: multilingual → TTS → cheers → admin export → OG image.
