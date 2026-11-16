# CROWDPLAY - Nexconn SDK Notes (verified API surface)

Written 2026-11-17. Purpose: let the adapter engineer write `src/lib/realtime/nexconn.server.ts` and `nexconn.client.ts` without guessing. Nothing here was run against a live Nexconn server (no credentials exist). Everything below is read from the installed packages, the official docs, or a local mock.

Confidence tags used throughout:

- **[T]** read from the installed `.d.ts` / source in `node_modules` (the truth per NEXCONN_INTEGRATION.md rule 2).
- **[R]** probed at runtime in Node 22 (enum values, object shape, import behaviour).
- **[W]** observed on the wire against a local mock HTTP server (what the server SDK actually sends/does).
- **[D]** stated in the official docs (URL given). Docs can be wrong; see "Doc vs types conflicts".
- **NOT CONFIRMED** - could not be established offline. Needs a live call or the Console.

Docs mirror used (curl, saved locally): `H:\ClaudeData\Temp-claude\nexconn-probe\docs\` (index = `https://docs.nexconn.ai/llms.txt`, 919 lines, fetched 2026-11-17).

---

## 1. What installed, exactly

| Item | Specifier that installed | Resolved version |
|---|---|---|
| Server SDK | `pnpm add "git+https://github.com/NexconnAI-Dev/nexconn-server-sdk-node.git#v0.1.2"` (pnpm rewrites it in package.json to `"github:NexconnAI-Dev/nexconn-server-sdk-node#v0.1.2"`) | `@nexconn/server-sdk` 0.1.2, commit `06acc1a4`, axios 1.21.1 (dep `^1.6.1`) |
| Web SDK | `pnpm add @nexconn/engine@latest @nexconn/chat@latest` | `@nexconn/chat` **26.2.1**, `@nexconn/engine` **26.2.1** |

