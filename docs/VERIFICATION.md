# Verification evidence

Everything below was produced on the build machine on **2026-11-17** (Windows 11, Node 22.17.1, i9-11950H).
Sections 1–4 and 6 ran in mock modes with no external credentials (`REALTIME_MODE=mock`, `LLM_MODE=mock`), as
`pnpm verify` requires. Section 5 ran **live** later the same day against Nexconn (Singapore data center) and OpenAI,
after the Nexconn and OpenAI keys were added to `.env` (no Anthropic key).

## 1. `pnpm verify` on a clean checkout (GOAL condition 1)

Fresh `git clone` of this repository into an empty folder, then `pnpm install --frozen-lockfile` (postinstall built the
Nexconn server SDK: `[nexconn] built @nexconn/server-sdk dist/`, `install_exit=0`), then `pnpm verify`
(`scripts/verify.sh`: typecheck → lint → unit + integration → production build with canary secrets → secret-leak
check → Playwright e2e). Real output, trimmed to the result lines:

```
> next typegen && tsc --noEmit
✓ Types generated successfully
> eslint .
> vitest run
 Test Files  52 passed (52)
      Tests  947 passed | 13 skipped (960)
> next build
✓ Compiled successfully in 9.9s
✓ Generating static pages using 15 workers (7/7) in 539ms
> tsx scripts/check-no-secret.ts
check:secrets: OK — 6 secret value(s) checked across 71 client-visible file(s).
> playwright test
Running 10 tests using 1 worker
SPINE_RESULTS {"joinedAfterMs":834,"lateJoinRestoreMs":192,"reloadRestoreMs":205,"distillOnScreenMs":1587,"ideaLatencyMs":{"samples":18,"median":157,"max":202}}
  ok  1 [chromium] › 1-spine.spec.ts › spine: join, two auto-advancing rounds, ideas, votes, credits, receipts, restore (52.4s)
HOST_RESULTS {"vetoReplacementMs":72}
  ok  2 [chromium] › 2-host.spec.ts › host: run a whole round by hand from the console (26.9s)
RECONNECT_RESULTS {"pollCaughtUpMs":1436,"backOnlineMs":5397,"resumedUpdateMs":72}
  ok  3 [chromium] › 3-reconnect.spec.ts › reconnect: banner, HTTP poll keeps the phase right, back online, stream resumes (10.0s)
  ok  4 [chromium] › 3-reconnect.spec.ts › reconnect: the composer says 'Reconnecting…' while the stream is down (5.8s)
JUDGE_RESULTS {"demo":{"botPlayers":"30","botIdeas":"180"},"impact":{"realPeople":7,"showsCompleted":2,"ideas":11,"canonMakers":1,"medianDistillMs":1534,"p95DistillMs":1564,"fallbackRate":0}}
  ok  5 [chromium] › 4-judge.spec.ts › judge: /try plays three rounds alone, boosts the judge's idea, labels every bot, stays out of /impact (52.8s)
  ok  6 [chromium] › 5-a11y.spec.ts › a11y: 360 px layout, 44 px targets and live regions on every page and phase (16.8s)
  ok  7 [chromium] › 5-a11y.spec.ts › a11y: the big screen announces phases in an aria-live region (2.4s)
  ok  8 [chromium] › 5-a11y.spec.ts › a11y: with prefers-reduced-motion no confetti is drawn and the show still works (14.6s)
SCREENSHOTS 52
  ok  9 [chromium] › 6-screens.spec.ts › screens: every page and phase at 390x844 and 1440x900 (35.6s)
  ok 10 [chromium] › 7-links.spec.ts › host wizard creates a show whose QR and three links work, incl. the OBS overlay (2.6s)
  10 passed (3.8m)
verify: all gates passed
verify_exit=0
```

The 13 skipped tests are the Nexconn half of `realtime-contract.test.ts`; they run only with
`REALTIME_CONTRACT=nexconn` and credentials. `JUDGE_RESULTS.impact` counts the e2e run's own scripted test players
(the demo room and its 30 bots are excluded, which is what the test asserts) — it is test data, not usage.

