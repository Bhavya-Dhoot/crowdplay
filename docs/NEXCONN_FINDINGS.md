# CROWDPLAY - Nexconn findings (U1-U10)

Written 2026-11-17 by the Nexconn adapter build. Companion to `docs/NEXCONN_SDK_NOTES.md` (what the installed SDKs and docs say) and `docs/NEXCONN_INTEGRATION.md` (the plan).

**Nothing in this file was verified against a live Nexconn app. No credentials existed when it was written.**
Status words used below: `confirmed-from-types` = read from the installed `.d.ts` (or the source of the installed packages); `from-docs` = stated in docs.nexconn.ai only; `needs creds` = cannot be known without a live call or the Console. The adapters also ran against a throw-away local HTTP stand-in (not part of the repo): that proved the real server SDK signs and serialises the requests this adapter makes and that the smoke script's own logic works. It says nothing about how Nexconn behaves.

Files: `src/lib/realtime/nexconn.server.ts` (server adapter), `nexconn.client.ts` (browser adapter), `nexconn.codec.ts` (pure encode/decode, shared), `scripts/nexconn-smoke.ts`, tests `src/tests/unit/nexconn-{codec,server,client}.test.ts`.

## 1. U1-U10

SDK paths: `S` = `node_modules/@nexconn/server-sdk/dist/api.d.ts`, `C` = `node_modules/@nexconn/chat/index.d.ts`. Docs base: `https://docs.nexconn.ai`.

