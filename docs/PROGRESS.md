# Progress

Orchestration plan: `plans/2026-11-17-crowdplay-build.md`. Gate artifact: `gates/gate-1-build.md`. Evidence: `docs/VERIFICATION.md`.

| Phase | Status | Notes |
|---|---|---|
| 0 Bootstrap | done | Next 16.4.6, deps, config, verify.sh (secret canaries), CI workflow, frozen contracts. |
| 1 Data and sessions | done | Drizzle + PGlite/pg, session JWT (cookie + header fallback), ids, filter, rate limits. |
| 2 Realtime layer | done (offline) | Mock bus + SSE + client; Nexconn server/client adapters + codec from installed SDK types; smoke script; findings U1–U10. Live run needs creds. |
| 3 Engine | done | Pure machine, advance (mutex + FOR UPDATE), idempotent effects, ticker + channel sweep, restart recovery. |
| 4 Ideas and AI | done | Ingest + webhook dedupe; embeddings/cluster/distill with validator + fallback chain; narration, prompts, finale; TTS/translate behind flags. |
| 5 Player loop UI | done | /, /join, /play (all phases + error states), /me. Tag `spine-ok`. |
| 6 Host console | done | Wizard + three-column console with veto/re-roll/force-win/moderation. |
| 7 Screen / overlay | done | /screen with rain, bars, reveal, finale credits, OBS mode, sound + TTS playback. |
| 8 Judge Mode | done | /try with 30 labelled bots, boost, coach marks, end card. |
| 9 Depth | done | Story + OG image, /impact, /how-it-works, admin export, presets, cheers, multilingual, load sim. |
| 10 Hardening | done (mock) | e2e (10 tests) + 54 screenshots, Lighthouse, clean-checkout verify, Docker boot test, docs. |
| 11 Live + polish | done | Live on Nexconn + OpenAI (smoke 11/11, contract, live shows); perf pass (narration critical path, indexes, /me); 2-minute judge demo (zero-gate start, judge-paced vote/reveal, honest bot nudge). |
| 12 Design v3 | done | "Live Sketchnote" (plans/design-v3.md) on every surface; dead-code sweep; verify green, e2e 3x 10/10, Lighthouse 98/93/99 perf and 100 a11y; live show re-run passed on a degraded network. |
| 13 Deploy | ready | Public repo github.com/Bhavya-Dhoot/crowdplay; Render free-tier Blueprint (render.yaml) on a Neon Postgres. Applying it needs the founder's Render and Neon accounts. |

## Blockers (human-only)
- No credentials on the build machine (2026-11-17): `pnpm smoke:nexconn`, the Nexconn contract run, one live show with
  `REALTIME_MODE=nexconn LLM_MODE=live`, deploy + webhook URL, and real sessions. Exact steps: `docs/VERIFICATION.md` §7.