The same suite also passed 3 consecutive times in the working tree before this run (QA agent log), and
`pnpm e2e` ran green in isolation after the last e2e spec (`7-links`) was added.

### Re-run with a local `.env` present (2026-11-17)

After `.env` was created (Nexconn/AI lines still empty), `pnpm verify` was run again in the working tree:
`Test Files 52 passed (52)`, `Tests 947 passed | 13 skipped`, `check:secrets: OK — 8 secret value(s) checked`
(now including the `.env` session secret and admin token), `10 passed (4.3m)`, `verify: all gates passed`.
Two earlier re-runs exposed timing flakes that were fixed rather than retried: the DISTILL screenshot race (mock
DISTILL widened to 3 s in the e2e server) and two wall-clock unit bounds that failed under parallel load.

### Re-run on design v3 "Live Sketchnote" (2026-11-17, after the redesign and the dead-code sweep)

`pnpm verify`, real result lines: `Test Files 65 passed | 1 skipped (66)`, `Tests 1059 passed | 14 skipped (1073)`,
`check:secrets: OK — 10 secret value(s) checked across 70 client-visible file(s).`, `10 passed (5.1m)`,
`verify: all gates passed`. Then `pnpm e2e` twice more on the same build: `10 passed (4.4m)` and `10 passed (4.1m)`.
`tsc --noEmit --noUnusedLocals --noUnusedParameters`: 0 errors; `node scripts/find-dead-exports.mjs`: 0 unused exports,
0 files nothing imports.

Live checks are one command once the Nexconn lines in `.env` are filled: `pnpm live:check` (smoke → Nexconn
contract → build into `.next-live` → two headless phones + big screen play one full round over Nexconn; results are
written to `docs/live-results/`). Its spec was dry-run against the mock server (`E2E_LIVE=1 LIVE_DRY_RUN=1`): passed.

## 2. GOAL A–F → evidence

Test files are under `src/tests/`. "e2e" = Playwright specs above; numbers are from the clean-checkout run.

### A. Spine
| Item | Evidence |
|---|---|
| A1 join ≤15 s / steps | e2e `1-spine`: landing → idea box is 3 steps (code form, "I'm in", idea box; name prefilled). `joinedAfterMs` 834 ms. |
| A2 show + QR + three links | e2e `7-links`: wizard creates a show; console QR present; copied join / screen / OBS links open the join ticket, the big screen (with QR) and a transparent overlay. `integration/engine-rooms.test.ts` checks the links returned by `POST /api/rooms`. |
| A3 full loop, auto + manual | e2e `1-spine` (two auto-advancing rounds), e2e `2-host` (manual). `integration/engine-show.test.ts` "runs create -> join x3 -> ideas -> distill -> votes -> reveal x3 -> FINALE -> ENDED" + manual variant; `unit/engine-machine.test.ts` (every phase × trigger). |
| A4 ideas across browsers ≤1 s | e2e `1-spine`: 18 samples to other phones and `/screen`, median 157 ms, max 202 ms (mock transport). |
| A5 exactly three options | `unit/ai-validator.test.ts`, `unit/ai-distill.test.ts`, `unit/ai-chain.test.ts` (malformed LLM output → repair → heuristics); FR-16 narrator fill in `ai-distill` "uses three narrator options when nobody wrote anything". e2e asserts A/B/C cards with a wildcard. |
| A6 one vote, changeable, live bars, tie-break | `integration/engine-rooms.test.ts` ("one vote per user; changing it moves the tally", FR-18 rejections, "a tie goes to the option with the earliest first supporting idea, and the tie-break is logged"); `unit/engine-tally.test.ts`; e2e `1-spine` changes a vote and watches bars move. |
| A7 narration + credits from DB | `integration/engine-show.test.ts` (credits are DB names); `unit/ai-text.test.ts` (narration never contains @mentions / names); e2e `1-spine` reads `narration` + `credits`. |
| A8 BALLOT/CANON receipts in-app and on /me | `integration/engine-show.test.ts` (receipt rows); e2e `1-spine` (gold toast / canon moment, then the receipts on `/me`). |
| A9 late join / reload ≤2 s | e2e `1-spine`: late join 192 ms, reload mid-VOTE restores phase + my vote 205 ms; `integration/engine-rooms.test.ts` "a rejoining player gets their vote and 'yours' options back". |
| A10 restart mid-round | `integration/engine-concurrency.test.ts`: restart during STORM, VOTE, DISTILL (resolved by the cap tick) and REVEAL (lost narration recovered). |

