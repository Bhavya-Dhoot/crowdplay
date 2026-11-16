# Progress

Orchestration plan: `plans/2026-11-17-crowdplay-build.md`. Agent rules: `plans/agent-rules.md`, UI kit: `plans/ui-kit.md`.

| Phase | Status | Notes |
|---|---|---|
| 0 Bootstrap | done | Next 16.4.6, deps, config, verify.sh (secret canaries), vitest, frozen contracts. |
| 1 Data and sessions | done | Drizzle schema + migration, PGlite fallback, session JWT (cookie + header fallback), ids, filter, rate limits. |
| 2 Realtime layer | in progress | Mock bus + SSE + client done; contract suite (mock) green. Nexconn SDKs installed (server SDK dist built by postinstall). Adapters + smoke + findings: agent running. |
| 3 Engine | done | Pure machine, advance with mutex + FOR UPDATE, effects with idempotency claims, ticker, publish coalescing, receipts, rooms/join/state/vote/host routes. 96 engine tests. |
| 4 Ideas and AI | done | Ingest + webhook dedupe; embeddings (mock/live), clustering, distill with validator + fallback chain, narration, prompts, finale, TTS/translate behind flags. |
| 5 Player loop UI | in progress | Design system + landing + useRoom done; /join, /play, /me agent running. |
| 6 Host console | in progress | Agent running. |
| 7 Screen / overlay | in progress | Agent running. |
| 8 Judge Mode | in progress | Agent running (runner, /api/try, /try). |
| 9 Depth | in progress | Story/OG, impact, how-it-works, admin agent running; load-sim + i18n agent running. |
| 10 Hardening | pending | e2e + screenshots + Lighthouse, docs, verify. |

## Blockers
- No `.env` / credentials on the build machine (2026-11-17): Nexconn live smoke, live LLM and the live show are human steps.
