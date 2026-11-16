# Progress

Orchestration plan: `plans/2026-11-17-crowdplay-build.md`.

| Phase | Status | Notes |
|---|---|---|
| 0 Bootstrap | done | Next 16.4.6, deps, config, verify.sh, vitest, frozen contracts (config, schema, realtime/engine/ai types, API contracts, session/host-key auth). Gate: typecheck + lint + test green. |
| 1 Data and sessions | in progress | |
| 2 Realtime layer | in progress | Nexconn SDK research running. |
| 3 Engine | pending | |
| 4 Ideas and AI | pending | |
| 5 Player loop UI | pending | |
| 6 Host console | pending | |
| 7 Screen / overlay | pending | |
| 8 Judge Mode | pending | |
| 9 Depth | pending | |
| 10 Hardening | pending | |

## Blockers
- No `.env` / credentials on the build machine (2026-11-17): Nexconn live smoke, live LLM and live show are human steps.