| # | Question | Answer from types / docs | Status | What the adapter does | Confirm live |
|---|---|---|---|---|---|
| U1 | Web SDK packages and Open Channel client API | `@nexconn/chat` + `@nexconn/engine`, both `26.2.1`, exact-pinned (peer `=26.2.1`). `NCEngine.initialize({appKey, areaCode?, logLevel?})` (C:2910), `NCEngine.connect({token})` (C:2925), `new OpenChannel(id).enterChannel({messageCount, extra?})` (C:4196), `exitChannel`, `sendMessage` (C:3672), `getMetadata(key?)` (C:4225), events via `OpenChannelHandler` (C:1414) and `MessageHandler` (C:1775). Also confirmed in Node: `ConnectionStatus` is numeric 0-3, `AreaCode` keys are `BJ SG NA SA OM`. | confirmed-from-types; runtime behaviour needs a browser | `nexconn.client.ts`: dynamic import in `connect()`, then `initialize` -> `registerCustomMessages` -> handlers -> `connect`; `joinRoom` = `enterChannel` + `getMetadata`. `creds.area` accepts an `AreaCode` key (`SG`) or number (`2`); unknown values fall back to the SDK default with a console warning. | Two-browser live show (section 4) |
| U2 | Can clients read and subscribe to Open Channel metadata? | Yes: `getMetadata` (C:4225), `onMetadataChanged({changeInfo[]})` and `onMetadataSynced({channelId})` (C:1414-1435). Clients can also WRITE it (`setMetadata`, `overwrite:true` overwrites other owners' keys per docs), so metadata is forgeable by other clients. | confirmed-from-types; delivery and initial sync need creds | Server writes `cp_*` keys as the narrator (`batchSetOpenChannelMetadata`, owner `cp_narrator`, `shouldAutoDelete 0`). Client seeds from `getMetadata()` on join and on `onMetadataSynced`, then applies `onMetadataChanged` deltas (coalesced 40 ms; each patch contains only the keys that changed). Metadata is a fast path only: `CP:State` / `CP:Tally` and HTTP `/api` stay authoritative, and patches are dropped when their version is more than 500 past the last version the narrator itself sent (a forged `v` would otherwise freeze the UI). | Smoke check `state` (server write + read-back); two-browser show (client side) |
| U3 | Metadata limits | Key: letters, digits and `+ = - _` only (no `.`), case-sensitive, <=128 chars. Value <=4096 chars. <=20 entries per set, <=100 per channel, ~100 KV operations/s per channel (client + server together). Needs the metadata service (error `23426` if off) and `metadataOwnerId`. Docs: `/platform-chat-api/open-channel/kv-attribute/set-kv-entry-batch.md`, `open-channel-kv-about.md`. | from-docs; whether `.` is rejected needs creds | Keys are `cp_phase`, `cp_prompt`, ... (D12). Values are capped at 4000 chars (the pack's own 1000-char cap is far below the documented 4096, so it is not enforced; 4000 leaves a margin). `cp_options` is split per slot into `cp_options_A/B/C` only if it ever exceeds 4000 (the client reassembles it); any other oversized value is skipped and logged. `publishState` writes 7 keys in one batch, `publishTally` 1 key: about 9 KV ops per phase change, 1 per tally (max 2/s). | Smoke check `meta-charset` (reports whether `cp.dot` is accepted) |
| U4 | Do server-sent custom message types reach Web clients without Console registration? | Registration is done in client code with `NCEngine.registerCustomMessages` (C:3146), after `initialize` (silent no-op before it). The server API wants a custom type that does not start with `RC:` and is <=32 chars, "registered in the client SDK". No Console registration step is documented. Docs misspell the field `isPersited`; the d.ts and runtime read `isPersisted` (C:583). Docs: `/platform-chat-api/message/open-channel/send-open-channel.md`, `/chatsdk-web/message/customize.md`. | from-docs / confirmed-from-types for the field name; delivery needs creds | Client registers all 7 `CP:*` types (all `isPersisted:false, isCounted:false`; `CP:Cheer` and `CP:Tally` are status messages). Server sends the registered type with the JSON as content. **Fallback**: with `NEXCONN_TEXT_ENVELOPE=1` the server sends `RC:TxtMsg` with `{"content": <human line>, "extra": "{\"cp\":1,\"o\":\"CP:State\",\"p\":{...}}"}`; the client and the webhook parser decode both encodings, so no client change is needed. | Smoke check `text-envelope` (server accepts it); two-browser show decides whether the fallback is needed |
| U5 | Webhook: plan, signature, does it cover the body? | Message and open-channel events are available on Free. Headers `AppKey`, `Nonce`, `Timestamp` (ms), `Signature` = lowercase hex `sha1(AppSecret + Nonce + Timestamp)`. **The body is not covered.** No replay window is documented. 5 s timeout, 2 retries. Docs: `/platform-chat-api/webhook/overview.md`, `.../webhook/message/send.md`. | from-docs; scheme unit-tested (C5) | `verifyWebhook`: all four headers present, `AppKey` equals ours, `Timestamp` numeric and within +-5 minutes, signature compared with `timingSafeEqual`, then the body is parsed strictly. Only `message:send` events on open channels (channel type 4) that are CP messages (either encoding) and were not sent by our own server (`os` `Server`) become `IncomingMessage`s; everything else returns `[]` (so Nexconn does not retry). Every idea still goes through ingest's participant / phase / rate / filter checks and is deduped on the provider `messageId`. `NEXCONN_WEBHOOK_SECRET`, if set, overrides the App Secret as the signing secret. | Smoke check `webhook` (reachability note); then send one idea from a browser and watch `/api/nexconn/webhook` in the server log: confirm header casing, content encoding and that non-persisted ideas still fire `message:send` |
| U6 | Do low-priority / priority message type APIs accept custom types? | Both take `messageTypes: string[]` and the docs use a custom "like" type as the example. Limits: low priority <=5 per request and 20 per app; priority types 20 per app; priority senders <=20 **per channel**. Needs the Console switch "Open channel message priority" (else `1009`). `S:12653`, `S:13859`. | from-docs; needs creds | `configurePriorities()` (idempotent, never throws): reads each list and adds only missing types (`CP:State`, `CP:Moderation` as priority; `CP:Idea`, `CP:Cheer` as low priority). `1009` is logged and treated as "not available". `ensureChannel()` adds `cp_narrator` to that channel's priority sender list. No per-message `priority` is set on sends (it needs extra features); the lists and the sender list do the work. | Smoke checks `priorities`, `priority-sender` |
| U7 | Does a server direct message from a bot reach a Web client that never opened that channel? | Documented: it arrives on the single `MessageHandler.onMessageReceived` whatever channels were opened; the client reads `m.channelIdentifier.channelType` (Direct 1, System 6). Sender needs an access token. `S:11921` (`sendDirectChannelMessage`), `S:14144` (`sendSystemChannelMessage`). | from-docs; needs creds | `sendReceipt`: `CP:Receipt` direct message from `cp_narrator`, then a system channel message, else `false`. It returns `true` when Nexconn **accepts** the message; that is not proof the toast was shown (the DB row exists regardless and `/me` lists it). Client accepts receipts only from the narrator and only from a direct or system channel. | Smoke check `receipt` (accepted) + two-browser show (shown) |
| U8 | Client send rate limit | Client SDK: 5 messages/s across all channels (excess rejected; the exact error code is not trustworthy in the docs, engine `ErrorCode` has `20604 SEND_FREQUENCY_TOO_FAST`). Server API: open-channel send 100/s, direct 6000/min, system 100/s, KV 100 ops/s per channel. Docs: `/chatsdk-web/message/send.md`, `/platform-chat-api/prepare-to-use-api/chat-server-api-list.md`. | from-docs | App-level limit is 1 idea / 2 s, well inside. `sendIdea` / `sendCheer` reject on a failed send (the caller already dual-posts ideas over HTTP). | Not needed |
| U9 | Open Channel auto-destroy when idle | Default: destroyed after 60 min of inactivity. `destroyType 0` (inactivity) / `1` (from creation) with `ttlMinutes` 60-10080 via `createOpenChannel` or `setOpenChannelDestroyType`. A "keep-alive" never-destroy mode has no public API. Existing id -> business code `23435`, missing -> `23410`. Free plan: 50 concurrent open channels. `S:12485`; docs `/platform-chat-api/open-channel/destroy-about.md`, `set-destroy-type.md`. | from-docs; needs creds (is a 7-day TTL accepted on Free) | `ensureChannel`: `createOpenChannel({channelId})`, `23435` counts as success, then `setOpenChannelDestroyType({destroyType:0, ttlMinutes:10080})` (the longest option; applied after creation so a plan that rejects an explicit TTL still gets its channel). **Consequence**: an abandoned room keeps a channel for up to 7 days of inactivity and counts against the 50-channel cap, so `destroyChannel` at show end matters. | Smoke check `channel` (reads `destroyType`/`ttlMinutes` back), `destroy` |
| U10 | Built-in translation and moderation toggles | Translation exists (billed separately); moderation: profanity list (default **50 words total**, effective after ~15 min, block or replace; applies to server-API messages only if Console "Moderate messages sent by server API" is on), automatic moderation (billed), pre-messaging webhook. `S:12284`. | from-docs | Optional. `configurePriorities()` mirrors `blocklistWords(true)` into the profanity list: it reads the list, adds only missing words (English first) in batches of <=50 and honours a `remainingQuota` the provider reports; with the default quota only the first ~50 words fit. The app-level filter (`ingest/filter.ts`) stays authoritative. Translation is not used (the LLM does i18n). | Smoke check `profanity` |

## 2. How the adapters behave (decisions you may want to veto)

Server (`nexconn.server.ts`):

- Every SDK call has a 4 s timeout (axios `timeout`, an `AbortSignal`, and a hard `Promise.race`), is wrapped, and treats an HTTP-200 reply with `code !== 0` as a failure. Thrown `ApiException`s are read by duck type (`errorCode`, `httpStatus`). Failover to the backup domain is the SDK's own.
- Nothing throws into the engine except `ensureUser` (it must return a token; the session route catches it and continues without realtime) and `ensureChannel` (the room-creation path logs it and carries on). `publishState`, `publishTally`, `sendRoomMessage`, `moderate`, `destroyChannel`, `configurePriorities` log and resolve; `sendReceipt` resolves `false`; `countParticipants` resolves `null`; `verifyWebhook` resolves `null`.
- One SDK `Configuration` and set of API clients per process on `globalThis.__cpNexconn` (rebuilt if the credentials change); the SDK is imported lazily, so mock mode never loads it. Senders (narrator, bots) are registered with `issueAccessToken` once per process before their first message (a failure is retried after 60 s and never blocks the send).
- All server sends use `shouldPersist: 0`: the server archives in Postgres and the open-channel cloud-retention service does not have to be enabled.
- `CP:State` is sent only when `phaseChanged`; if the JSON exceeds 9000 bytes the optional `i18n` bundles are dropped, and if it still does not fit it is skipped (clients still get metadata and HTTP).
- `sendRoomMessage` sends `notice` and `mod` messages as `cp_narrator` whatever sender the caller names, because clients drop narrator-only types from anyone else.
- Moderation: mute/ban use `durationMinutes 43200` (the documented maximum, 30 days); unmute/unban use the remove endpoints.
- `countParticipants` reads `listOpenChannelParticipants(pageSize 1).result.total`. It over-counts idle rooms: offline users are only evicted lazily (docs overview.md).

Client (`nexconn.client.ts`):

- Trust model. Server-stamped `senderUserId` is the only identity. State, tally, moderation, notice and receipt are accepted only from `cp_narrator` (any registered type can be sent by any player, so without this a player could broadcast a forged `CP:State`). Ideas and cheers take `userId` from the sender, never from the body; the `name` inside an idea is self-declared and display-only. Room events are accepted only for joined channels. Messages are deduped on the SDK `messageId`.
- `joinRoom` uses `messageCount: 0`. The installed engine source turns `0` into `10` (`Math.max(Math.min(count,50),-1) || 10`), and `-1` is the value that fetches none; since nothing is persisted server-side, no history is expected either way. A failed first join throws (so `useRoom` backs off and retries); a failed repeat join is tolerated because the SDK re-enters channels by itself after a reconnect.
- A status of `SUSPENDED` (3) maps to `connecting`. If the SDK stops reconnecting (kicked `31010`, bad token `31004`/`31005`), the status stays `disconnected` and the app's 20 s watchdog builds a new client. Token expiry is not handled in the adapter.
- `NCEngine` is a static, process-wide singleton: one browser page can host one Nexconn user. `disconnect()` on one client disconnects the engine.

## 3. Pack corrections (the SDK or docs win; details in `NEXCONN_SDK_NOTES.md`)

1. Metadata keys cannot contain `.`: `cp_phase`, not `cp.phase` (decision D12). Whether `.` is truly rejected is a smoke check.
2. Priority **senders** are per channel (`ensureChannel` adds the narrator to each new channel); priority and low-priority **types** are per app.
3. Free plan limits: 2,000 MAU; the connection allowance is 5% of the MAU tier (100 on plain Free). The pack's "500 concurrent connections" depends on Chat Growth Credit and is not stated on the pages that could be read: NOT CONFIRMED. 50 concurrent open channels; message size 15K characters.
4. Client send limit is 5 messages/s across all channels (the pack only had the app-level 1 idea / 2 s).
5. The webhook body is **not signed** (`sha1(AppSecret + Nonce + Timestamp)` only), so a captured header triple authenticates any body for as long as the timestamp is accepted. Defence: 5-minute timestamp window, strict parsing, dedupe on `messageId`, ingest's own checks. Optional extra: restrict the webhook endpoint to Nexconn's published source IPs. Webhook headers are `AppKey` (not `App-Key`, which is what outbound API calls use).
6. The Web SDK connects with two calls, `NCEngine.initialize({appKey, areaCode})` then `NCEngine.connect({token})`, not `connect({appKey, token, area})`.
7. `registerCustomMessages` must run after `initialize` and before `connect`; the field is `isPersisted`, not the docs' `isPersited`.
8. A received message's channel is `m.channelIdentifier.channelId/.channelType`; the flat `m.channelId` / `m.channelType` are `undefined` at runtime.
9. `ConnectionStatus` is a numeric enum (0 CONNECTED, 1 CONNECTING, 2 DISCONNECTED, 3 SUSPENDED); the example comparing with the string `'CONNECTED'` is wrong.
10. The server SDK is not on npm and the git install ships no `dist/`: the repo's `postinstall` (`scripts/build-nexconn-server-sdk.mjs`) builds it and `pnpm-workspace.yaml` allow-lists it. API domains must include `https://` (the adapter adds it when missing).
11. The SDK does not throw on HTTP-200 business errors: every call checks `data.code === 0`.
12. A user can be in one open channel at a time by default (Console option).

## 4. Console checklist and the exact commands for a human

Console (first hour):

1. Create the app; note its data center. The client `areaCode`, the API domains and the App Key must all belong to the same data center (`NEXT_PUBLIC_NEXCONN_AREA` is an `AreaCode` key such as `SG`, or its number).
2. Enrol in Chat Growth Credit and send one message if you want the higher connection allowance (confirm the PCC figure there).
3. Chat > Chat settings > Open Channels: enable the **metadata service** (else error `23426`) and **Open channel message priority** (else `1009`). Leave "Restrict messaging to joined participants" off. Cloud retention is not needed.
4. Security & Moderation: decide on "Moderate messages sent by server API" (it applies the profanity list to bots and the narrator too).
5. Chat > Chat settings > Webhooks: URL `https://<deploy>/api/nexconn/webhook`, event `message:send`. (`pre_messaging` is not used.)
6. If "Domain allowlist for Web clients" is on, add `localhost` and the deploy origin.
7. `.env`: `NEXCONN_APP_KEY`, `NEXCONN_APP_SECRET`, `NEXCONN_PRIMARY_API_DOMAIN`, `NEXCONN_SECONDARY_API_DOMAIN`, `NEXT_PUBLIC_NEXCONN_AREA`, `APP_URL` (the public URL). `NEXCONN_TEXT_ENVELOPE=1` only if the show proves registered custom types do not reach clients.

Commands:

```bash
# 1. server-side checks U1-U10 (creates and destroys its own test channel; also registers the CP:* priority types and syncs up to the profanity quota)
pnpm smoke:nexconn            # exit 0 all load-bearing checks passed, 1 a load-bearing check failed, 2 "needs creds"; appends "Live smoke results" below

# 2. the adapter against the shared RealtimeServer contract (server half). See limits in section 5.
REALTIME_CONTRACT=nexconn pnpm exec vitest run src/tests/integration/realtime-contract.test.ts

# 3. the two-browser live show (confirms every client-side claim in this file)
REALTIME_MODE=nexconn LLM_MODE=live pnpm build && REALTIME_MODE=nexconn LLM_MODE=live pnpm start
#    open /host on one device and /play on another (or two phones): join, run a storm, vote, REVEAL, check the receipt toast and the late-join restore
```

What to look for in the show: players on two devices see the same phase and countdown (state + metadata); ideas from device A appear on device B (custom types delivered, registration works); the vote bars move (tally); the gold receipt toast appears on a device that never opened a direct channel (U7); `/api/nexconn/webhook` logs ideas arriving (U5; `INGEST_MODE=dual` makes this non-fatal if they do not).

## 5. Known limits and open items

- `realtime-contract.test.ts` with `REALTIME_CONTRACT=nexconn` cannot pass its listener half as written: `createNexconnClient().connect()` needs a browser (`window`), and `NCEngine` is one static engine per page, while `attach()` creates several users in one Node process. The server half (ensureUser ... destroyChannel) is fine. Running the listeners needs one browser context per user (for example Playwright) or a harness change; that file is not owned by the adapter work.
- Not verifiable offline (see NEXCONN_SDK_NOTES section 7): `.` in keys; custom-type delivery to Web clients; initial metadata replay on join; whether non-persisted ideas still fire `message:send`; 7-day TTL on Free; business errors as HTTP 200 vs 4xx (both are handled); `AreaCode.SA` meaning (the d.ts says South America, the docs list Saudi Arabia); webhook header casing as delivered; underscore in user ids (the smoke script checks `u_<id>` and `cp_narrator`: if Nexconn rejects `_`, `newUserId()` and `NARRATOR_USER_ID` must change).
- The bundled-by-Next behaviour of `@nexconn/server-sdk` (a CJS package with axios) was not built here (`pnpm build` was out of scope). If a build or start complains about it, add `serverExternalPackages: ["@nexconn/server-sdk"]` to `next.config.ts`.
- Session tokens: if Nexconn tokens expire during a long show, the adapter does not refresh them (the page would need a new `/api/session`).
- Bots and the narrator are created with `issueAccessToken` on first use; there is no cleanup of those users.

## Live smoke results (2026-11-17T11:08:59.660Z)

Run by `pnpm smoke:nexconn` against api.sg-light-api.com (primary) / api-b.sg-light-api.com (backup). Test channel `cpsmokemwklak08` was created and destroyed.

| Check | U | Result | Load-bearing | Detail |
|---|---|---|---|---|
| issueAccessToken for a plain user id | U1 | PASS | yes | token of 104 chars |
| user ids the app really uses: u_<id> and cp_narrator (underscore) | U1 | PASS | yes | both accepted |
| ensureChannel: create + longest keep-alive + priority sender | U9 | PASS | yes | destroyType 0, ttlMinutes 10080 |
| publishState: metadata batch set + CP:State message, metadata read back | U2/U3/U4 | PASS | yes | 7 keys read back; CP:State accepted |
| metadata key charset: is a '.' key (cp.phase) accepted? | U3 | INFO | no | 'cp.dot' -> code 1002 (rejected: keep underscores); 'cp_ok-1' -> 0; 4000-char value -> 0 |
| RC:TxtMsg fallback envelope accepted by the server (NEXCONN_TEXT_ENVELOPE=1) | U4 | INFO | no | fallback sent; a never-registered custom type -> code 0. Whether Web clients receive it needs the two-browser show. |
| publishTally + sendRoomMessage (bot idea, cheer, notice, moderation) | U4 | PASS | yes | all accepted by the server (client delivery needs the two-browser show) |
| configurePriorities: CP:State/CP:Moderation priority, CP:Idea/CP:Cheer low priority | U6 | PASS | no | registered and read back |
| narrator is on the channel's priority sender list | U6 | PASS | no | cp_narrator listed |
| sendReceipt: direct message from the narrator, system message as fallback | U7 | PASS | yes | adapter returned true; direct code 0, system code 0. Accepted is not shown: confirm in a browser that the toast appears for a user who never opened that channel. |
| countParticipants (participant list total) | U8 | PASS | yes | total 0 (an empty channel) |
| mute / unmute / ban / unban a test user, read back from the lists | U8 | PASS | yes | all four actions accepted and visible in the lists |
| profanity list: blocklist synced by configurePriorities, provider quota | U10 | INFO | no | 50 words on the provider list (list code 0); adding one more -> code 1019 (quota full or not permitted: the app-level filter stays authoritative) |
| webhook URL reachability from this machine (the Console setting itself cannot be read) | U5 | INFO | no | http://localhost:3000/api/nexconn/webhook: not reachable from here (is the app running?). APP_URL is local: Nexconn cannot call it; use the deployed https URL in Console > Chat > Chat settings > Webhooks and subscribe to message:send. |
| Web SDK facts (package versions; metadata subscribe and join need a browser) | U1/U2 | INFO | no | @nexconn/chat 26.2.1, @nexconn/engine 26.2.1. Client behaviour is confirmed only by the two-browser live show. |
| destroyChannel removes the test channel | U9 | PASS | yes | getOpenChannel now answers 23410 (does not exist) |

All load-bearing checks passed.

## Live show results (2026-11-17, `pnpm live:check` step 4)

Production build with `REALTIME_MODE=nexconn`, Singapore data center, two headless Chromium phones + the big screen
playing one full round (`src/tests/live/live-show.spec.ts`). Raw results: `docs/live-results/live-*.json`.
Run 1 used no AI keys (heuristics); runs 2–3 used OpenAI `gpt-5.4-mini` (no Anthropic key).

| | Run 1 (11:13Z) | Run 2 (11:18Z) | Run 3 (11:23Z) |
|---|---|---|---|
| Idea → other phone (ms) | 930, 940 | 1024, 948, 2988, 988, 926, 949 | 997, 928, 939, 939, 945, 931 |
| Idea → big screen (ms) | 966, 939 | 1087, 944, 2990, 988, 926, 949 | 1037, 925, 938, 940, 946, 932 |
| Distill (provider, ms) | heuristic (2 clusters), 419 | openai, 1973 | openai, 1892 |
| STORM deadline → options on phones | not measured correctly | 2779 ms | 3059 ms |
| Narration visible after REVEAL | 25 ms (template) | 2386 ms | 2412 ms |
| BALLOT toast on a phone during VOTE | yes | yes | yes |
| Receipts on /me (Ada, Bo) | 2, 1 | 2, 2 | 3, 1 |
| AI finale | — | — | "Midnight in the Moon Ballroom", 890-char recap, tagline |
| Console errors/warnings | SDK info lines (fixed: log level ERROR) | none | none |

What this settles:
- **U1 / U4 (client → clients):** `CP:Idea` sent with the Web SDK reached the other Web clients; registering custom types in client code is enough (no Console step). `NEXCONN_TEXT_ENVELOPE` stays `0`.
- **U4 (server → clients) and U2:** phones moved through LOBBY → PROMPT → STORM → DISTILL → VOTE → REVEAL → FINALE while connected, when the HTTP poll is off, so server-sent `CP:State` / metadata reached Web clients.
- **U7:** the BALLOT toast appeared during VOTE on a phone that never opened a direct channel (the `/api/me` fallback poll only runs at REVEAL), so narrator direct messages reach Web clients.
- **Ids with `_`** (`u_…`, `cp_narrator`) work end to end.
- **Latency:** idea delivery is about 0.93–1.0 s with one 3.0 s outlier in 14 samples, measured from India to the Singapore data center. Our client sends over Nexconn immediately (in parallel with the HTTP post), so this is the provider path. It meets the 1 s target at the median, not at p95. Untested lever: ideas are registered as low-priority types (`CP:Idea`, `CP:Cheer`).
- **Still not live-tested:** the message webhook (needs the deployed https URL in the Console; with `INGEST_MODE=dual` the HTTP path carries ideas meanwhile), more than 3 concurrent clients, and real phones on mobile networks.

## Live smoke results (2026-11-17T15:55:58.309Z)

Run by `pnpm smoke:nexconn` against api.sg-light-api.com (primary) / api-b.sg-light-api.com (backup). Test channel `cpsmokemwkvjl6l` was created and destroyed.

| Check | U | Result | Load-bearing | Detail |
|---|---|---|---|---|
| issueAccessToken for a plain user id | U1 | PASS | yes | token of 104 chars |
| user ids the app really uses: u_<id> and cp_narrator (underscore) | U1 | PASS | yes | both accepted |
| ensureChannel: create + longest keep-alive + priority sender | U9 | PASS | yes | destroyType 0, ttlMinutes 10080 |
| publishState: metadata batch set + CP:State message, metadata read back | U2/U3/U4 | PASS | yes | 7 keys read back; CP:State accepted |
| metadata key charset: is a '.' key (cp.phase) accepted? | U3 | INFO | no | 'cp.dot' -> code 1002 (rejected: keep underscores); 'cp_ok-1' -> 0; 4000-char value -> 0 |
| RC:TxtMsg fallback envelope accepted by the server (NEXCONN_TEXT_ENVELOPE=1) | U4 | INFO | no | fallback sent; a never-registered custom type -> code 0. Whether Web clients receive it needs the two-browser show. |
| publishTally + sendRoomMessage (bot idea, cheer, notice, moderation) | U4 | PASS | yes | all accepted by the server (client delivery needs the two-browser show) |
| configurePriorities: CP:State/CP:Moderation priority, CP:Idea/CP:Cheer low priority | U6 | PASS | no | registered and read back |
| narrator is on the channel's priority sender list | U6 | PASS | no | cp_narrator listed |
| sendReceipt: direct message from the narrator, system message as fallback | U7 | PASS | yes | adapter returned true; direct code 0, system code 0. Accepted is not shown: confirm in a browser that the toast appears for a user who never opened that channel. |
| countParticipants (participant list total) | U8 | PASS | yes | total 0 (an empty channel) |
| mute / unmute / ban / unban a test user, read back from the lists | U8 | PASS | yes | all four actions accepted and visible in the lists |
| profanity list: blocklist synced by configurePriorities, provider quota | U10 | INFO | no | 50 words on the provider list (list code 0); adding one more -> code 1019 (quota full or not permitted: the app-level filter stays authoritative) |
| webhook URL reachability from this machine (the Console setting itself cannot be read) | U5 | INFO | no | http://localhost:3000/api/nexconn/webhook: unsigned POST -> HTTP 401 (rejected as it should be). APP_URL is local: Nexconn cannot call it; use the deployed https URL in Console > Chat > Chat settings > Webhooks and subscribe to message:send. |
| Web SDK facts (package versions; metadata subscribe and join need a browser) | U1/U2 | INFO | no | @nexconn/chat 26.2.1, @nexconn/engine 26.2.1. Client behaviour is confirmed only by the two-browser live show. |
| destroyChannel removes the test channel | U9 | PASS | yes | getOpenChannel now answers 23410 (does not exist) |

All load-bearing checks passed.

## Live smoke results (2026-11-18T17:59:50.380Z)

Run by `pnpm smoke:nexconn` against api.sg-light-api.com (primary) / api-b.sg-light-api.com (backup). Test channel `cpsmokemwmfes6y` was created and destroyed.

| Check | U | Result | Load-bearing | Detail |
|---|---|---|---|---|
| issueAccessToken for a plain user id | U1 | PASS | yes | token of 104 chars |
| user ids the app really uses: u_<id> and cp_narrator (underscore) | U1 | PASS | yes | both accepted |
| ensureChannel: create + longest keep-alive + priority sender | U9 | PASS | yes | destroyType 0, ttlMinutes 10080 |
| publishState: metadata batch set + CP:State message, metadata read back | U2/U3/U4 | PASS | yes | 7 keys read back; CP:State accepted |
| metadata key charset: is a '.' key (cp.phase) accepted? | U3 | INFO | no | 'cp.dot' -> code 1002 (rejected: keep underscores); 'cp_ok-1' -> 0; 4000-char value -> 0 |
| RC:TxtMsg fallback envelope accepted by the server (NEXCONN_TEXT_ENVELOPE=1) | U4 | INFO | no | fallback sent; a never-registered custom type -> code 0. Whether Web clients receive it needs the two-browser show. |
| publishTally + sendRoomMessage (bot idea, cheer, notice, moderation) | U4 | PASS | yes | all accepted by the server (client delivery needs the two-browser show) |
| configurePriorities: CP:State/CP:Moderation priority, CP:Idea/CP:Cheer low priority | U6 | PASS | no | registered and read back |
| narrator is on the channel's priority sender list | U6 | PASS | no | cp_narrator listed |
| sendReceipt: direct message from the narrator, system message as fallback | U7 | PASS | yes | adapter returned true; direct code 0, system code 0. Accepted is not shown: confirm in a browser that the toast appears for a user who never opened that channel. |
| countParticipants (participant list total) | U8 | PASS | yes | total 0 (an empty channel) |
| mute / unmute / ban / unban a test user, read back from the lists | U8 | PASS | yes | all four actions accepted and visible in the lists |
| profanity list: blocklist synced by configurePriorities, provider quota | U10 | INFO | no | 50 words on the provider list (list code 0); adding one more -> code 1019 (quota full or not permitted: the app-level filter stays authoritative) |
| webhook URL reachability from this machine (the Console setting itself cannot be read) | U5 | INFO | no | https://crowdplay-rs7o.onrender.com/api/nexconn/webhook: unsigned POST -> HTTP 401 (rejected as it should be). Confirm the same URL and the message:send event in Console > Chat > Chat settings > Webhooks. |
| Web SDK facts (package versions; metadata subscribe and join need a browser) | U1/U2 | INFO | no | @nexconn/chat 26.2.1, @nexconn/engine 26.2.1. Client behaviour is confirmed only by the two-browser live show. |
| destroyChannel removes the test channel | U9 | PASS | yes | getOpenChannel now answers 23410 (does not exist) |

All load-bearing checks passed.