- `@nexconn/chat` has `peerDependencies: { "@nexconn/engine": "=26.2.1" }` - the two must be the exact same version; pin both with no caret (`"26.2.1"`). [T]
- npm dist-tags: `latest` = 26.2.1, `alpha` = 26.5.0-alpha.9. Release notes: 26.2.0 initial (2026-04-15), 26.2.1 (2026-04-30). [D: https://docs.nexconn.ai/chatsdk-web/release-notes.md]
- Not needed: `@nexconn/chatui` (Chat UI Web does not cover Open Channels). Its example pins `@nexconn/chatui` 26.2.2-alpha.1. [D]
- The server SDK is **not on the npm registry** (404 for `@nexconn/server-sdk`) and the repo has no GitHub releases, only tags. [verified 2026-11-17]
- Tooling used: Node v22.17.1, pnpm 10.33.0, npm 11.13.0, Windows 11.

### 1.1 Skill install location

- Command run: `npx -y skills add https://github.com/NexconnAI-Dev/nexconn-skills.git --skill nexconn-chat -y` (non-interactive: the CLI detected an agent and skipped prompts).
- Canonical copy: `H:\Nexconn\.agents\skills\nexconn-chat\` (SKILL.md + `references/` + `scripts/fetch-docs.sh`). `H:\Nexconn\.claude\skills\nexconn-chat` is a symlink to it. Lock file: `H:\Nexconn\skills-lock.json` (hash `81ada7ea...`). The CLI's shared `.agents/skills` dir serves Antigravity, Cline, Codex, Cursor, Gemini CLI and others; Claude Code, OpenClaw, Continue, Hermes Agent and Trae get symlinks. Only `.agents/`, `.claude/skills/` and `skills-lock.json` were written under H:\Nexconn by this step.
- The skill is a routing/decision checklist (five-layer Chat UI vs Chat SDK framework, credential rules, doc-fetch script `scripts/fetch-docs.sh`, which caches into `references/cache/`; I did not run it and fetched the same URLs with curl into the scratch dir instead). It contains **no code and no API names** beyond `NCEngine.initialize/connect`. Its rules that matter here: never put App Secret/signing in client code; default log level Debug while integrating, WARN/ERROR in production; "installed code wins over docs"; Chat UI Web does not cover Open Channels (confirms the pack). I read SKILL.md and every file under `references/` (api-references, application-layer-rules, chat-ui-repositories, credentials-and-token, feature-pattern-map, image-analysis-guide, integration-workflow, sdk-integration-decision-framework, platform-setup/{index,web,android,ios,flutter}) plus the head of `fetch-docs.sh`. Only `api-references`, `credentials-and-token`, `platform-setup/web` and the decision framework carry anything usable here.
- The skills repo `example/web/{react,vue}` exists (not part of the install). The React example is **Chat UI + Direct channel only** (no Open Channel). It contains one bug worth knowing: `setIsConnected(status === 'CONNECTED')` is never true because `ConnectionStatus` is a numeric enum (see 3.3). Copy: `...\nexconn-probe\docs\example\App.jsx`.

### 1.2 BLOCKER: the server SDK installs without its compiled output

The git install runs `prepare` (`tsc`), but the repo's `.gitignore` lists `dist`, there is no `.npmignore` and no `files` field, so pnpm (and npm - tested both) pack only the `.ts` sources. Result: `package.json` says `"main": "./dist/index.js"` but `dist/` does not exist and `require('@nexconn/server-sdk')` throws `Cannot find module '.../dist/index.js'`. [R, reproduced with pnpm and npm]

Also: pnpm 10 refuses to run a git dependency's `prepare` unless allow-listed. Error `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`. The `prepare` script is only `tsc && tsc -p tsconfig.esm.json` (inspected before allowing). Fix in `pnpm-workspace.yaml` (H:\Nexconn's file already has an `onlyBuiltDependencies:` list containing `esbuild`; append to it, do not add a second key):

```yaml
onlyBuiltDependencies:
  - "@nexconn/server-sdk"
```

Tested workaround (clean install of a fresh project, pnpm 10.33.0, Node 22, Windows: dist built, `require` OK, Node ESM named imports OK): add `typescript` + `@types/node` as devDependencies and a `postinstall` that builds in place. Working script: `H:\ClaudeData\Temp-claude\nexconn-probe-b\scripts\build-nexconn-server-sdk.mjs` (resolves the package dir, then runs `tsc -p tsconfig.json` and `tsc -p tsconfig.esm.json` with `--typeRoots <root>/node_modules/@types`; skips if `dist/index.js` and `dist/esm/index.js` exist). Not tested on Vercel/CI.

Alternatives (not tested): (a) skip the SDK and implement ~15 signed POSTs directly - the protocol is tiny (section 2.2) and every endpoint below is documented; (b) vendor the 5 source files (`api.ts base.ts common.ts configuration.ts index.ts`, api.ts is 1 MB) into the repo. **Recommendation: (a) or the postinstall script.** Decide before writing `nexconn.server.ts`; the adapter interface is identical either way.

---

## 2. Server SDK (`@nexconn/server-sdk` 0.1.2)

Runtime deps: axios only. Node >=14, CJS main + `dist/esm` (`module` field; no `exports` map, `sideEffects:false`). Node-only (uses `crypto`). Keep it out of client bundles. [T]
Compiles clean under `moduleResolution` bundler, node16 and node10 once `dist/` exists. [R]

### 2.1 Configuration / init (verbatim from `configuration.ts` and README)

```ts
import { Configuration, UserManagementApi } from '@nexconn/server-sdk';

const configuration = new Configuration();
configuration.setNexconnCredentials(APP_KEY, APP_SECRET);          // sets App-Key header + signing secret
configuration.setPrimaryBackupDomains(PRIMARY_URL, BACKUP_URL);     // REQUIRED, no default, both required
const users = new UserManagementApi(configuration);
```

Facts [T] + [W]:
- Domains must include the scheme: `https://api.sg-light-api.com`. Without it every call fails with `NetworkException: Invalid URL`. [W] `.env` values must therefore be full URLs (or the adapter prepends `https://`).
- Not configuring domains throws a plain `Error: No API domains configured...`. `setServers([...])` with <2 entries throws `servers must contain both primary and backup domains`.
- Data-center domains [D: https://docs.nexconn.ai/platform-chat-api/prepare-to-use-api/base-url.md]: Singapore `api.sg-light-api.com` / `api-b.sg-light-api.com`; North America `api.us-light-api.com` / `api-b.us-light-api.com`; Saudi Arabia `api.sau-light-api.com` / `api-b.sau-light-api.com`. The App Key's data center must match.
- Failover: automatic and on by default (`setAutoFailoverEnabled(true)`, `setErrorSwitchingThreshold(1)`). On HTTP >=500 or a network error the next call goes to the other domain. No timeout is set by default; pass `new Configuration({ baseOptions: { timeout: 5000 } })` (docs recommend 5 s; merge logic is in the constructor [T], not run).
- Optional: `setNonceGenerator(fn)` (default = 7 random bytes as a decimal string, 16-17 digits; limit is 18 chars). `setAutoFailoverEnabled`, `setServers`.
- Create the `Configuration` once per process and reuse the Api instances (they hold the failover counters).
- `User-Agent: @nexconn/server-sdk/0.1.2` is added to every request.

### 2.2 Wire protocol and error behaviour (verified against a local mock, [W])

Every request is `POST <domain><path>`, `Content-Type: application/json`, JSON body (all current endpoints; docs say form-urlencoded exists only for a few legacy ones, none used here). Headers the SDK adds: `App-Key`, `Nonce`, `Timestamp` (ms), `Signature` = `sha1_hex(AppSecret + Nonce + Timestamp)` (matched in my mock test), `X-Request-ID` (uuid), `User-Agent`. Signature rule: [D: https://docs.nexconn.ai/platform-chat-api/prepare-to-use-api/auth.md]. Use this if you implement the HTTP layer yourself.

Errors:
- HTTP non-2xx -> SDK **throws** a typed `ApiException` subclass chosen by status: 400 `BadRequestException`, 401 `UnauthorizedException`, 403 `ForbiddenException`, 404 `NotFoundException`, 409 `ConflictException`, 422 `UnprocessableEntityException`, 429 `TooManyRequestsException`, >=500 `ServiceException`, no response `NetworkException`, anything else (including **430 "service not enabled"**) plain `ApiException`. Fields: `httpStatus`, `errorCode` (number from body `code`, -1 if unparsable), `errorMessage` (from body `errorMessage`), `responseBody`, `innerError`. [W]
- HTTP 200 with body `{"code": 23410, ...}` -> SDK **resolves, does not throw**. [W] **The adapter must check `res.data.code === 0` on every call** and also catch `ApiException`. Whether Nexconn returns business errors as HTTP 200 or 4xx is NOT CONFIRMED (docs say both exist: HTTP table + business codes table, https://docs.nexconn.ai/platform-chat-api/code.md).
- Success shape: axios response; use `res.data` -> `{ code: 0, result?: {...} }`.
- Business codes worth branching on [D, code.md]: `1004` signature failed, `1008` rate limit (HTTP 429), `1009` service not enabled (enable in Console), `23410` open channel does not exist, `23435` open channel already exists, `23423` >100 metadata entries, `23424` no permission to modify another owner's metadata entry, `23426` open-channel metadata service not enabled, `23427` metadata key not found, `23432/23433/23436` bad destroy time/type/lifetime, `1016` keep-alive channel quota.

### 2.3 Needs table (NEXCONN_INTEGRATION.md section 1) - class, method, request, response

All 15 rows exist with exactly the claimed class, method and path. [T] (method->path map generated from `api.ts`.) Two were additionally exercised on the wire in the mock: `issueAccessToken`, `sendOpenChannelMessage`. [W] None run against Nexconn itself. Every method signature is `(request, options?: RawAxiosRequestConfig) => Promise<AxiosResponse<Resp>>`; `CodeOnlyResponse = { code: number }`.

| Need | Class.method (path) | Request shape [T] | Response `res.data` [T] | Status |
|---|---|---|---|---|
| Register user / token | `UserManagementApi.issueAccessToken` (`/v4/auth/access-token/issue`) | `{ userId: string; name: string; avatarUrl?: string }` | `{ code; result?: { userId?: string; accessToken?: string } }` | [T][W][D]. Note `name` is REQUIRED (push display only), userId <=64 bytes "letters and numbers" (docs; underscore NOT CONFIRMED), 200 req/s, re-issuing for the same userId is fine |
| Create room channel | `OpenChannelManagementApi.createOpenChannel` (`/v4/open-channel/create`) | `{ channelId: string; destroyType?: number /*0 inactive,1 scheduled*/; ttlMinutes?: number /*60..10080*/; shouldFreeze?: boolean; allowedSendersList?: string[] /*<=20*/; metadataOwnerId?: string; metadata?: Record<string,string> /*<=20, needs metadata service*/ }` | `CodeOnlyResponse`. Existing id -> business code 23435 | [T][D] |
| Keep alive | `OpenChannelManagementApi.setOpenChannelDestroyType` (`/v4/open-channel/destroy-type/set`) | `{ channelId: string; destroyType?: number; ttlMinutes?: number }` | `CodeOnlyResponse` | [T][D] |
| Destroy | `OpenChannelManagementApi.destroyOpenChannels` (`/v4/open-channel/destroy`) | `{ channelIds: string[] }` | `CodeOnlyResponse` | [T][D] |
| (extra) existence/info | `OpenChannelManagementApi.getOpenChannel` (`/v4/open-channel/get`) | `{ channelId: string }` | `{ code; result?: { channelId?, createdAt?: number, participantCount?: number, destroyType?, ttlMinutes?, isFrozen?: boolean } }`; code 23410 if missing | [T][D] |
| Send state/outcome/bot msgs | `MessageManagementApi.sendOpenChannelMessage` (`/v4/open-channel/message/send`) | `{ fromUserId: string; toChannelIds: string[] /*<=10 recommended*/; messageType: string /*custom: not 'RC:' prefix, <=32 chars*/; content: string; shouldPersist?: 0\|1 /*default 1*/; isEchoToSender?: 0\|1 /*default 0*/; priority?: 0\|1\|2\|3 }` | `{ code; result?: { messageIds?: { channelId?: string; messageId?: string }[] } }` | [T][W][D] |
| Shared state set | `OpenChannelMetadataApi.batchSetOpenChannelMetadata` (`/v4/open-channel/metadata/batch/set`) | `{ channelId: string; metadataOwnerId: string; metadata: Record<string,string> /*<=20*/; shouldAutoDelete?: 0\|1 }` | `CodeOnlyResponse`. Force-overwrites existing keys incl. owner | [T][D] |
| Shared state get | `OpenChannelMetadataApi.batchGetOpenChannelMetadata` (`/v4/open-channel/metadata/batch/get`) | `{ channelId: string; metadataKeys?: string[] /*<=100; omit = all*/ }` | `{ code; result?: { metadata?: { key?, value?, metadataOwnerId?, shouldAutoDelete?: number, updatedAt?: number }[] } }` | [T][D] |
| Shared state remove | `OpenChannelMetadataApi.batchRemoveOpenChannelMetadata` (`/v4/open-channel/metadata/batch/remove`) | `{ channelId: string; metadataOwnerId: string; metadataKeys: string[] /*<=20*/ }` | `CodeOnlyResponse`. Force-deletes regardless of owner | [T][D] |
| Low priority (droppable) | `OpenChannelMessagePriorityApi.addOpenChannelLowPriorityMessageTypeList` (`/v4/open-channel/low-priority-message-type-list/add`) | `{ messageTypes: string[] /*<=5 per request, <=20 total per app*/ }` | `CodeOnlyResponse` | [T][D]. Console toggle "Open channel message priority" must be on, else code 1009 |
| Priority types | `OpenChannelPriorityControlsApi.addOpenChannelPriorityMessageTypeList` (`/v4/open-channel/priority-message-type-list/add`) | `{ messageTypes: string[] /*<=20 per App Key, global*/ }` | `CodeOnlyResponse` | [T][D] |
| Priority sender | `OpenChannelPriorityControlsApi.addOpenChannelPrioritySenderList` (`/v4/open-channel/priority-sender-list/add`) | `{ channelId: string; participantIds: string[] /*<=20 per channel*/ }` | `CodeOnlyResponse` | [T][D]. **Per channel** - must be called for every channel you create |
| Receipts (direct) | `MessageManagementApi.sendDirectChannelMessage` (`/v4/direct-channel/message/send`) | `{ fromUserId: string; toUserIds: string[] /*<=1000*/; messageType: string; content: string /*<=128 KB*/; pushContent?; pushData?; isEchoToSender?: 0\|1; shouldPersist?: 0\|1 (default 1); disablePush?: boolean; hasMetadata?; metadata?; needReadReceipt?: 0\|1; verifyBlocklist?; pushExt?; disableUpdateLastMsg?; count?; contentAvailable? }` | `{ code; result?: { messageIds?: { userId?: string; messageId?: string }[] } }` | [T][D]. Sender must have an access token. Rate 6000 msgs/min |
| Receipt fallback | `SystemMessagesApi.sendSystemChannelMessage` (`/v4/system-channel/message/send`) | `{ fromUserId; toUserIds: string[] /*<=100*/; messageType; content; pushContent?; pushData?; shouldPersist?; disablePush?; pushExt?; disableUpdateLastMsg?; contentAvailable? }` | same as direct | [T][D]. 100 msgs/s |
| Mute | `OpenChannelParticipantsModerationApi.addOpenChannelParticipantMuteList` (`/v4/open-channel/participant/mute-list/add`) | `{ channelId: string; participantIds: string[] /*<=20*/; durationMinutes: number /*REQUIRED, <=43200*/; extra?: string; needNotify?: boolean }` | `CodeOnlyResponse` | [T][D] |
| Ban | `...addOpenChannelParticipantBanList` (`/v4/open-channel/participant/ban-list/add`) | same request type as mute (`OpenChannelParticipantMuteListAddRequest`) | `CodeOnlyResponse` | [T][D]. Removes the user from the channel and blocks re-join |
| (unmute/unban for `moderate()`) | `...removeOpenChannelParticipantMuteList` / `...removeOpenChannelParticipantBanList` (`.../mute-list/remove`, `.../ban-list/remove`) | `{ channelId: string; participantIds: string[]; extra?: string; needNotify?: boolean }` | `CodeOnlyResponse` | [T][D] |
| Player count | `...listOpenChannelParticipants` (`/v4/open-channel/participant/list`) | `{ channelId: string; pageSize?: number /*<=500*/; order?: 1\|2 }` | `{ code; result?: { total?: number; participants?: { participantId?: string; createdAt?: string /*UTC 'YYYY-MM-DD HH:MM:SS'*/ }[] } }`. Use `result.total` as the count | [T][D]. `getOpenChannel().result.participantCount` is a cheaper alternative (both NOT compared live) |
| Profanity | `ModerationApi.batchAddProfanityWords` (`/v4/profanity-word/batch/add`) | `{ words: { word: string /*<=32 chars*/; replacement?: string /*<=32; omitted = block*/ }[] /*50 words total*/ }` | `{ code; result?: { remainingQuota?: number } }` | [T][D]. Effective after ~15 min. Applies to client-sent messages by default; server-API messages only if Console "Moderate messages sent by server API" is on |

Other read/cleanup methods exist if useful for idempotent setup: `getOpenChannelLowPriorityMessageTypeList()`, `getOpenChannelPriorityMessageTypeList()` (both take no request; SDK sends `{}`), `getOpenChannelPrioritySenderList({channelId})`, `getOpenChannelParticipantMuteList/BanList({channelId})`, `removeOpenChannelPrioritySenderList`, `removeOpenChannelLowPriorityMessageTypeList`, `removeOpenChannelPriorityMessageTypeList`, `checkOpenChannelParticipantsExist({channelId, participantIds})`, `broadcastOpenChannelMessage` (1/s), `listOpenChannelHistoryMessages`. [T]

Typical call (type-checked against the installed typings; the full compiled snippet file is `H:\ClaudeData\Temp-claude\nexconn-probe\snippets-check.ts`, exit 0 under `--strict`):

```ts
const tok = await users.issueAccessToken({ userId: 'u1', name: 'U1' });
if (tok.data.code !== 0 || !tok.data.result?.accessToken) throw new Error('issue failed');
await msgs.sendOpenChannelMessage({
  fromUserId: 'cp_narrator', toChannelIds: ['room1'], messageType: 'CP:State',
  content: JSON.stringify(state), priority: 2, shouldPersist: 0,
});
```

### 2.4 Server-side semantics that change the design

- **Metadata keys**: key charset is letters, numbers and `+ = - _` only, case-sensitive, <=128 chars; value <=4096 chars; <=20 entries per set; <=100 entries per channel; **~100 KV operations/s per channel shared by client SDK and server API** (batch set of 20 keys = 20 ops). [D: https://docs.nexconn.ai/platform-chat-api/open-channel/kv-attribute/set-kv-entry-batch.md and open-channel-kv-about.md]. NEXCONN_INTEGRATION.md section 5 uses `cp.phase`, `cp.options`...: **a dot is not in the documented charset**. Plan on `cp_phase` / `cp-phase` (NOT CONFIRMED whether `.` is actually rejected; cheap to avoid).
- Server `metadataOwnerId` is required. Only the owner can modify/delete a key via the client SDK unless `overwrite:true` is passed (see 3.8). `shouldAutoDelete: 1` deletes the keys when the owner leaves the channel - keep `0` for the narrator. Metadata dies with the channel.
- Metadata change notifications to clients are subject to the open-channel message drop policy; to protect them add the owner to the priority sender list. [D: open-channel-kv-about.md] Which user id the notification is attributed to: NOT CONFIRMED.
- Priority machinery has three independent layers [D: https://docs.nexconn.ai/platform-chat-api/open-channel/whitelist/whitelist-service-about.md]: (1) per-channel priority senders (<=20, never dropped), (2) per-app priority message types (<=20, never dropped), (3) per-app low-priority types (<=20, dropped first; ~40 msgs/200 ms/channel server budget, 20 slots reserved for high priority). Additionally the server send API has a per-message `priority` (0 standard, 1 allowlisted, 2 high, 3 low; 1 needs the allowlist feature, 3 needs the priority service). The Web client's `SendMessageParams` has **no priority field** [T]; client-sent ideas can only be made droppable through the low-priority type list.
- Plan matrix (Free plan, https://docs.nexconn.ai/guides/realtime-chat/intro-chat/pricing-plans.md): metadata, freeze, low-priority, priority senders, priority types all "Supported" on Free; **Concurrent open channels: 50 on Free**; webhooks: user, post-messaging, pre-messaging, group, open-channel events all Supported on Free; message size limit 15K characters on Free.
- `createOpenChannel` auto-destroy: default destroy after 60 min inactivity (no joins/leaves/messages). `ttlMinutes` range is 60..10080 (7 days). `destroyType:1` counts from creation. Warning: switching a scheduled channel to inactivity mode can destroy it immediately. "Keep-alive" channels (never auto-destroyed) exist but have **no public API/SDK method** (only mentioned in error codes 1015/1016 "contact your account manager"). [D: destroy-about.md, code.md]
- Open channel messages: users need NOT be joined to receive a server-sent message to the channel nor to be the sender; server-API sends bypass mute. A muted user "can read but not send" via the client SDK only. Mute persists across leave/rejoin. Ban removes the user. `needNotify:true` triggers `onParticipantMuted/onParticipantBanned` on every participant's client. [D]
- Offline participants are only evicted when new messages arrive (31st message within 30 s, or next message after 30 s); with no traffic, ghost participants stay counted. A support-ticket option "real-time removal of disconnected participants" exists. Priority senders are exempt from auto-removal. [D: https://docs.nexconn.ai/platform-chat-api/open-channel/overview.md] `participantCount` therefore over-counts in quiet periods.
- By default a user can join **one** open channel at a time (Console: Chat > Chat settings > Open Channels, "Allow participation in multiple channels"). [D: service-config.md]
- Console switches that gate features (all default OFF or unknown, check on day one): open-channel metadata service (error 23426), "Open channel message priority", "Open channel cloud retention" (history; Web error 23414), webhook endpoint + event subscriptions, "Restrict messaging to joined participants" (default off; server API unaffected), "Moderate messages sent by server API".

---

## 3. Web client SDK (`@nexconn/chat` + `@nexconn/engine` 26.2.1)

### 3.1 Packages, imports, SSR safety

- `import { ... } from '@nexconn/chat'` exposes 91 runtime exports (NCEngine, OpenChannel, DirectChannel, SystemChannel, handlers, enums, `Message`, `SendMessageParams`, `SendTextMessageParams`, `Helper`, ...). `NCResult` is a type alias of the engine's `RCResult`. [R]
- `package.json` `exports["."]`: `require -> index.cjs`, `import -> index.mjs`, `types -> index.d.ts` (types listed last). Type resolution compiled clean with `moduleResolution` bundler, node16 and node10. [R] Both packages are pre-minified single files.
- **Import is SSR-safe, initialisation is not.** In plain Node 22 (no `window`): `require('@nexconn/chat')` and `await import('@nexconn/chat')` both succeed with no side effects. But `NCEngine.initialize({appKey})` throws `window is not defined`. [R] So: never call `initialize/connect/registerCustomMessages` on the server; wrap in a client-only effect (or `typeof window !== 'undefined'` guard) and prefer a dynamic `import('@nexconn/chat')` inside the effect. Not tested inside an actual Next.js/Turbopack bundle (no Next project here) - NOT CONFIRMED that the bundler's server pass doesn't touch it.
- The engine references `window`, `localStorage` (15x), `sessionStorage` (9x), `indexedDB`, `location.protocol` inside runtime paths only. [T, grep of minified source]
- **Bundle size**: `@nexconn/chat` index.mjs 121,453 B raw (22.6 KB gzip -9); `@nexconn/engine` index.mjs 894,167 B raw (184 KB gzip -9); about 207 KB gzip total, already minified, neither package.json sets `sideEffects`, so expect no meaningful tree-shaking. Lazy-load the adapter so the landing/how-it-works pages do not pay for it. [R]
- `initialize()` is idempotent: a second call only logs a warning (`A_INIT_REPEAT_O`) and keeps the first instance, so HMR/StrictMode double calls do not throw. [T from source]
- `NCEngine.registerCustomMessages` is a **silent no-op if called before `initialize`** (the engine instance is undefined and the call is guarded). [T from source] Order: `initialize` -> `registerCustomMessages` -> add handlers -> `connect`.
- Web SDK keeps no local message storage and has no push. [D: about-message-types.md]

### 3.2 Initialise and connect

Pack assumed `connect({appKey, token, area})`. Real API is two calls. [T]

```ts
import { NCEngine, AreaCode, LogLevel } from '@nexconn/chat';

NCEngine.initialize({ appKey: APP_KEY, areaCode: AreaCode.SG, logLevel: LogLevel.WARN });
//   InitParams { appKey: string; logLevel?: LogLevel; areaCode?: AreaCode; naviServer?: string /*@hidden*/ }

const res = await NCEngine.connect({ token });   // Promise<NCResult<{ userId: string }>>
if (!res.isOk) { /* res.code, res.msg */ }
```

- `AreaCode` [R]: `BJ=1, SG=2 (default), NA=3, SA=5, OM=6`. Server data centers are Singapore / North America / Saudi Arabia; the d.ts comment on `SA` says "Regional data center (enum identifier SOUTH_AMERICA; confirm with your deployment docs)" so whether `SA` = Saudi Arabia is NOT CONFIRMED. Rule from the docs: the App Key's data center must equal the client `areaCode` and the server domains. [D: https://docs.nexconn.ai/guides/data-center.md]
- `LogLevel` [R]: `DEBUG=4, INFO=3, WARN=2, ERROR=1`.
- `NCResult<T>` (`RCResult`): `{ isOk: boolean; code: number; msg: string; data?: T }`. `isOk === (code === 0)`. [T]
- Before `initialize` (all [R] in Node): `connect()` resolves `{isOk:false, code:33001}`; `getConnectionStatus()` returns `2` (DISCONNECTED); `getCurrentUserId()` returns `""`; `getServerTimeDelta()` returns `0`; `registerCustomMessages` and `add*Handler` do not throw. Call `connect` once; the SDK reconnects itself every 5 s. [D: connection/connect.md, reconnect-kick.md]
- Register handlers (3.3, 3.7, 3.8) **before** `connect`.
- Other useful statics [T]: `NCEngine.getConnectionStatus()`, `NCEngine.getCurrentUserId()` (empty string if not connected), `NCEngine.getServerTimeDelta()` (see 3.10).

### 3.3 Connection status

```ts
import { NCEngine, ConnectionStatus, ConnectionStatusHandler } from '@nexconn/chat';

NCEngine.addConnectionStatusHandler('cp-conn', new ConnectionStatusHandler({
  onConnectionStatusChanged({ status, code }) {          // { status: ConnectionStatus; code?: number }
    const connected = status === ConnectionStatus.CONNECTED;             // 0
    const kicked = status === ConnectionStatus.DISCONNECTED && code === 31010;
  },
}));
NCEngine.removeConnectionStatusHandler('cp-conn');
```

- `ConnectionStatus` is a **numeric** enum [R]: `CONNECTED=0, CONNECTING=1, DISCONNECTED=2, SUSPENDED=3` (SUSPENDED = "connection paused, SDK will auto-reconnect after 5 s" [T]). The skills example comparing with the string `'CONNECTED'` is wrong.
- Suggested map to the pack's `'connected'|'connecting'|'disconnected'`: 0 -> connected; 1 and 3 -> connecting; 2 -> disconnected (mine, not from docs).
- Handler ids are caller-chosen strings and handlers live in a `Map` keyed by id, so registering the same id twice replaces the previous handler (read from source: `messageEventHandlers.set(id, handler)`). Registering before `initialize` does not throw. Use fixed ids and call `remove*Handler(id)` on teardown.
- Docs: a connection **error** callback ends the SDK's reconnect loop; the app must handle the code. `31010` = kicked by another device (no auto reconnect), `31004` token invalid/expired, `31005` App Key/token mismatch, `31009` user blocked. [D: reconnect-kick.md, code.md]

### 3.4 Custom message registration

```ts
import { NCEngine, type CustomMessageRegistration } from '@nexconn/chat';

const CP_TYPES: CustomMessageRegistration[] = [
  { messageType: 'CP:Idea',  isPersisted: true,  isCounted: false },
  { messageType: 'CP:Cheer', isPersisted: false, isCounted: false },
  { messageType: 'CP:State', isPersisted: true,  isCounted: false },
  { messageType: 'CP:Tally', isPersisted: false, isCounted: false, isStatusMessage: true },
];
NCEngine.registerCustomMessages(CP_TYPES);   // after initialize(), before connect()
```

`CustomMessageRegistration { messageType: string; isPersisted: boolean; isCounted: boolean; isStatusMessage?: boolean; remoteFileUrlField?: string }`. [T]

- **The docs misspell the field as `isPersited`** (https://docs.nexconn.ai/chatsdk-web/message/customize.md). The d.ts and runtime read `isPersisted`; the docs' spelling would silently become `false`. [T from source]
- `isStatusMessage: true` forces `isCounted=isPersisted=false` ("transient"). [T from source]
- Rules: do not use the `RC:` or `NC:` prefix; type string <=32 chars on the server API; must be identical on all platforms. Registering a built-in name logs a console warning. [D, T]
- How a message is defined: there is no schema. The "objectName" is the `messageType` string; the payload is whatever object you pass as `content`. Sending uses `new SendMessageParams<T>(content, 'CP:Idea')`. Received: `msg.messageType` (= objectName), `msg.content` (typed `T extends Record<string, any>`), `msg.senderUserId`. [T]
- Server-sent custom messages: `content` is a string; docs say custom content "is flexible and not limited to JSON". To land as `msg.content` object on the Web SDK, send `JSON.stringify(obj)`; **how the decoder surfaces a non-JSON string, and whether JSON content arrives parsed, were not verified live** (NOT CONFIRMED). Send JSON and expect an object.
- Unregistered types: docs say the SDK "cannot parse the message" [D: send-open-channel.md]. In the engine source an unregistered name resolves to defaults `{isCustom:true, isPersisted:false, isCounted:false}` (so it is probably still delivered, unpersisted) - inference, NOT CONFIRMED. No Console registration step is mentioned anywhere in the docs for custom types.

### 3.5 Open channel: join / leave

```ts
import { OpenChannel } from '@nexconn/chat';

const room = new OpenChannel(channelId);                         // channel must already exist (server created it)
const r = await room.enterChannel({ messageCount: 0 });          // EnterOpenChannelParams { messageCount: number; extra?: string }
//   r: NCResult<OpenChannelEnterResponseInfo>
//   { createTime, participantCount, isAllChannelMuted, isCurrentUserMuted, isCurrentChannelMuted, isCurrentChannelInAllowlist, enterTime }
await room.exitChannel();                                        // exitChannel(extra?: string): Promise<NCResult>
```

- The Web SDK **cannot create** open channels. [D: join.md] The server must call `createOpenChannel` first. Expected (not verified live) result of entering a missing channel: `isOk:false` with engine code `23410` (`RC_CHATROOM_NOT_EXIST`) plus an `onEnterFailed` callback.
- The class JSDoc example uses `result.data.memberCount`; the real field is `participantCount`. [T]
- `messageCount`: required number, allowed range NOT CONFIRMED (docs: "recent messages to fetch"; server default delivers up to 50). Whether `0` is accepted needs a live check.
- Auto behaviour [D]: after a network drop the SDK auto re-enters previously joined channels (fires `onEntered`/`onEnterFailed`); `disconnect()` exits channels automatically. Default one-channel-at-a-time (see 2.4).
- Mid-session channel death: `OpenChannelHandler.onChannelDestroyed({channelId, destroyType})` (`OpenChannelDestroyType`: `MANUAL=0, AUTO=3`). [T][R]

### 3.6 Sending

```ts
import { OpenChannel, SendMessageParams, SendTextMessageParams } from '@nexconn/chat';

// custom message (any registered type)
const p = new SendMessageParams<{ t: string; text: string }>({ t: 'idea', text: 'hi' }, 'CP:Idea');
const sent = await room.sendMessage(p);                          // Promise<NCResult<Message<T>>>
if (sent.isOk) { sent.data!.messageId; sent.data!.sentTime; }

// text message ('RC:TxtMsg'); TextMessageContent = { text: string; extra?: string; mentionedInfo?; senderUserInfo? }
await room.sendMessage(new SendTextMessageParams({ text: 'hello', extra: '{"k":1}' }));
```

- `SendMessageParams` optional fields [T]: `directedUserIds`, `disableNotification`, `disableUpdateLastMessage`, `needReceipt`, `metadata`, `pushConfig`, `onMessageInited`, `onMessageSending`. **No priority field.**
- Wire shape of text differs by side: Web `TextMessageContent` uses `text`; the server API and webhook use `{"content":"...","extra":"..."}` for `RC:TxtMsg` (engine maps `text`<->`content`). [T][D]
- Client send limit: **5 messages/second across all channels**, excess rejected; also 5 msg/s per user in open channel service config. [D: message/send.md, open-channel/service-config.md] The returned error code for this is not trustworthy from the docs (see 3.11).
- Direct messages from the client: `new DirectChannel(userId).sendMessage(...)` (not needed; receipts are server-sent).

### 3.7 Receiving

```ts
import { NCEngine, MessageHandler, ChannelType } from '@nexconn/chat';

NCEngine.addMessageHandler('cp-msg', new MessageHandler({
  onMessageReceived({ messages }) {                              // MessageReceivedEvent { messages: Message<any>[] }
    for (const m of messages) {
      const ch = m.channelIdentifier;                            // ChannelIdentifier { channelType, channelId } - NOT m.channelId
      if (ch.channelType !== ChannelType.OPEN) continue;         // OPEN=4; DIRECT=1, GROUP=3, SYSTEM=6, COMMUNITY=10
      const objectName = m.messageType;                          // 'CP:State'
      const payload = m.content as Record<string, unknown>;
      const from = m.senderUserId;  const at = m.sentTime;       // server ms timestamp
    }
  },
}));
```

- One `MessageHandler` receives **all channel types** (open, direct, system...). Filter by `channelIdentifier`. [D][T]
- **`m.channelId` and `m.channelType` are `undefined` at runtime** (docs receive.md says otherwise). Verified by constructing a `Message`: only `channelIdentifier.channelId/.channelType` exist. [R]
- Other message fields [T]: `messageId`, `sentStatus`, `direction`, `metadata: Map<string,string>`, `directedUserIds`, `isPersisted/isCounted/isStatusMessage`. Other useful handler callbacks: `onMessageBlocked({info})` (moderation interception: `BlockedMessageInfo`), `onOfflineMessageSyncCompleted`.
- A handler registered after `connect` can miss early messages; register first. Whether messages fetched by `enterChannel({messageCount})` arrive through `onMessageReceived` is NOT CONFIRMED.
- Docs advise ordering by `sentTime` (server time), not local time. There is no documented dedupe helper; dedupe on `messageId` in the adapter.

### 3.8 Open channel metadata (read / subscribe) - answers U2

```ts
import { NCEngine, OpenChannelHandler, OpenChannelMetadataOperationType } from '@nexconn/chat';

NCEngine.addOpenChannelHandler('cp-open', new OpenChannelHandler({
  onEntered({ channelId, response }) {},                         // response: OpenChannelEnterResponseInfo
  onEnterFailed({ channelId, code }) {},
  onExited({ channelId }) {},
  onMetadataChanged({ changeInfo }) {                            // OpenChannelMetadataChangeInfo[]
    for (const c of changeInfo) { c.channelId; c.key; c.value; c.operationType; }   // UPDATE=0, REMOVE=1
  },
  onMetadataSynced({ channelId }) {},                            // full metadata sync finished
  onChannelDestroyed({ channelId, destroyType }) {},
  onParticipantChanged({ channelId, participantCount, actions }) {},   // actions: { userId, action: ENTER=1|EXIT=0, extra? }[]
  onParticipantMuted({ info }) {},                               // { channelId, muteType, durationTime, operateTime, userIdList, extra }
  onParticipantBanned({ info }) {},                              // { channelId, banType: UNBAN=0|BAN=1, durationTime, operateTime, userIdList, extra }
  onNotifyMultiLoginSync({ info }) {},
}));

const all = await room.getMetadata();                            // NCResult<Record<string,string>>
const one = await room.getMetadata('cp_phase');                  // single-key result shape NOT CONFIRMED, use the no-arg form
await room.setMetadata({ metadata: {...}, deleteWhenLeft?: boolean, overwrite?: boolean });
await room.deleteMetadata({ keys: ['cp_phase'] });
```

- **Yes, clients can read and subscribe.** [T] Handler event enums [R]: `OpenChannelMetadataOperationType {UPDATE:0, REMOVE:1}`; `OpenChannelParticipantMuteType {UNMUTE_USERS:0, MUTE_USERS:1, UNMUTE_ALL:2, MUTE_ALL:3, REMOVE_ALLOW_LIST:4, ADD_ALLOW_LIST:5, UNMUTE_GLOBE:6, MUTE_GLOBE:7}`; `OpenChannelParticipantBanType {UNBAN:0, BAN:1}`. Note these differ from the webhook `operationType` values (1 set, 2 delete, 3 delete all).
- Clients can also **write** metadata, and `overwrite: true` lets them overwrite keys owned by other users (docs: default false). A malicious client could therefore forge `cp_*` keys unless the Console prevents it - no such switch found. Treat client-visible metadata as an unauthenticated hint; keep HTTP `/api` state authoritative (already the PRD design). NOT CONFIRMED whether the Console has a "server-only metadata" option.
- Whether joining a channel replays existing metadata through `onMetadataChanged` or only `onMetadataSynced` + `getMetadata()`: NOT CONFIRMED. Implementation advice: on `onMetadataSynced`, call `getMetadata()` once to seed state, then apply `onMetadataChanged` deltas.

### 3.9 History (not planned, listed for completeness)

`OpenChannel.createOpenChannelMessagesQuery({ channelId, pageSize?, isAscending?, startTime? })` -> `query.loadNextPage()` -> `NCResult<PageData<Message>>`. Needs the Open Channel cloud retention service, else error 23414. [T][D]

### 3.10 Time sync and disconnect

- `NCEngine.getServerTimeDelta(): number`. Runtime source: `connected ? Date.now() - serverTime : 0`, i.e. (local clock minus server clock) in ms, and `0` when not connected. So `serverNow ~= Date.now() - NCEngine.getServerTimeDelta()`. The d.ts text ("delay time between client and server") is vague; sign derived from the minified source. [T] The pack already ships `serverNow` in `cp.phase`, so this is optional.
- `await NCEngine.disconnect(disablePush?: boolean): Promise<void>` stops auto-reconnect and auto-exits open channels. To switch user: `disconnect()` then `connect(newToken)`. [D][T] Remove handlers with `removeMessageHandler/removeOpenChannelHandler/removeConnectionStatusHandler(id)`.

### 3.11 Doc vs types conflicts found (installed code wins)

| Topic | Doc says | Installed SDK |
|---|---|---|
| Registration key | `isPersited` (customize.md) | `isPersisted` (d.ts + runtime) |
| Received channel id | `msg.channelId`, `msg.channelType` (receive.md) | `msg.channelIdentifier.channelId/.channelType`; the flat fields are `undefined` |
| Connect result check | quickstart uses `res.code === 0` | both work; `isOk` is the documented property |
| Status values | listener.md says "numeric enum" but skill example compares to `'CONNECTED'` | numeric `0..3` |
| Class JSDoc | `result.data.memberCount` | `participantCount` |
| `ConnectionStatusHandler` JSDoc | `onConnectionStateChanged` in two examples | only `onConnectionStatusChanged` exists |
| Client error codes | `chatsdk-web/code.md`: 30003 "not in open channel", 30004 "message frequency limit", 30010 "open channel does not exist", 33007 "auto reconnect exceeded"... | Engine `ErrorCode` (value export of `@nexconn/engine`): 30003 `RC_MSG_RESP_TIMEOUT`, 30004 `RC_HTTP_SEND_FAIL`, 30010 `RC_SOCKET_NOT_CREATED`, 33007 `MSG_ROAMING_SERVICE_UNAVAILABLE`; send-too-fast is `20604` `SEND_FREQUENCY_TOO_FAST` (+ `20607`), not-in-open-channel is `23406`, channel-not-exist `23410`, history store off `23414`, metadata errors `23423..23429`, token bad `31004`, kicked `31010`, SDK not initialised `33001`. Agreeing with docs only for `0, -1, 31004, 31005, 31009, 31010, 33001`. |

Action for the adapter: branch on `isOk`, log `code` and `msg`, and import numeric names from `@nexconn/engine`'s `ErrorCode` only if a specific branch is needed; do **not** hardcode numbers from the docs' status-code page.

### 3.12 Mapping to the pack's `RealtimeClient` interface (hints only)

| Interface method | SDK calls |
|---|---|
| `connect(creds)` | `NCEngine.initialize({appKey, areaCode})` (once), register custom messages, add handlers, `NCEngine.connect({token})` |
| `joinRoom/leaveRoom` | `new OpenChannel(id).enterChannel({messageCount})` / `.exitChannel()` |
| `sendIdea/sendCheer` | `room.sendMessage(new SendMessageParams(payload, 'CP:Idea'/'CP:Cheer'))` |
| `on('state'/'tally'/'idea'/'cheer'/'moderation'/'notice'/'receipt')` | one `MessageHandler`; switch on `m.messageType`; `senderUserId` supplies `userId` |
| `on('connection')` | `ConnectionStatusHandler` |
| metadata-driven state | `OpenChannelHandler.onMetadataSynced/onMetadataChanged` + `getMetadata()` |
| moderation events | `onParticipantMuted/onParticipantBanned` (only fire if the server passed `needNotify:true`) |
| `disconnect()` | `NCEngine.disconnect()` + remove handlers |

---

## 4. Webhook (message callback)

Source of truth: https://docs.nexconn.ai/platform-chat-api/webhook/overview.md and `.../webhook/message/send.md`, `.../open-channel/operation.md`, `.../open-channel/metadata-update.md`. Configure in Console: Chat > Chat settings > Webhooks > Config (one URL, `http://` or `https://`, then choose events). Plan: post-messaging (`message:send`), pre-messaging and open-channel events are "Supported" on Free. [D: pricing-plans.md]

**Request**: `POST`, `Content-Type: application/json`, 5 s timeout, 2 retries on timeout/non-2xx (3 attempts total), any 2xx = success; 30 failed events within a minute pauses delivery to that URL for 1 minute.

**Signature headers** (note: `AppKey` here, vs `App-Key` on outbound API calls):

| Header | Meaning |
|---|---|
| `AppKey` | your App Key |
| `Nonce` | random string <=18 chars |
| `Timestamp` | Unix ms, string |
| `Signature` | `sha1(AppSecret + Nonce + Timestamp)` as lowercase hex |

Quote: "Signature = sha1(AppSecret + Nonce + Timestamp) ... Compare the result against the Signature header value. Discard requests where the values do not match." [D]

**What the signature covers: the body is NOT covered.** Only secret + nonce + timestamp. A captured valid header triple authenticates any body. Consequences for the adapter (these are my recommendations, the docs give no replay window): require `AppKey` equals ours; compare with `timingSafeEqual`; reject `Timestamp` outside a freshness window (suggest +-5 min; docs state no tolerance); optionally restrict to the published source IPs (Singapore: 52.221.93.74, 8.219.168.45, 8.219.93.148, 8.219.215.35, 8.219.43.97, 47.245.124.194, 8.222.167.17, 47.236.149.1, 8.219.217.193, 8.222.202.67, 43.156.138.254, 43.163.81.196, 43.156.239.53; North America: 52.41.206.152; Saudi Arabia: 8.213.17.80, 8.213.16.171, 8.213.28.96, 101.46.58.181, 80.238.230.175, 101.46.53.241 - from the same page); dedupe on envelope `id` and `data[0].messageId`; validate every field strictly because the payload can be forged inside the replay window. Node/Next lowercases header names (`appkey`, `nonce`, `timestamp`, `signature`). The signature check does not need the raw body (no HMAC over body).

**Envelope** (all events): `{ "type": string, "id": string /*UUID or Snowflake*/, "time": number /*ms*/, "data": [ {...} ] }`; empty/null fields are omitted; `data` is an array (currently one element).

**`message:send`** (fires after a message is accepted, any channel type; `os` can be `Server`, so messages sent by our own narrator via the server API appear too - the ingest route must ignore them):

| `data[0]` field | Type | Notes |
|---|---|---|
| `userId` | string | sender |
| `channelId` | string | open channel id (or recipient user id / group id) |
| `channelType` | number | `4` = open channel; 1 direct, 3 group, 6 system, 10 community |
| `messageType` | string | e.g. `RC:TxtMsg`, `CP:Idea` |
| `content` | **string** | the content body serialised as a string; text example: `"{\"content\":\"Hello\",\"extra\":\"\"}"`. Custom types: whatever the sender serialised |
| `time` | number | server receive time, ms |
| `messageId` | string | unique id (dedupe key) |
| `os` | string | `iOS`, `Android`, `Websocket`, `Server` |
| `profanityType` | number? | 0 none, 1 blocked, 2 replaced |
| `subchannelId`, `originalMessageId`, `groupUserIds`, `aiGenerated` | optional | community/group/AI only |

Example from the docs (message:send, group channel): `{"type":"message:send","id":"550e8400-...0007","time":1730192400000,"data":[{"userId":"user_001","channelId":"group_001","messageType":"RC:TxtMsg","content":"{\"content\":\"Hello\",\"extra\":\"\"}","channelType":3,"time":1730192400000,"messageId":"msg_xyz789","profanityType":0,"os":"iOS"}]}`.

**Other events useful to us**: `open_channel:operation` (data: `channelId, userIds[], operationType` 0 created / 1 joined / 2 left / 3 destroyed, `status` 0 active / 1 auto-exited / 2 banned / 3 auto-destroyed, `time`); `open_channel:metadata_update` (data: `channelId, key, value?, operationType` 1 set / 2 delete one / 3 delete all, `userId, time, version?` monotonic); `*:pre_messaging` is **synchronous** (see https://docs.nexconn.ai/platform-chat-api/webhook/message/pre-messaging.md): respond `{ "pass": 0|1|2, replaceContent?, ... }` within 5 s; if three attempts time out the original message is delivered unmodified.

Not documented: a replay window, a body hash, whether `message:send` fires for messages dropped under open-channel load (low priority drop), whether the webhook content for a Web-sent custom message equals the JSON passed in `content` (likely `JSON.stringify` of it, but extra SDK keys such as `user` may be added). These need a captured real delivery - NOT CONFIRMED.

---

## 5. U1-U10 answers

| # | Answer (from docs / types) | Source | Live call still needed? |
|---|---|---|---|
| U1 | Packages `@nexconn/chat` + `@nexconn/engine`, both 26.2.1, exact-pinned (peer `=26.2.1`). Init `NCEngine.initialize({appKey, areaCode?, logLevel?})`, `NCEngine.connect({token})`. Open channel client API: `new OpenChannel(id)` with `enterChannel({messageCount, extra?})`, `exitChannel(extra?)`, `sendMessage`, `getMetadata(key?)`, `setMetadata`, `deleteMetadata`; events via `OpenChannelHandler`. | `node_modules/@nexconn/chat/index.d.ts` lines 4099-4266, 1298-1458, 2891-3186; https://docs.nexconn.ai/chatsdk-web/import.md | Only for runtime behaviour (history replay, `messageCount: 0`) |
| U2 | **Yes.** Read: `OpenChannel.getMetadata(key?)`. Subscribe: `OpenChannelHandler.onMetadataChanged({changeInfo[]})` and `onMetadataSynced`. Clients can also write it (`setMetadata`, `overwrite:true` overwrites other owners' keys) so it is forgeable. | index.d.ts 4121-4131, 4228-4266, 1332-1340; https://docs.nexconn.ai/chatsdk-web/open-channel/open-channel-kv.md | Yes: confirm initial sync behaviour, delivery under load, and whether Console can restrict client writes |
| U3 | Server: <=20 keys per batch set; <=100 entries per channel; key <=128 chars of `[A-Za-z0-9+=_-]` (no `.`); value <=4096 chars; ~100 KV operations/s per channel (client + server combined); requires the metadata service enabled (code 23426) and `metadataOwnerId`. Pack's cap of 10 keys / 1000 chars / 2 writes/s is inside all limits. Dotted keys (`cp.phase`) are outside the documented charset. | https://docs.nexconn.ai/platform-chat-api/open-channel/kv-attribute/set-kv-entry-batch.md, open-channel-kv-about.md | Yes: is the service enabled, are dotted keys rejected |
| U4 | Registration is done **in client code** with `NCEngine.registerCustomMessages` (after `initialize`). Docs mention no Console registration. Server can send any non-`RC:` type <=32 chars. Docs: unregistered types "cannot be parsed". Fallback `RC:TxtMsg` is valid: server content `{"content":"...","extra":"{json}"}`, client reads `content.text` / `content.extra`. | https://docs.nexconn.ai/chatsdk-web/message/customize.md, https://docs.nexconn.ai/platform-chat-api/message/open-channel/send-open-channel.md; engine source | Yes: send an unregistered type from the server and watch `onMessageReceived` |
| U5 | Webhook on Free: post-messaging, pre-messaging and open-channel events supported. Signature `sha1(AppSecret+Nonce+Timestamp)` in headers `AppKey/Nonce/Timestamp/Signature`; **body not covered**; timestamp is ms in the `Timestamp` header and `time` in the envelope; no replay window documented. | https://docs.nexconn.ai/platform-chat-api/webhook/overview.md; pricing-plans.md | Yes: capture one real delivery (header casing, custom-type content encoding, whether server-API sends echo back with `os:"Server"`) |
| U6 | Both APIs take a `messageTypes: string[]` and the docs give a custom "like" type as the example, so custom types are intended to work. Low-priority and priority features are "Supported" on Free but need the Console toggle "Open channel message priority" (else code 1009). Limits: low-priority <=20 per app and <=5 per request; priority types <=20 per app (global); priority senders <=20 per channel. The server send API also has a per-message `priority`. | https://docs.nexconn.ai/platform-chat-api/open-channel/whitelist/add-low-priority-message-type.md, whitelist-service-about.md, add-to-user-whitelist.md | Yes: toggle state and acceptance of `CP:*` names |
| U7 | Documented as supported: a server direct message is delivered to the recipient's single `MessageHandler.onMessageReceived` regardless of whether the client opened that channel; offline recipients get it after reconnect (missed messages kept 7 days). Sender must have an access token (register `cp_narrator` via `issueAccessToken`; underscore in a userId is NOT CONFIRMED - docs say letters and numbers). System channel is the documented fallback (`ChannelType.SYSTEM=6`). | https://docs.nexconn.ai/platform-chat-api/message/send-private.md; chatsdk-web/message/receive.md; connection/disconnect.md | Yes |
| U8 | Client SDK: 5 messages/s across all channels (excess rejected). Server API: open-channel send 100 msgs/s (counted per target channel), direct 6000/min, system 100/s, metadata 100 KV ops/s/channel, most others 100/s. The 1 idea / 2 s app rule is well inside the client limit. | https://docs.nexconn.ai/chatsdk-web/message/send.md; .../prepare-to-use-api/chat-server-api-list.md | No (rate numbers are documented), but the returned error code for client rate-limit must be seen live |
| U9 | Default: destroyed after 60 min inactivity. `createOpenChannel`/`setOpenChannelDestroyType` accept `destroyType 0` (inactivity) or `1` (from creation) with `ttlMinutes` 60..10080 (7 days max). Any join/leave/message resets the inactivity timer. Never-auto-destroy "keep-alive" channels exist but have no public API. Creating an existing id returns business code 23435; missing channel 23410, so `ensureChannel()` = try `getOpenChannel`, create on 23410, tolerate 23435. Free plan allows 50 concurrent channels. | https://docs.nexconn.ai/platform-chat-api/open-channel/destroy-about.md, create.md, set-destroy-type.md, code.md | Yes (confirm 7-day TTL is accepted on Free, and 23435 surfaces as HTTP 200 vs 409) |
| U10 | Translation: built in (`NCEngine.translateModule`, `TranslateHandler`), billed separately, Free plan 10,000 characters then needs a bound card. Moderation: profanity filter built in (<=50 words, ~15 min latency, block or replace), Automatic moderation (separately billed, needs a payment method, first 10k text checks free), pre-messaging webhook (sync allow/modify/block, Free and Pro). Server-API messages are only filtered if the Console option is on. | https://docs.nexconn.ai/chatsdk-web/builtin-translation/overview.md; pricing-plans.md; https://docs.nexconn.ai/platform-chat-api/moderation/batch-add-sensitive-word.md; webhook/message/pre-messaging.md | No for the decision (keep optional, LLM covers both) |

---

## 6. Gotchas

1. **Server SDK has no `dist/`** when installed from git (section 1.2) and needs `onlyBuiltDependencies`. Biggest blocker; fix before anything else.
2. Server SDK is CJS main (`dist/index.js`) plus an unreferenced `dist/esm`; Node ESM named imports work. [R] Node >=14; this machine runs 22.17.1.
3. API domains must be full `https://` URLs.
4. The SDK does not throw on HTTP-200 business errors; check `data.code`.
5. **Free plan connection caps** (public docs): Free = 2,000 MAU and PCC allowance = 5% of the MAU tier = 100 connections; exceeding makes **new connections unavailable** (no overage on Free). The pack's "Chat Growth Credit: 10K MAU, 500 PCC" is consistent with 5% of 10K, but 500 PCC is **not stated** on the campaign page I could read (it states 10K MAU, full Pro features, 10 GB storage, eligible only outside Mainland China, one app per organisation, "complete SDK integration and send one message"). 500 PCC is NOT CONFIRMED; plan for a hard cap on joins.
6. Free: 50 concurrent open channels, message size 15K characters (server doc says content <=10 KB for open-channel sends while the SDK type comment says 128 KB: stay far below, the pack's 2 KB is fine).
7. Default setting: one open channel per user; the server can send to channels users have not joined; "restrict messaging to joined participants" default off.
8. Web SDK: no local storage, no push, no history without the retention service. The server archive in Postgres (via webhook or HTTP dual-post) is the only record.
9. `registerCustomMessages` before `initialize` silently does nothing; `initialize` throws in Node; second `initialize` only warns.
10. Web console security: "Domain allowlist for Web clients" exists on all plans (pricing table). If enabled, localhost and the deploy origin must be added. Default state NOT CONFIRMED.
11. Webhook headers are `AppKey`, `Nonce`, `Timestamp`, `Signature`; API request headers are `App-Key`, `Nonce`, `Timestamp`, `Signature`. Easy to mix up.
12. Metadata and mute/ban/priority-sender APIs are **per channel** (priority types and low-priority types are per app). Ban/mute durations are mandatory and capped at 43,200 minutes (30 days).
13. `participantCount`/`total` over-counts idle rooms because offline users are evicted lazily.
14. `message:send` webhook also reports server-sent messages (`os:"Server"`): filter by `userId === 'cp_narrator'` or by `os`.
15. `userId`: "letters and numbers, max 64 bytes" per docs, yet docs examples use `_` and `-`. Test `cp_narrator`; fallback `cpnarrator`.
16. Docs' client status-code table conflicts with the engine's `ErrorCode` (section 3.11).
17. Dependencies: `pnpm audit --prod` on the probe reported no known vulnerabilities (2026-11-17).

---

## 7. NOT CONFIRMED (needs a live call or Console)

1. Whether `.` in metadata keys is rejected (docs charset excludes it).
2. Whether the metadata service, "Open channel message priority", webhooks, and cloud retention are enabled on this app; whether Console can stop clients writing metadata.
3. Behaviour of an unregistered custom type on the Web client; how server-sent custom `content` (JSON string) surfaces in `msg.content`; whether Web-sent custom content is exactly `JSON.stringify(content)` on the wire/webhook.
4. Whether `enterChannel({messageCount: 0})` is valid; whether join replays metadata through `onMetadataChanged`; whether history from `enterChannel` arrives via `onMessageReceived`.
5. Server business errors: HTTP 200 + `code` vs HTTP 4xx (only code semantics are documented); what a duplicate `createOpenChannel` (23435) looks like on the wire.
6. `AreaCode.SA` = Saudi Arabia? (d.ts comment says South America).
7. 500 PCC under Chat Growth Credit (derived only); Free-plan 100 PCC if the campaign is not applied.
8. `userId` with `_` (`cp_narrator`); open channel id charset.
9. Webhook: replay window, header casing as delivered, whether low-priority-dropped messages still emit `message:send`.
10. Which user id metadata-change notifications are attributed to for the priority protection rule; whether a 7-day `ttlMinutes` is accepted on the Free plan.
11. Next.js/Turbopack server-pass behaviour when importing `@nexconn/chat` (Node import is proven safe; bundled behaviour is not).
12. The server SDK postinstall workaround on Vercel/CI.

---

## 8. Local verification artifacts (scratch, safe to delete)

`H:\ClaudeData\Temp-claude\nexconn-probe\`: `package.json` (installed set), `snippets-check.ts` + `tsconfig*.json` (all snippets in this file compile under `--strict`), `mock-server-test.cjs` (server SDK wire test), `ssr-test.{cjs,mjs}` (Node import/initialize test), `esm-server-test.mjs`, `map-endpoints.js` / `print-types2.js` (method->path and interface dumpers), `docs\` (every doc page quoted, `llms.txt`, skills repo tree and the React example). `H:\ClaudeData\Temp-claude\nexconn-probe-b\` holds the tested postinstall script.
