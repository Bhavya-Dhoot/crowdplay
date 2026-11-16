# CROWDPLAY — Goal Condition (Definition of Done)

## Goal condition (paste this as the goal)

> **The goal is met only when ALL of the following are true in the repository's final state:**
> 1. `pnpm verify` exits 0 on a clean checkout with **no** external credentials (mock modes), running: typecheck, lint, unit + integration tests, production build, secret-leak check, and the Playwright e2e suite.
> 2. Every item in sections A–F below is implemented and covered by at least one automated test or an explicit entry in `docs/VERIFICATION.md` with evidence (command output or screenshot path).
> 3. If Nexconn credentials are present in `.env`, `pnpm smoke:nexconn` exits 0 and `docs/NEXCONN_FINDINGS.md` records the answer to every question U1–U10 in `NEXCONN_INTEGRATION.md`, and one full round has been run with `REALTIME_MODE=nexconn` (evidence in `docs/VERIFICATION.md`). If credentials are absent, this is reported clearly as the single remaining human step — never faked.
> 4. `README.md`, `docs/WRITEUP.md`, `docs/DEMO_SCRIPT.md` and `/how-it-works` exist and match the built product.
> 5. No TODO/FIXME/placeholder UI, no dead buttons, no console errors during the e2e run.
>
> Do not stop, summarise, or ask for confirmation before the condition is met. If blocked on something only a human can do, finish everything else, then list the blockers precisely.

## `pnpm verify` must run (in `scripts/verify.sh`)

```
pnpm typecheck && pnpm lint && pnpm test && \
REALTIME_MODE=mock LLM_MODE=mock pnpm build && \
pnpm check:secrets && \
REALTIME_MODE=mock LLM_MODE=mock pnpm e2e
```

## A. Spine works end to end
- [ ] A1 Guest session + name → joined room in ≤15 s (e2e measures steps, not wall time).
- [ ] A2 Host creates a show; QR and three links work.
- [ ] A3 Full loop PROMPT → STORM → DISTILL → VOTE → REVEAL repeats for N rounds, then FINALE, with auto-advance and with manual host control.
- [ ] A4 Ideas from three browsers appear on each other's feeds and on `/screen` within 1 s (mock transport).
- [ ] A5 Exactly three options every round: two crowd, one wildcard (or narrator-filled per FR-16). Validator tests cover malformed LLM output.
- [ ] A6 One vote per user; changeable until deadline; live bars; tie-break rule tested.
- [ ] A7 Narration shown with credits "@a, @b, @c + N others"; names come from the database, not the model.
- [ ] A8 BALLOT and CANON receipts delivered in-app and listed on `/me`.
- [ ] A9 Late join and page reload restore the current phase within 2 s.
- [ ] A10 Server restart mid-round resumes the show (integration test).

## B. Resilience
- [ ] B1 LLM timeout/failure → heuristic options; round completes; host sees warning.
- [ ] B2 Embeddings failure → LLM-only path.
- [ ] B3 Zero-idea round completes with narrator options.
- [ ] B4 Webhook + HTTP double delivery inserts one idea.
- [ ] B5 Realtime disconnect → banner → HTTP polling keeps state correct → reconnect resumes.
- [ ] B6 `advance()` called concurrently 20× causes one transition (test).

## C. Safety and security
- [ ] C1 Blocked words never reach `/screen`, options or narration (test with fixtures).
- [ ] C2 Host veto replaces an option within 3 s; re-roll limited to once per round; force-win works.
- [ ] C3 Mute/ban stops ideas server-side.
- [ ] C4 Secrets absent from client bundles (`pnpm check:secrets`).
- [ ] C5 Webhook rejects bad signature and stale timestamps (unit test with the scheme found in docs; if scheme unknown without creds, test the abstraction and document).
- [ ] C6 Rate limits enforced (1 idea / 2 s; 12 per round).

## D. Judge Mode
- [ ] D1 `/try` runs a 3-round demo with 30 labelled bots, no host action needed.
- [ ] D2 The judge's idea can reach the ballot (demo boost) and a receipt appears.
- [ ] D3 Bots are labelled 🤖 everywhere and excluded from `/impact`.

## E. UX quality (50% of the score)
- [ ] E1 Every screen and state in `UX_SPEC.md` §3–4 exists (Playwright screenshots saved to `docs/screens/` for: landing, join, each player phase, host, screen in each phase, try, me, story, impact, how-it-works; at 390×844 and 1440×900).
- [ ] E2 No horizontal scroll at 360 px; touch targets ≥44 px.
- [ ] E3 `prefers-reduced-motion` honoured; aria-live announcements present.
- [ ] E4 Lighthouse (mobile, mock mode) on `/` and `/play`: Accessibility ≥95, Performance ≥85 — report saved in `docs/lighthouse/`.
- [ ] E5 Zero console errors/warnings from our code in e2e.

## F. Depth and submission assets
- [ ] F1 Finale recap + `/story/:showId` + OG share image.
- [ ] F2 `/impact` with real (non-bot) aggregates; `/how-it-works` with Feature → Nexconn table and architecture diagram.
- [ ] F3 Presets: Heist, Fantasy Quest, Space Mission, Murder Mystery, Classroom, Custom.
- [ ] F4 OBS overlay mode `?obs=1`.
- [ ] F5 `scripts/load-sim.ts`: 300 senders × 5 ideas / 30 s in mock mode → distill ≤8 s p95; results in `docs/VERIFICATION.md`.
- [ ] F6 `README.md` (setup, env, deploy, "How judges can test it", limitations, prior work), `docs/WRITEUP.md`, `docs/DEMO_SCRIPT.md`, `Dockerfile`, `.env.example`.
- [ ] F7 Feature flags: TTS, multilingual, cheers implemented behind flags with tests for flag-off behaviour; flag-on verified at least manually and noted.

## Non-negotiables
- Production path uses Nexconn for all real-time delivery. The mock transport must be impossible to enable in production by accident.
- Never fabricate traction, users, or verification results.
- All Nexconn imports confined to the two adapter files.
