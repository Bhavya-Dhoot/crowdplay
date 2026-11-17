# CROWDPLAY performance audit (read-only, 2026-11-17)

Scope: hot paths in TECH_SPEC §5/§6/§14, DECISIONS, VERIFICATION §5. Nothing was run or edited; sources read: `src/lib/engine/*`, `ingest/ideas.ts`, `ai/*`, `rooms.ts`, the six room routes, `client/useRoom.ts`, `/play` components, `db/schema.ts`, `.next` chunk files (existing build, not rebuilt).
Labels: **measured** = from VERIFICATION/ai-bench/load-sim; **est.** = my estimate from query/token counts; **inference** = plausible, needs one log line or bench to confirm.
Caveat: every live number was taken on in-process PGlite (one connection, ~0 ms RTT). Nothing was measured on Postgres (VERIFICATION §6), so each saved query is worth far more on Neon/pg than the numbers below show.

Critical paths today (measured): STORM end -> options on phones 3.06 s (distill.ms 1.89 s; ai-bench chain alone 1.2-1.4 s, DECISIONS D28, so ~0.5-0.7 s of non-LLM work sits inside distill.ms). REVEAL -> narration visible 2.41 s (ai-bench narrate 1.8-3.0 s). Idea -> phone 0.93-1.0 s (provider path).

## Ranked findings (user-visible impact first)

