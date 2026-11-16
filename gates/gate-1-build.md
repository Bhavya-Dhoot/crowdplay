# Gate 1 — CROWDPLAY build complete (mock-verified), 2026-11-17

## Decisions
All design decisions are in `docs/DECISIONS.md` (D1–D27). The load-bearing ones: Next 16 with `cacheComponents` off (D1);
mock transport refused in production, process exits (D2 + instrumentation); frozen `PublicState` with typed bot credits (D4);
AI layer DB-free, counts/credits recomputed from the DB (D10); metadata keys `cp_*` (D12, SDK charset); embeddings fallback
to local lexical vectors (D13); restart-safe effect claims (D16); channel sweep for the 50-channel Free cap (D21).

## Deltas from plan
- Build plan phases 0–10 ran as waves of parallel agents instead of strictly in order; contracts were frozen first.
- The Nexconn server SDK installs from git without `dist/`: a postinstall build was added (Dockerfile copies the script).
- CSS Modules were silently unscoped by the scaffold's Turbopack Tailwind rule; fixed with a rule condition.
- Lighthouse runs through a debug-port Chrome (chrome-launcher cannot spawn Chrome on this machine).
- Extra e2e spec `7-links` added by the orchestrator for A2/F4.

## Evidence
`docs/VERIFICATION.md`: clean-checkout `pnpm verify` exit 0 (947 unit/integration tests, build, secret canaries, 10 e2e);
Lighthouse `/` 97/100/100, `/play` 100/100/100 (STORM) and 98/100/100 (REVEAL); load sim p95 distill 1161 ms (mock);
Docker image builds, boots healthy, refuses mock without the flag.

## Open risks (need credentials or people)
1. Nothing has run against live Nexconn: custom-type delivery to Web clients (U4), metadata replay on join, direct-message
   receipts to clients that never opened the channel (U7), webhook delivery for non-persisted messages, ids containing `_`.
2. Nothing has run against a live LLM: real distill latency, Haiku/Sonnet tool-use behaviour, TTS and translation output.
3. Client-writable Open Channel metadata is forgeable; HTTP state stays authoritative, narrator-only message types are
   sender-checked.
4. Free-plan limits (connections, 50 open channels) are taken from docs, not measured.
5. CI workflow (`.github/workflows/ci.yml`) has not run (no remote yet).

## Ledger (delegate vs build)
| Work | Who | Why |
|---|---|---|
| Contracts (config, schema, realtime/engine/AI types, API contracts, auth), verify gate, secret check, Dockerfile | orchestrator | Every agent depended on them; architecture tier. |
| Nexconn SDK research | Sonnet agent | Bounded reading of docs + installed `.d.ts`; verifiable against files. |
| Engine + rooms API; AI pipeline; ingest + mock realtime; design system + client core | 4 parallel Sonnet agents | Disjoint file ownership, verified by typecheck + their tests + orchestrator re-runs. |
| Player, host, screen, Judge Mode, depth pages, Nexconn adapters, load sim + i18n, docs | 8 parallel Sonnet agents | Same; UI checked against a shared dev server. |
| e2e + screenshots | Sonnet agent (sole writer at that point) | Needed freedom to fix app bugs found by the suite. |
| Integration fixes (veto kind, channel sweep, reconnect loop, CSS modules, CLS, prod exit), Lighthouse, clean-checkout verify, Docker, VERIFICATION | orchestrator | Cross-cutting; final evidence must come from the orchestrator's own runs. |