### B. Resilience
| Item | Evidence |
|---|---|
| B1 LLM failure → heuristics, host warning | `unit/ai-chain.test.ts` ("a provider that hangs still yields options inside the budget", "provider errors on both providers fall straight to heuristics"); `integration/engine-resilience.test.ts` (distillRound throwing → heuristic retry, `fallback_used`, host feed `metrics.fallbackUsed`). Host UI renders the ⚠ pill (`fallback-warning`). |
| B2 embeddings failure → LLM-only path | `unit/ai-chain.test.ts` "falls back to lexical vectors on a sample when embeddings fail, and still returns three options", "does not wait for slow embeddings beyond the 0.8 s flush window" (DECISIONS D13). |
| B3 zero-idea round | `integration/engine-resilience.test.ts` "zero ideas -> three narrator options, no credits, no receipts, the round still completes". |
| B4 webhook + HTTP double delivery | `integration/ingest-webhook.test.ts` "webhook then HTTP double delivery inserts one idea and both report ok (B4)"; `integration/ingest-mock-routes.test.ts` (end to end through the mock transport); `integration/ingest-ideas.test.ts` dedupe suite. |
| B5 disconnect → banner → HTTP poll → resume | e2e `3-reconnect`: poll caught the new phase 1436 ms into a 5 s outage, "Back online" at 5397 ms, next stream update 72 ms after resume; `unit/realtime-mock-client.test.ts` (no reconnect loop regression). |
| B6 20 concurrent advance() → one transition | `integration/engine-concurrency.test.ts` "20 concurrent advance(TICK) past a deadline make exactly one transition" (+ CLOSE_VOTE/receipts/narration run once). |

### C. Safety and security
| Item | Evidence |
|---|---|
| C1 blocked words never reach screen/options/narration | `unit/ai-distill.test.ts` "never lets a blocked word reach a label, a source list or the backups (C1)"; `unit/ai-text.test.ts` narration replaced by template; `integration/ingest-ideas.test.ts` (blocked never stored `ok`, moderation hide sent); `unit/client-store.test.ts` (clients pre-filter); `unit/ingest-filter.test.ts` (fixtures incl. leetspeak, Scunthorpe-safe words). |
| C2 veto ≤3 s, re-roll once, force-win | `integration/engine-host.test.ts`; e2e `2-host`: veto replacement visible on every phone in 72 ms, second re-roll refused (409), force win reaches REVEAL. |
| C3 mute/ban server-side | `integration/ingest-ideas.test.ts` (muted / banned refused and never stored, webhook path too); `integration/engine-host.test.ts`; e2e `2-host` (banned phone sees the removal message; 403s asserted). |
| C4 secrets absent from client bundles | `pnpm check:secrets` after a build with canary values for every secret (section 1); `unit/config.test.ts`. |
| C5 webhook signature + stale timestamp | Real Nexconn scheme `sha1(AppSecret+Nonce+Timestamp)`: `unit/nexconn-server.test.ts` (bad signature, wrong secret, wrong AppKey, stale/future timestamp, missing headers, unsigned body still parsed strictly). Mock scheme: `unit/realtime-webhook-verify.test.ts`. Body is not signed by Nexconn (U5), so ingest re-validates sender/phase/filter. |
| C6 rate limits | `unit/ingest-ratelimit.test.ts` (1 per 2 s); `integration/ingest-ideas.test.ts` "caps a user at 12 ideas per round". |