| # | Finding (file:line) | Cost now | Proposed fix | Expected gain | Risk |
|---|---|---|---|---|---|
| 1 | **Narration waits for PUBLISH and generates an invisible summary.** `narrate.ts:9-13,21-22,96` one call returns narration + beat + running summary (<=1200 chars, ~55-65% of output tokens est.; users never see it). `machine.ts:75-93` + `effects.ts:156-181` run CLOSE_VOTE -> PUBLISH (Nexconn REST, cap 4 s, `publish.ts:24,245`) -> 2 claim inserts -> `genNarration` (5 loads, `effects.ts:550-565`) -> LLM. | 2.41 s after REVEAL (measured) | (a) Schema = narration + beat only; summary = `appendSummary` (`narrate.ts:42`) immediately, LLM refresh in a background call that must land before next STORM ends. (b) Put GEN_NARRATION in `before` right after CLOSE_VOTE in `enterReveal` so it overlaps PUBLISH. | est. -0.8 to -1.3 s (visible ~1.1-1.6 s); confirm with `scripts/ai-bench.ts` | low-med: summary drift; machine tests assert effect order |
| 2 | **N+1 on the DISTILL critical path.** `effects.ts:439-446` one UPDATE per cluster (100-400 clusters at 1,500 ideas) inside `persistDistill` before DISTILL_DONE. `ideas.cluster_id` (`schema.ts:132`) is never read in `src/` (grep) and no test asserts it. | load-sim (mock LLM): 0.53-0.75 s between "effect ms" and "options saved" (`docs/load-sim-results.md`), ticker <=0.25 s of it; est. 0.2-0.5 s is this loop; N x RTT on remote PG (300 x 2 ms = 0.6 s) | Delete the loop, or one `UPDATE ideas SET cluster_id = v.c FROM unnest(ids, cs)` after DISTILL_DONE. | est. -0.2 to -0.5 s STORM end -> options (up to -0.6 s on remote PG) | very low |
| 3 | **Phase-boundary stampede + repeated credit query.** `useRoom.ts:187-191` every player POSTs `/join` 0.2-1.2 s after VOTE and after REVEAL. `join/route.ts:14-18`: `joinRoom` under a per-room mutex (`rooms.ts:231`) + `advanceIfDue` + `buildPublicState` (10 q at VOTE/REVEAL) + `buildMe` (5 q). `contributorsByOption` (`publish.ts:40-75`) re-runs `ideas.id IN (<=1500 ids) JOIN users` on every VOTE/REVEAL build (join, GET /state, host feed, host heartbeat, every publish). | ~21 q per call -> ~6k q per boundary at 300 players (est.), queued against PUBLISH / narration publish / tally | New `GET /api/rooms/:code/me` (buildMe only, no mutex, no state build) for `onPhase`; jitter 2 s. Persist top-3 credit + `more` on the option row at `persistDistill` (or cache per optionId, invalidate on delete/ban/veto). | -90% queries at the two most latency-sensitive moments; protects #1/#2 gains under load | med: new route + contract, cache invalidation |
| 4 | **Embedding straggler wait + all-or-nothing vectors.** `embed.ts:10,154` 500 ms micro-batches; `embed.ts:180-190` DISTILL start flushes the partial batch and waits <=800 ms for that OpenAI call before the LLM can start; `embed.ts:192-199` a single idea without a provider vector drops the whole round to lexical sampled clustering (`distill.ts:193-221`). | est. 0.2-0.5 s serial before the LLM (inference: distill.ms 1.89 s vs bench 1.2-1.4 s); silent quality cliff | While STORM ends in <3 s use BATCH_MS ~150 and force `flush()` at T-0.5 s (ticker knows `phaseEndsAt`); log the `getVectors` wait; tolerate <=2% missing vectors (leave unclustered) instead of degrading. | est. -0.2 to -0.4 s STORM end -> options | low: <=7 embedding calls/s/room |
| 5 | **Idea -> phone latency.** Constant ~0.93 s in 13/14 samples looks like the provider path, not ours. `nexconn.server.ts:48` registers CP:Idea/CP:Cheer as low-priority (droppable class, `NEXCONN_SDK_NOTES.md:133`); `NEXCONN_FINDINGS.md:146` calls it an untested lever. Client also holds an isolated idea a full 120 ms: trailing timer `useRoom.ts:56,360-363`. | 0.93-1.0 s + up to 0.12 s | (a) Leading-edge flush: render at once when idle >=120 ms, batch afterwards. (b) Experiment (hypothesis): drop CP:Idea from `LOW_PRIORITY_TYPES`, re-run `pnpm live:check`, compare `ideaLatencyMs`. | (a) -60 to -120 ms, certain; (b) unknown, 0 to -0.5 s | (a) none; (b) above 200 msg/s/channel ideas could crowd state; HTTP path stays authoritative |
| 6 | **Awaited scene pre-gen blocks callers.** `effects.ts:52-59` SLOW omits GEN_PROMPT, so `machine.ts:80` pregen is awaited inside `advance()` (`advance.ts:152`, up to `PROMPT_TIMEOUT_MS` 6 s): host forceWin/next POST (`rooms.ts:428`), lazy-advance GET /state, host heartbeat, ticker's per-room slot. REVEAL is 12 s so the scene is not needed earlier: pre-gen is early enough (parallel to narration, 10 s slack). | +1.5-3 s on those requests at the VOTE edge (est., scene call maxTokens 500) | SLOW predicate `type==="GEN_PROMPT" && mode==="pregen"` (keep `ensure` awaited: PROMPT's PUBLISH needs the row). | host button and polls return instantly | low |
| 7 | **Distill LLM weight.** `distill.ts:33,300` asks for 3 backups (~half the option output tokens est.), used only on veto (`effects.ts:605-613`); prompt = 8 crowd clusters x 5 reps + 30 wild lines (`distill.ts:253-263,308-311`, ~2.5-3k input tokens est.); `providers.ts:207-223` sends no `reasoning_effort` to gpt-5.4-mini (default unknown: verify). | chain 1.2-1.4 s (bench) | Main call = 3 options only; backups from `heuristics.ts` at once, LLM backups in the background at VOTE start; reps 5->3, wild 30->20; bench `reasoning_effort` minimal/none. | est. -0.3 to -0.6 s | med: veto label quality, validator rules, model param support |
| 8 | **Typing/render cost on /play.** `PlayerView.tsx:311` inline `onEdit` defeats `memo(FeedItem)` (`IdeaFeed.tsx:58`); draft state lives in PlayerView so each keystroke re-renders PlayerView + IdeaFeed + up to 200 FeedItems (`store.ts:24`); idea flush = whole `setView` ~8/s at 50 ideas/s (`useRoom.ts:316-322`) plus smooth scroll and `scrollHeight` reads in `useLayoutEffect` (`IdeaFeed.tsx:140-150`). | not measured; hits low-end phones in a busy STORM | Stable `onEdit` (useCallback/ref); draft state inside Composer; `startTransition` around the idea dispatch; render last ~80 items. | typing stays responsive under load | low |
| 9 | **Ticker granularity.** `ticker.ts:9,72-81` 250 ms poll: every boundary is noticed 0-250 ms late; query has no index and `engine_state` rows are never deleted. | avg 125 ms per boundary x 4 boundaries/round | After commit (`advance.ts:150`) `setTimeout` to `phaseEndsAt` -> `advance(TICK)`; keep the scan as a 1 s safety net; partial index `engine_state(phase_ends_at) WHERE phase_ends_at IS NOT NULL`. | -125 ms avg (-250 max) at PROMPT, DISTILL, REVEAL, PROMPT edges | low |
| 10 | **Host console: ~25-30 q/s + 1 Nexconn REST call/s per host.** `useHostDesk.ts:15-17` feed 1 s + heartbeat 1 s. Feed (`rooms.ts:496-596`): 15-18 q incl. a full `buildPublicState`, a show-wide per-user count, 300 ideas + 300 players re-sent (~50-110 KB/s est.), `countParticipants` REST every second (`rooms.ts:569`, 3 s cap). Heartbeat returns another full `buildPublicState` (`rooms.ts:491`) the console mostly ignores. | host load competes with ingest on PGlite | Heartbeat returns `{ok}` only (ticker already advances); cache `connected` 5-10 s; `?since=` delta for ideas, players on change/5 s; share one state build per version. | -60% host DB and REST load | low-med |
| 11 | **Ingest: 7 sequential queries per delivery, 2 deliveries in `dual`.** `ideas.ts:93,101,104,111,120,139,147` (+ webhook claim, `webhook.ts:58`); the cap count scans the whole round (no (round_id,user_id) index). ~10-12 q/idea x 50 ideas/s = 500-600 q/s, ~85% of STORM DB load. Not on the visible path (ideas travel client-to-client over Nexconn) but it queues ahead of engine work on PGlite. | p50 12 ms, p95 25 ms (measured, mock) | One read joining rooms+engine_state+rounds+participants with scalar subqueries for existing idea and per-user count; then the insert (7 -> 2). Add index (below). | -70% ingest queries | low-med: keep D18 ordering (dup check before phase) |
| 12 | **Uncached state builds.** `state/route.ts:12-14`, `join`, host: 7-10 q per `buildPublicState` every call; every client polls it every 2 s while the transport is down (`useRoom.ts:299-301`, 150 req/s at 300 clients = ~2k q/s). `runStats` (`publish.ts:428-434`) rebuilds everything and rewrites all 7 metadata keys every 2 s for a changed counter. | reconnect storms hit the DB | Per-room singleflight + 250-500 ms cache of the built state (refresh `serverNow` on serve), invalidated on `bumpVersion`; stats tick patches `stats` only. | -90% DB under reconnect storms | low-med |
| 13 | **Receipt fan-out is per user.** `receipts.ts:114-126` one REST `sendDirectChannelMessage` (toUserIds of 1) + one DB UPDATE per receipt, concurrency 16: ~250 BALLOT at VOTE start, ~120 CANON at REVEAL (est.). | last toasts ~3-4 s late (est.) | One batched `UPDATE ... WHERE id IN`; raise concurrency to 32-48 after checking Nexconn QPS. | est. toast tail -1.5 to -2 s | med: provider rate limit unknown |
| 14 | **Join path is serial.** `client/session.ts:54,80` `cookiesAreBlocked()` (`GET /api/me`) runs after POST /api/session (which blocks on Nexconn `issueAccessToken` every page load, `api/session/route.ts:54`); then `/join`; only then `useRoom.ts:302` `connectTransport()` -> dynamic import of the ~200 KB gz SDK chunk -> connect -> enter. Until joined, own ideas reach nobody live. | est. 0.3-0.8 s extra before realtime is up | Start `import("@nexconn/chat")` at `bootstrap()` start; run `cookiesAreBlocked` in parallel; reuse the Nexconn token on reload. | est. -0.3 to -0.8 s to live | low |
| 15 | **Bigger bet: start work before the phase ends.** Speculative narration for the current leader at VOTE end -3 s (reuse if it wins, else the current path), and speculative distill at STORM end -3 s with late ideas attached to the nearest centroid. | -- | Only after #1-#7. | narration ~2.4 s -> <0.5 s; options ~3.0 -> ~1.5 s (est.) | high: fairness/credit rules, extra LLM calls, tie/veto/force-win edges |

