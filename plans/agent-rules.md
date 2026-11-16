# Rules for every build agent (read fully before starting)

Project: CROWDPLAY at `H:\Nexconn` (Windows; use the Bash tool with POSIX syntax and absolute paths, or
`cd /h/Nexconn && ...`). pnpm, Node 22, Next.js 16.4.6 (App Router, Turbopack), React 19, Tailwind 4,
zod 4, drizzle-orm 0.45 + PGlite, Vitest 5, Playwright. Spec: `CLAUDE.md` + `docs/*.md`;
definition of done: `docs/GOAL.md`; decisions so far: `docs/DECISIONS.md`.

## You share the checkout with other agents working at the same time
- Edit ONLY the files/directories your brief says you own. Create new files only inside your owned paths.
- Never edit FROZEN files: `src/lib/realtime/types.ts`, `src/lib/engine/types.ts`, `src/lib/ai/types.ts`,
  `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `src/lib/api/contracts.ts`, `src/lib/config.ts`,
  `src/lib/errors.ts`, `src/lib/log.ts`, `src/lib/ids.ts`, `src/lib/auth/*`. If you truly need a change
  there, finish what you can and report the exact change needed.
- STUB files (header `// STUB (owner: ...)`) that you own: replace the body, keep every exported name and
  signature exactly; remove the STUB header. Stubs you do not own: import them, do not edit them.
- Do not touch `package.json`, the lockfile, or run `pnpm add`. If a dependency is missing, report it.
  Installed: zod, drizzle-orm, @electric-sql/pglite, pg, pino, nanoid, framer-motion, lucide-react,
  qrcode, canvas-confetti, jose, @anthropic-ai/sdk, openai, vitest, @playwright/test, tsx.
- No git commands that change state (status/diff are fine). The orchestrator commits.
- Do not run `pnpm build`, `next dev`, `next start` or `pnpm verify` unless your brief says so.
- Do not spawn subagents.

## Checks you run
- `pnpm exec vitest run <your test files>` — tests live in `src/tests/unit/<area>-*.test.ts` and
  `src/tests/integration/<area>-*.test.ts` (Vitest config sets REALTIME_MODE=mock, LLM_MODE=mock).
- `pnpm exec next typegen && pnpm exec tsc --noEmit` — fix errors in YOUR files only; other agents' files
  may be mid-edit. `pnpm exec eslint <your paths>` must be clean.

## Conventions
- TypeScript strict; no `any` outside Nexconn adapter boundaries; zod at every boundary (zod 4:
  `z.record(z.string(), v)` needs both args; errors are `err.issues`).
- DB: `const db = await getDb()` from `@/lib/db/client`; tables via `schema` export; tests call
  `useTestDb()` in `beforeAll` (fresh in-memory PGlite, migrated) and `close()` in `afterAll`.
- Route handlers: `export const dynamic = "force-dynamic"`; wrap bodies in `handle(async () => ...)` from
  `@/lib/errors`; throw `AppError(code, friendlyMessage, status)`; JSON errors are `{ok:false, code, message}`.
  `params` is a Promise: `{ params }: { params: Promise<{ code: string }> }`. When unsure about a Next API,
  read `node_modules/next/dist/docs/01-app/` (Next 16 differs from older versions).
- Process singletons (caches, buses, timers, mutexes, buckets) live on `globalThis`
  (`const g = globalThis as unknown as { __cpX?: T }`) — route bundles and instrumentation do not share modules.
- Logging: `log` from `@/lib/log` (pino), with `{ roomCode, roundNo, phase }` where relevant.
- Every AI/network call has a timeout and a fallback; no external failure may stall a round.
- User text and LLM output are untrusted: validate, escape on render (React does), never interpolate into
  instructions without delimiters.
- No TODO/FIXME, no placeholders, no lorem ipsum, no dead buttons, no invented numbers.
- Comments: brief, only where the why is not obvious.

## Report back (max 40 lines)
Files created/changed; test files and the final vitest summary line; any deviation from the contracts;
anything you need from another area; anything unfinished. No code dumps.