### D. Judge Mode
| Item | Evidence |
|---|---|
| D1 /try 3 rounds, 30 bots, no host action | e2e `4-judge`; `integration/bots-try.test.ts` (unattended 3-round run); `integration/bots-runner.test.ts`. |
| D2 judge idea reaches ballot + receipt | e2e `4-judge` (⚡ boosted wildcard credited to the judge, receipt each round); `integration/bots-try.test.ts`. |
| D3 bots labelled, excluded from /impact | e2e `4-judge` (every bot idea has 🤖; `/api/impact` excludes the demo); `integration/depth-impact.test.ts` "excludes bots, deleted users and demo rooms from every total". |

### E. UX quality
| Item | Evidence |
|---|---|
| E1 every screen/state, screenshots | e2e `6-screens` + `4-judge` + `7-links`: 54 PNGs in `docs/screens/` at 390×844 and 1440×900 (landing, join, play-lobby…finale, host, screen-lobby…finale, try, me, story, impact, how-it-works) + `screen-obs-1920x1080.png`. Mock modes, scripted test players — see `docs/screens/README.md`. |
| E2 no horizontal scroll at 360 px, targets ≥44 px | e2e `5-a11y` (hit-test audit on every page and every reachable `/play` phase). |
| E3 reduced motion, aria-live | e2e `5-a11y` (no confetti under `prefers-reduced-motion`, live regions on `/play` and `/screen`). |
| E4 Lighthouse mobile ≥95 a11y / ≥85 perf | Section 3. |
| E5 zero console errors/warnings | e2e fixture `src/tests/e2e/fixtures.ts` fails any test on any console error/warning or page error on any page; allowlist is empty (only declared HTTP 403s for the deliberate muted/banned attempts in `2-host`, which must occur). |

### F. Depth and submission assets
| Item | Evidence |
|---|---|
| F1 finale recap, /story, OG image | `integration/depth-story.test.ts` (route, credits, demo flag, OG `image/png` for real, demo and missing shows); `integration/depth-pages.test.ts`; screenshots `story-*`, `play-finale-*`, `screen-finale-*`. |
| F2 /impact (real aggregates), /how-it-works | `integration/depth-impact.test.ts` ("reports zeros and nulls, never invented numbers"), `depth-pages.test.ts`; `/how-it-works` has the Feature → Nexconn table and an inline SVG architecture diagram (screenshots `how-it-works-*`). |
| F3 presets | `unit/ai-content.test.ts` (6 presets complete, within length limits; ≥200 canned ideas each). |
| F4 OBS overlay `?obs=1` | e2e `7-links` (transparent `html`/`body`, no QR unless `&qr=1`); `docs/screens/screen-obs-1920x1080.png`. |
| F5 load-sim 300 × 5 / 30 s, distill ≤8 s p95 | Section 4. |
| F6 README, WRITEUP, DEMO_SCRIPT, Dockerfile, .env.example | Files present at the repo root / `docs/`. Docker image build: section 6. |
| F7 TTS, multilingual, cheers behind flags | Flag-off tests: `unit/ai-flags.test.ts` (TTS null + no OpenAI call; translate `{}` + no call), `integration/i18n-publish.test.ts` (no `i18n`, translator never called), `integration/ingest-mock-routes.test.ts` "answer 403 when FEATURE_CHEERS is off". Flag-on: cheers (default on) seen working in e2e/screenshots; i18n flag-on path tested with a faked translator (`i18n-publish`) and the player's translated rendering checked with an injected bundle; TTS flag-on tested with a faked OpenAI client (`ai-flags` "writes an mp3 once…") and screen playback checked with a spied audio element. **Not verified with real keys**: real TTS audio and real translations need `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` (in `LLM_MODE=mock` translation returns `{}` by design). |

