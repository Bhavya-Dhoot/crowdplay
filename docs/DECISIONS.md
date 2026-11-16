# Decisions

Choices where the spec was silent or had to be refined. Precedence: GOAL > TECH_SPEC > PRD > others.

| # | Decision | Why |
|---|---|---|
| D1 | Next.js 16.4.6 with `cacheComponents` **off** (the create-next-app default turns it on). | Every page is live, per-request state; Partial Prerendering adds Suspense constraints with no benefit here. |
| D2 | `REALTIME_MODE` defaults to `mock` when unset; `assertBootable()` (called from `instrumentation.ts`) refuses `NODE_ENV=production` + mock unless `ALLOW_MOCK_IN_PROD=1`. | Credential-less dev works out of the box, and a production deploy that forgets the variable fails loudly instead of silently using the mock. The e2e suite runs `next start` with `ALLOW_MOCK_IN_PROD=1`. |
| D3 | `TIMING_SCALE` env (default 1, max 1) multiplies every phase duration. | Lets e2e and `/try` tests run a full show in seconds without a second code path. Never set in production. |
| D4 | `PublicState` adds `premise`, `preset`, `isDemo`, `finale`, `i18n`, `option.boosted`; credits are `{name, bot}` objects instead of strings. | LOBBY needs the premise card, Judge Mode needs the boost tag, and bots must be labelled 🤖 everywhere, which needs a typed flag rather than a name convention. |
| D5 | `CP:Idea` carries `roundNo` instead of `roundId`. | Clients only know the round number; the server resolves the round from (show, roundNo). |
| D6 | `CP:Moderation` hides ideas by `{userId, clientMsgId}` (and `hideUserIds` for bans), not by server idea id. | Clients render ideas straight from realtime messages and never see server ids. |
| D7 | Manual mode (`autoAdvance=false`): STORM and VOTE still end on their timers (players see countdowns); REVEAL holds until the host presses **Next round**; LOBBY and FINALE always wait for the host. | Keeps countdowns honest while giving the host control of pacing between rounds. |
| D8 | Extra engine effects `REPLACE_OPTION` (veto) and trigger types `HOST_SET_AUTO`, `HOST_SET_VOICE`. Re-roll returns to DISTILL with mode `reroll` and clears votes. | Veto/re-roll/toggles are host triggers in the PRD; modelling them as machine transitions keeps one code path and versioned state. |
| D9 | Votes are HTTP-only (secret, authoritative); everything players *see* is delivered through the realtime transport. | As designed in NEXCONN_INTEGRATION §6. |
| D10 | AI modules are DB-free (`src/lib/ai/types.ts`); the engine loads inputs, persists outputs and recomputes counts/credits from the DB. | FR-14: LLM output is untrusted; keeps AI code unit-testable with fixtures. |
| D11 | Process singletons (DB, mock bus, ticker, mutexes, rate limiters, embedding cache) live on `globalThis`. | Next bundles `instrumentation.ts` and route handlers separately; module-level state would not be shared. |
| D12 | Open Channel metadata keys use `cp_phase`, `cp_prompt`, … (underscore) instead of `cp.phase`. | Nexconn metadata key charset is letters, digits and `+ = - _` (docs/NEXCONN_SDK_NOTES.md). |