## DB round trips and network calls per event (counted from code)

| Event | DB queries | Network |
|---|---|---|
| `buildPublicState` | 7 (STORM/PROMPT/DISTILL: base, round, 4 stats, beats) / 10 (VOTE/REVEAL: +options, contributors, tally) / 10 (FINALE); +1 with multilingual; +1 in `publishRoomState` (`publish.ts:242`) | 0 |
| PUBLISH (phase change) | 8-11 | 2 REST in parallel (7-key metadata batch + CP:State); capped 4 s |
| Stats publish (<=1 per 2 s per room) | ~11-13 incl. version bump | 1 REST (all 7 keys) |
| Tally publish (<=2/s) | 5 (`publish.ts:404-426`) | 2 REST (1 key + CP:Tally) |
| Vote | 5 (`rooms.ts:312-340`: participant, engine, round, options, upsert) | 0 |
| Idea (HTTP) | 7 (+3 for the webhook copy) | 0 |
| `advance()` tx | 3 selects + 1-5 writes (`advance.ts:138-148`, `persist` 90-127); effects run after commit, outside the lock | 0 |
| DISTILL | claim 1, loads 5, ideas 1, persist ~7 + N cluster updates, DONE tx ~8, PUBLISH 11 | 1 LLM (+ embedding batches during STORM) |
| CLOSE_VOTE (awaited before REVEAL publish) | 6 sequential (`effects.ts:486-515`) | 0 |
| GEN_NARRATION | claim 1, loads 5, 2 updates, `publishFresh` (bump + 11) | 1 LLM + 1-2 REST |
| GET /state | 2 + 7-10 | 0 |
| POST /join | ~21 at VOTE/REVEAL, ~15 in STORM | 0 |
| Host feed + heartbeat per second | ~15-18 + ~9-12 | 1 REST (`countParticipants`) |

