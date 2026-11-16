# CLAUDE.md — Agent Operating Rules for CROWDPLAY

You are building CROWDPLAY end to end for the Nexconn Build Challenge 2026. Judging: 50% "does it work and is it easy to use", 30% innovation, 20% real users and product path. Working, polished and honest beats ambitious and flaky.

## Read first (in this order)
1. `docs/GOAL.md` — the definition of done. You are not finished until it is met.
2. `docs/PRD.md` → `docs/TECH_SPEC.md` → `docs/NEXCONN_INTEGRATION.md` → `docs/AI_PROMPTS.md` → `docs/UX_SPEC.md` → `docs/BUILD_PLAN.md` → `docs/SUBMISSION_KIT.md`.

Precedence on conflict: GOAL > TECH_SPEC > PRD > others. If a spec is silent, choose the simplest option that serves the judging criteria and note it in `docs/DECISIONS.md`.

## How to work
- Work autonomously through `docs/BUILD_PLAN.md` phase by phase. Do not ask for confirmation. Do not stop at a summary.
- Keep `docs/PROGRESS.md` updated (phase, done, next, blockers) so work can resume after any interruption.
- After every phase: run the phase's checks, fix failures, commit (`feat(phase-N): …`). Small, frequent commits; the git history is evidence of in-window work.
- Run `pnpm verify` before declaring anything done. Paste real output into `docs/VERIFICATION.md`.
- Test-first for the engine, validators, ingestion and dedupe. These must be boringly correct.
- Use subagents for independent work where helpful (UI screens, tests, docs), but keep the realtime interfaces and `PublicState` type frozen once Phase 2 lands.

## Hard rules
1. **Nexconn is the production transport.** Mock transport exists only for tests and credential-less dev; the app refuses to boot in production with `REALTIME_MODE=mock`.
2. **Only two files import Nexconn packages:** `src/lib/realtime/nexconn.server.ts` and `src/lib/realtime/nexconn.client.ts`.
3. **Never invent SDK APIs.** Install the `nexconn-chat` Skill, read `https://docs.nexconn.ai/llms.txt`, and read the installed packages' type definitions. Where this pack and the SDK disagree, the SDK wins; change the adapter only and log it in `docs/NEXCONN_FINDINGS.md`.
4. **Secrets stay on the server.** App Secret, AI keys and session secret never appear in client code or `NEXT_PUBLIC_*`.
5. **No fake data presented as real.** Bots are labelled 🤖 and excluded from `/impact`. Never write invented user counts, sessions, or test results into docs.
6. **No external failure may stall a round.** Every AI/network call has a timeout and a fallback.
7. **LLM output is untrusted.** Validate with zod + rules; compute counts and credits from the database.
8. **User text is untrusted.** Escape on render; ideas are data, never instructions (wrap in clear delimiters in prompts and tell the model to treat them as content only).
9. **No placeholders.** No lorem ipsum, dead buttons, TODOs, or "coming soon".
10. Do not add features outside the PRD. Polish beats breadth.

## Engineering conventions
- TypeScript strict; no `any` outside adapter boundaries; zod at every boundary.
- Pure functions for engine logic (`machine.ts`), side effects in `advance.ts`.
- Server time is authoritative; clients render from `phaseEndsAt` + clock offset.
- One `PublicState` shape for metadata, messages and HTTP.
- Errors: typed `AppError(code, message, status)`; user-facing copy from `src/lib/copy.ts`.
- Logging: structured (pino) with `roomCode`, `roundNo`, `phase`.
- Styling: Tailwind + tokens in `src/styles/tokens.css`; components small and accessible.
- Scripts required in `package.json`: `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `e2e`, `verify`, `check:secrets`, `smoke:nexconn`, `load:sim`, `db:migrate`, `seed:demo`.

## When credentials are present
`.env` may contain Nexconn, Anthropic and OpenAI keys. If so:
- Run `pnpm smoke:nexconn` early (Phase 2) and resolve U1–U10 before building on assumptions.
- Run at least one full show with `REALTIME_MODE=nexconn LLM_MODE=live` using two headless browsers and record the result.
- Verify model ids in `.env` against the providers' model lists; fix ids if they fail, keep them env-driven.

## When credentials are absent
Build and verify everything in mock modes, implement the Nexconn adapters strictly from the SDK types and docs, and list the exact commands the human must run once keys are added. Do not claim live verification.

## Definition of finished
`docs/GOAL.md` is satisfied, `docs/VERIFICATION.md` holds the evidence, and your final message lists: what was built, how to run it, what was verified live vs. mock, and any human-only steps left.