Production guard (hard rule 1): `next start` with `NODE_ENV=production REALTIME_MODE=mock` and no
`ALLOW_MOCK_IN_PROD` prints `Refusing to start: REALTIME_MODE=mock in production…` and exits with code 1
(checked by hand on 2026-11-17; `integration/engine-concurrency.test.ts` covers the exit path, `unit/config.test.ts` the rule).

## 3. Lighthouse (E4)

Lighthouse 12.8.2, mobile form factor, default throttling, against a production build in mock modes
(`NEXT_DIST_DIR=.next-lh`, port 3200). Chrome was driven through a debug port (`--port`) because chrome-launcher
cannot spawn Chrome on this machine. `/play` was measured as a joined player (`--disable-storage-reset`).
Reports: `docs/lighthouse/*.report.html` / `.json`.

| Page | Phase | Performance | Accessibility | Best practices | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/` | — | 98 | 100 | 100 | 2.4 s | 60 ms | 0 |
| `/play/CODE` | STORM | 93 | 100 | 100 | 1.9 s | 300 ms | 0 |
| `/play/CODE` | REVEAL | 99 | 100 | 100 | 1.1 s | 100 ms | 0 |

Measured on design v3 (2026-11-17), Lighthouse 12.8.2, with the show held in each phase by a host pause; the joined
player's page was measured (final URL `/play/QHCDA` in both `/play` reports). Design v2 scored 97 / 100 / 98 on the same
three pages.

The first `/play` run (REVEAL) found CLS 0.173 from the narration typewriter; fixed (out-of-flow overlay) and re-measured.

## 4. Load simulation (F5)

`pnpm load:sim` — full output in `docs/load-sim-results.md`. In-process, mock modes, fresh PGlite, 300 senders × 5
ideas over 30 s, 5 rounds. Ideas are synthetic.

- Ideas attempted 7500 / accepted 7500 / rejected 0 / dropped 0; stored rows reconcile every round; finale reached.
- Distill ms (STORM end → options saved) per round: 1161, 839, 927, 802, 957 → **p50 927 ms, p95 1161 ms** (budget 8000 ms): PASS.
- Mock mode has no LLM/embedding latency; the live budget (≈5 s typical) is untested without keys.

## 5. Nexconn — live (GOAL condition 3)

`pnpm smoke:nexconn` against the real API (the full table is appended to `docs/NEXCONN_FINDINGS.md`), real output:

```
PASS  U1        issueAccessToken for a plain user id                                     token of 104 chars
PASS  U1        user ids the app really uses: u_<id> and cp_narrator (underscore)        both accepted
PASS  U9        ensureChannel: create + longest keep-alive + priority sender             destroyType 0, ttlMinutes 10080
PASS  U2/U3/U4  publishState: metadata batch set + CP:State message, metadata read back  7 keys read back; CP:State accepted
INFO  U3        metadata key charset: is a '.' key (cp.phase) accepted?                  'cp.dot' -> code 1002 (rejected: keep underscores)
PASS  U4        publishTally + sendRoomMessage (bot idea, cheer, notice, moderation)     all accepted by the server
PASS  U6        configurePriorities: CP:State/CP:Moderation priority, CP:Idea/CP:Cheer low priority   registered and read back
PASS  U6        narrator is on the channel's priority sender list                        cp_narrator listed
PASS  U7        sendReceipt: direct message from the narrator, system message as fallback   direct code 0, system code 0
PASS  U8        countParticipants (participant list total)                               total 0 (an empty channel)
PASS  U8        mute / unmute / ban / unban a test user, read back from the lists        all four actions accepted
INFO  U10       profanity list                                                           50 words on the provider list; quota full (1019)
INFO  U5        webhook URL reachability                                                 APP_URL is local: set the deployed https URL in the Console
PASS  U9        destroyChannel removes the test channel                                  getOpenChannel now answers 23410
11 passed, 0 load-bearing failed, 0 other failed, 0 warnings
```

Realtime contract against Nexconn (`REALTIME_CONTRACT=nexconn`): `Tests 19 passed | 7 skipped (26)`. The 13 mock tests
and the 6 Nexconn server-side tests pass; the 7 listener tests need the Web SDK in a browser and are covered by the
live show below.

**Live show** (`E2E_LIVE=1`, `src/tests/live/live-show.spec.ts`): production build with `REALTIME_MODE=nexconn` and
`LLM_MODE=live`; two headless phones + the big screen play one full round; `1 passed` in each of three runs. Run 3
(OpenAI `gpt-5.4-mini`), real output:

```
LIVE_RESULTS {"server":{"realtimeMode":"nexconn","llmMode":"live"},"ideaLatencyMs":[{"toPhone":997,"toScreen":1037},
{"toPhone":928,"toScreen":925},{"toPhone":939,"toScreen":938},{"toPhone":939,"toScreen":940},{"toPhone":945,"toScreen":946},
{"toPhone":931,"toScreen":932}],"stormEndToOptionsMs":3059,"distill":{"ms":1892,"provider":"openai","fallbackUsed":false},
"narrationVisibleAfterRevealMs":2412,"ballotToastSeenOnAPhone":true,"receiptsOnMe":{"ada":3,"bo":1},
"finale":{"storyTitle":"Midnight in the Moon Ballroom","recapChars":890,"tagline":"A moonlit heist turns into the fanciest disaster ever."},
"consoleProblems":[]}
  ok 1 [chromium] › live-show.spec.ts › live: one full round over Nexconn with two phones and the big screen