Scene prompt for round N+1 is written in parallel with narration N (same `runEffects` pass, `machine.ts:80`) and has ~10 s of slack in REVEAL; no change needed except #6. Distill wait on embeddings is the #4 finding. Nothing inside `withRoomLock` is slow (`advance.ts:137-148`: DB only).

## Index review (`schema.ts` is a FROZEN CONTRACT: add via a new migration, `pnpm db:generate`)

- Add `ideas(round_id, user_id)` and drop `ideas_round_idx` (prefix covers round-only queries): `ideas.ts:139-142` cap count, `rooms.ts:293-296` buildMe, `rooms.ts:416` ban.
- Add `receipts(show_id, type, user_id)` replacing `receipts_show_idx`: `publish.ts:194-198` (every state build) and `topCanonMakers` `:217-227`.
- Add partial `engine_state(phase_ends_at) WHERE phase_ends_at IS NOT NULL`: `ticker.ts:18-20` every 250 ms.
- Drop redundant `ideas_user_idx` (prefix of `ideas_user_msg_uq`) and `receipts_user_idx` (prefix of `receipts_once_uq`): one btree write less per idea/receipt.
- Checked, not needed: `votes(round_id, option_id)` (PK prefix scan over <=voters), `participants(room_id, last_seen_at)` (fallback path only, `rooms.ts:578`), `ideas(round_id, status, created_at)` (one sort of <=1,500 rows).

## Client bundle (existing `.next`, gzip of chunk files)

`/play/[code]`: route chunks 7 files = 92.9 KB gz + shared root files 132.2 KB gz = ~225 KB gz, inside the 250 KB budget (TECH_SPEC §14) with ~25 KB headroom. Nexconn SDK is a lazy 973 KB raw / ~200 KB gz chunk (`3yda1-u016767.js`), outside the budget by design.

## Quick wins (<30 min each)

1. `effects.ts:52` make pregen non-blocking (#6): 1 predicate.
2. `effects.ts:439-446` remove the cluster_id loop (#2): delete ~8 lines, run `engine-*` integration tests.
3. `machine.ts:75-93` move GEN_NARRATION ahead of PUBLISH (#1b): reorder one array, fix the order assertion in `unit/engine-machine.test.ts`.
4. `useRoom.ts:360-363` leading-edge idea flush (#5a).
5. `PlayerView.tsx:311` stable `onEdit` (#8): `useCallback` + `inputRef`.
6. `useRoom.ts:187-191` widen the join jitter to 2 s as a stopgap until `/me` exists (#3).
7. Log `getVectors` wait ms and `distill.ms` split (embed / LLM / persist) so #4 and #2 are measured, not inferred.
8. Run `scripts/ai-bench.ts` with `reasoning_effort` minimal/none and with `backups` removed (#7).

## Not worth it

- Parallelising the sequential awaits in `buildPublicState` (`publish.ts:138-139`): PGlite serialises queries; on Postgres it saves ~10-20 ms. Revisit only after caching (#12).
- Merging `advance()`'s three selects (`advance.ts:140-143`): ~2 RTT inside the lock, <10 ms.
- Streaming narration token-by-token: needs a client typewriter protocol and partial JSON parsing; #1 captures most of the gain.
- Dropping `dual` ingest (HTTP + webhook): it is the resilience path; fix its cost (#11) instead.
- More indexes on `votes` / `participants` / `events`: row counts per room are <=1,500; scans cost <1 ms.
- Bundle trimming for `/play`: inside budget; the lazy SDK is the only large item and #14 handles it by preloading.
- Anthropic path tuning (`providers.ts:146-202`): no key in this environment; effort is already `low`.
