# CROWDPLAY build plan (orchestrator)

Spec: CLAUDE.md + docs/*. Definition of done: docs/GOAL.md. No credentials present on 2026-11-17
(no .env, no keys in shell env) -> build and verify in mock modes; live Nexconn/LLM runs are human steps.

Constraint: correctness of shared interfaces across parallel writers (one checkout, many agents),
then orchestrator context. Contracts are frozen by the orchestrator before any fan-out; each agent
owns a disjoint file set and runs only its own tests.

Failure modes:
- Agent edits a file it does not own -> ownership list in each brief; orchestrator reviews `git status`
  after each wave and reverts stray edits.
- Agent returns plausible-but-wrong code -> each wave ends with orchestrator running typecheck + the
  agent's tests itself; nothing is accepted on the agent's report alone.
- Agent times out / half-finishes -> wave gate fails visibly (typecheck/tests); re-brief with the
  remaining items, same agent via SendMessage.
- Two agents need the same dependency -> all deps installed in W0; agents may not touch package.json.
- Nexconn SDK differs from the pack -> SDK wins; only the two adapter files change; logged in
  docs/NEXCONN_FINDINGS.md.

Waves:
- W0 (orchestrator): scaffold Next 16 + deps; frozen contracts: config.ts, db/schema.ts,
  realtime/types.ts, engine/types.ts, ai/types.ts, api contracts, errors, verify.sh.
  Parallel: R1 Nexconn SDK research (skill install, llms.txt, installed types) -> docs/NEXCONN_SDK_NOTES.md.
- W1 (parallel backend + design system): engine+rooms API; AI pipeline; ingest+session+mock realtime;
  design system + primitives + client hooks; Nexconn adapters + smoke (R1 continued).
- W2 (parallel UI): player loop pages; host console; screen/overlay; judge mode + bots + depth pages.
- W3 (parallel): Playwright e2e + screenshots + Lighthouse; load-sim + secret check; docs.
- W4 (orchestrator): pnpm verify, GOAL.md line-by-line audit, fix gaps, final report.

Ledger:
- Contracts/architecture: build (orchestrator tier; every agent depends on them).
- Nexconn research: delegate (Sonnet) - bounded, verifiable against installed type files, noisy reading.
- Engine, AI, ingest, UI slices: delegate (Sonnet) - bounded by contracts, verified by typecheck + tests.
- Integration, verify, GOAL audit: build (orchestrator) - cross-cutting, needs whole-system view.
- Commits: orchestrator only, after each wave gate.