```

All three runs are tabulated in `docs/NEXCONN_FINDINGS.md` ("Live show results"); raw JSON is in `docs/live-results/`.

**Design v3 re-run (2026-11-17, 16:00 UTC), on a degraded network.** `pnpm live:check`: smoke `11 passed, 0 load-bearing
failed`, contract `19 passed | 7 skipped`, build OK. The first live show failed: this machine's outbound calls were
timing out (13 Nexconn server calls over their 4 s timeout, OpenAI embeddings over 2.5 s), so ideas stopped arriving and
the 40 s storm ran out before the spec had sent all six. The same spec passed against the mock server
(`LIVE_DRY_RUN=1`: `1 passed`), and the live show re-run passed (`1 passed (1.6m)`) while the network was still poor
(19 Nexconn call timeouts in the log): idea delivery 3.96–7.50 s, storm end to options 16.3 s, narration 5.4 s after
REVEAL, ballot toast seen, receipts on `/me` (3 and 1), finale "Moonlight Misfits and the Ballroom Vault". The one
console line is a 409 for an idea sent after the storm closed (`NOT_STORM`). These numbers measure the network that
afternoon, not the app; the normal-network figures are the three runs above. Raw JSON:
`docs/live-results/live-2026-11-17T16-01-57-778Z.json`.
Idea delivery over Nexconn was 0.93–1.04 s in 13 of 14 samples (one 3.0 s outlier), so the ≤1 s target holds at the
median, not at p95. STORM deadline → options on the phones: 2.8–3.1 s with live AI (target ≤8 s p95).

What the live runs changed in the code:
- SDK log level WARN → ERROR (routine connect lines were console warnings).
- The first available AI provider gets the primary's 5 s cap (OpenAI alone has no Anthropic in front of it).
- Over-long model scene prompts are trimmed at a sentence boundary instead of being discarded.

`OPENAI_FAST_MODEL=gpt-5.4-mini` was chosen by timing the real distill + narration chain (`scripts/ai-bench.ts`):
1.2–1.4 s / 1.8–3.0 s, against `gpt-4o-mini`, which hit the timeouts and fell back.

## 6. Docker image

`docker build -t crowdplay:verify .` on Docker 29.5.3: exit 0 (image 1.44 GB; the deps stage ran the postinstall SDK build).
Boot test, real output:

```
$ docker run -p 3377:3000 -e REALTIME_MODE=mock -e LLM_MODE=mock -e ALLOW_MOCK_IN_PROD=1 -e SESSION_SECRET=… crowdplay:verify
GET /api/health          {"ok":true,"realtimeMode":"mock","llmMode":"mock","db":"pglite","version":"0.1.0"}
POST /api/session        {"ok":true,"user":{"id":"u_wfrybpxta4hmhvo7","displayName":"Docker Check"…
POST /api/rooms          {"ok":true,"code":"ASPJJ",…}
POST host {start}        phase PROMPT
GET /play/ASPJJ          200
docker inspect health    healthy

$ docker run -e REALTIME_MODE=mock -e SESSION_SECRET=… crowdplay:verify     # no ALLOW_MOCK_IN_PROD
Refusing to start: REALTIME_MODE=mock in production. Set REALTIME_MODE=nexconn (or ALLOW_MOCK_IN_PROD=1 for a local production test only).
exit code 1
```

Render's first Blueprint build (2026-11-18) failed at `COPY --from=build /app/public ./public`: `"/app/public": not found`. `public/` was empty on this machine and git does not track empty folders, so a clone has none; the local builds above passed only because the folder existed here. The app serves nothing from `public/`, so the line is gone. Re-checked from a fresh `git clone`: `docker build` exit 0; the container answers `/api/health` ok and `/`, `/try`, `/host`, `/impact`, `/how-it-works` and all 18 assets the landing page links with 200.

Not tested: the Docker image on a hosting platform (the Render Blueprint in `render.yaml` is written from Render's docs and not yet applied), or against Neon itself.

### Real Postgres (2026-11-18, local `postgres:17-alpine` container, the Neon-style `pg` path)

```
$ E2E_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres pnpm e2e     # production build, DATABASE_URL set
  10 passed (4.0m)
$ psql: select count(*) from rooms; select count(*) from ideas;
13
508
```

Neon suspends its compute after 5 idle minutes, which closes every open connection. Simulated with `pg_terminate_backend` on all 11 server connections while the production build ran on that Postgres:

```
before: {"ok":true,"realtimeMode":"mock","llmMode":"mock","db":"pg","version":"0.1.0"}
connections dropped: 11
process alive after drop
after:  {"ok":true,...,"db":"pg"}   room created after the drop; 2 rooms in Postgres; 10 "idle Postgres connection closed" warnings
```

The same drop on a bare `pg` Pool with no `error` listener (the code before this fix) ends the process: `error: terminating connection due to administrator command`, exit 1.

### Neon (2026-11-18, the founder's project in AWS ap-southeast-1, pooled endpoint, run from this laptop on a phone hotspot)

```
probe:     server_version 18.7, client TLSv1.3 TLS_AES_256_GCM_SHA384, certificate verified, query round trip 55-71 ms from here
e2e:       E2E_DATABASE_URL=<neon>/crowdplay_e2e pnpm e2e   (scratch database, dropped afterwards)
           4 passed, 6 failed (7.8m); Neon stored 11 rooms, 378 ideas, 69 users
           81 server errors, all "getaddrinfo ENOTFOUND <neon host>"; 0 other database errors
drop:      8 Neon server connections terminated: process alive, room created before and after; the pooler absorbed
           the drop, so the app saw no connection error
migrate:   DATABASE_URL=<neon>/neondb pnpm db:migrate  ->  migrations applied; 12 tables, 0 rows
prod run:  next start with the real .env (Nexconn + OpenAI) on neondb
           /api/health {"ok":true,"realtimeMode":"nexconn","llmMode":"live","db":"pg"} in 82-150 ms; / 200; /impact 200;
           0 error log lines; neondb still 0 rows
```

The six e2e failures are this laptop's network, not Neon. The hotspot's DNS (172.20.10.1) intermittently fails to resolve the Neon host and answers "Query refused" for its direct endpoint, which 8.8.8.8 resolves. Every query also crosses 55-71 ms of VPN and hotspot. The suite runs phases at 30% speed and asserts timings that assume a database next to the app (for example the reconnect test missed its 5 s window by 21 ms). On Render in Singapore the app and Neon are in the same region. Not yet run: the suite from a host near Neon (the Render deploy).

### Live deploy (2026-11-18, https://crowdplay-rs7o.onrender.com, Render free tier in Singapore + Neon)

Two deploy bugs surfaced on the first real deploy, both fixed and pushed:

1. Build: `COPY --from=build /app/public ./public` failed (`"/app/public": not found`), because git does not track the empty folder. Fixed in 72b8e4a (above).
2. Browsers stuck on "Reconnecting…": `POST /api/session` handed browsers the App Key `"$NEXCONN_APP_KEY"`, the literal text entered for the second key variable (Render does not expand references). Nexconn answered `navi.json` 401 and `v1/config` 400 on every connect. Fixed in a6710b8: browsers now get `NEXCONN_APP_KEY`, and the duplicate variable is gone (D49).

After a6710b8 went live:

```
GET /api/health   {"ok":true,"realtimeMode":"nexconn","llmMode":"live","db":"pg","version":"0.1.0"}   0.25-0.30 s
GET / /try /host /impact /how-it-works   200 (0.18-1.5 s)
browser: navi.json 200, v1/config 200, no "Reconnecting" banner

/try (Judge Mode, one browser, 30 labelled bots), all three rounds over Nexconn with live OpenAI:
  R1  STORM 42 ideas incl. "Bribe the vault with a pizza"; VOTE: two AI-written options + my idea as the wildcard;
      REVEAL: "Pick the lock fast before the timer runs out" 37% (mine 27%, no nudge in round 1);
      narration written live, credits "@Mystic Mittens 🤖, @Professor Plink 🤖, @Waffle Wizard 🤖 + 4 others"
  R2  scene "Vent Drop, Second Lock" written from the R1 canon; vote ran without my idea
  R3  "A pigeon flies off with the second key" took the wildcard slot, 62% with the disclosed demo nudge, CANON
  FINALE  three scene summaries; Your night: 2 ideas sent, 2 on the ballot, 1 canon; canon makers labelled 🤖

APP_URL=https://crowdplay-rs7o.onrender.com pnpm smoke:nexconn
  11 passed, 0 load-bearing failed, 0 other failed, 0 warnings
  U5: .../api/nexconn/webhook: unsigned POST -> HTTP 401 (rejected as it should be)
```

Webhook (U5), 2026-11-19, after the founder set `https://crowdplay-rs7o.onrender.com/api/nexconn/webhook` with `message:send` in the Console. In a fresh `/try` show the page's `POST /api/rooms/*/ideas` was blocked in the browser, so an idea could reach the server only as a Nexconn message delivered by the webhook:

```
blocked POSTs: 1, /ideas network requests: 0   ("Webhook test: a goat opens the vault", sent over Nexconn only)
GET /api/rooms/VTJPX/me     {"ideasThisRound":1,"myOptionIds":["op_4b7fuav8iqsw26mh"],...}
GET /api/rooms/VTJPX/state  options: "Rush in during the guard rotation" | "Call in a fake fire alarm" | "Webhook test: a goat opens the vault"
```

The server stored the idea and put it on the ballot, so Nexconn delivered the `message:send` webhook and the signature check (App Secret) passed. Not yet run: a show with real people on real phones.

## 7. Human steps left (need a deploy or people)

Done on 2026-11-17: `.env` with the Nexconn and OpenAI keys; `pnpm live:check` steps 1–4 (section 5); the public repo github.com/Bhavya-Dhoot/crowdplay.

1. Done 2026-11-18: deployed at https://crowdplay-rs7o.onrender.com on Neon (section 6). The Nexconn webhook is set and confirmed delivering (section 6, 2026-11-19).
2. One show with real people on real phones on the deployed URL; record it here.
3. Run real sessions; capture `/impact` afterwards (the `impact-*.png` screenshots in `docs/screens/` are test data).
4. Optional: add `ANTHROPIC_API_KEY` to make Claude the primary model (OpenAI then becomes the fallback).
