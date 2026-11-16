# CROWDPLAY — Nexconn Integration Guide

Nexconn Chat is the real-time backbone. This file says exactly which Nexconn features are used, how, what is verified, and what to do when reality differs from this document.

## 0. Ground rules for the build agent

1. **Install the official Skill first and follow it:**
   `npx skills add https://github.com/NexconnAI-Dev/nexconn-skills.git --skill nexconn-chat`
   Then also read `https://docs.nexconn.ai/llms.txt` and the Web Chat SDK section, and the example in the skills repo (`example/web`).
2. **The installed packages are the truth.** Before writing adapter code, read the type definitions in `node_modules/@nexconn/*` and the server SDK's `docs/*.md`. If a name in this file differs from the installed SDK, the SDK wins — change only the adapter files.
3. All Nexconn imports live in `src/lib/realtime/nexconn.server.ts` and `src/lib/realtime/nexconn.client.ts`. Nothing else.
4. App Secret, signing and token issuing are server-only.
5. Never invent an API. If something cannot be confirmed from the SDK types or docs, implement the documented fallback below and record it in `docs/NEXCONN_FINDINGS.md`.

## 1. Verified facts (as of 15 Nov 2026)

### Server SDK (verified from the repo README)
- Package: `@nexconn/server-sdk` v0.1.2. Install:
  `pnpm add "git+https://github.com/NexconnAI-Dev/nexconn-server-sdk-node.git#v0.1.2"`
- Setup:
```ts
import { Configuration, UserManagementApi } from '@nexconn/server-sdk';
const configuration = new Configuration();
configuration.setNexconnCredentials(APP_KEY, APP_SECRET);
configuration.setPrimaryBackupDomains(PRIMARY_API_DOMAIN, SECONDARY_API_DOMAIN); // required, no default
const { data } = await new UserManagementApi(configuration).issueAccessToken({ userId, name, avatarUrl });
```
- Errors: typed `ApiException` subclasses (`TooManyRequestsException`, `ConflictException`, …) with `errorCode`, `errorMessage`.
- Endpoints used by CROWDPLAY (class → method → path):

| Need | Class.method | Path |
|---|---|---|
| Register user / token | `UserManagementApi.issueAccessToken` | `/v4/auth/access-token/issue` |
| Create room channel | `OpenChannelManagementApi.createOpenChannel` | `/v4/open-channel/create` |
| Keep channel alive | `OpenChannelManagementApi.setOpenChannelDestroyType` | `/v4/open-channel/destroy-type/set` |
| Destroy on end | `OpenChannelManagementApi.destroyOpenChannels` | `/v4/open-channel/destroy` |
| Send state/outcome/bot messages | `MessageManagementApi.sendOpenChannelMessage` | `/v4/open-channel/message/send` |
| Shared state | `OpenChannelMetadataApi.batchSetOpenChannelMetadata` / `batchGetOpenChannelMetadata` / `batchRemoveOpenChannelMetadata` | `/v4/open-channel/metadata/batch/{set,get,remove}` |
| Ideas/cheers droppable under load | `OpenChannelMessagePriorityApi.addOpenChannelLowPriorityMessageTypeList` | `/v4/open-channel/low-priority-message-type-list/add` |
| State never dropped | `OpenChannelPriorityControlsApi.addOpenChannelPriorityMessageTypeList` | `/v4/open-channel/priority-message-type-list/add` |
| Narrator never dropped | `OpenChannelPriorityControlsApi.addOpenChannelPrioritySenderList` | `/v4/open-channel/priority-sender-list/add` |
| Receipts | `MessageManagementApi.sendDirectChannelMessage` | `/v4/direct-channel/message/send` |
| Receipt fallback | `SystemMessagesApi.sendSystemChannelMessage` | `/v4/system-channel/message/send` |
| Mute / ban | `OpenChannelParticipantsModerationApi.addOpenChannelParticipantMuteList` / `addOpenChannelParticipantBanList` | `/v4/open-channel/participant/{mute-list,ban-list}/add` |
| Player count | `OpenChannelParticipantsModerationApi.listOpenChannelParticipants` | `/v4/open-channel/participant/list` |
| Profanity list | `ModerationApi.batchAddProfanityWords` | `/v4/profanity-word/batch/add` |

### Client (verified from a public competitor project and Nexconn docs snippets)
- Web Chat SDK connects with `NCEngine.connect` using App Key + server-issued token + area/data-center code.
- Custom message types are registered with `registerCustomMessages`.
- Connection changes via a `ConnectionStatusHandler`.
- Text messages are `RC:TxtMsg` with an `extra` field.
- Open Channels: unlimited participants, **no push**, **messages are not stored by the SDK** → the server must archive (we do, in Postgres).
- Chat UI Web does not cover Open Channels → we build our own UI on the raw SDK.

### Plan limits (verified from Nexconn press/marketing)
- Free Chat Plan ("Chat Growth Credit"): Pro features, 10K MAU, **500 peak concurrent connections**, 10 GB storage. The app must be enrolled in the campaign and must have sent one message.

## 2. Unverified — verify in the first hour, then record in `docs/NEXCONN_FINDINGS.md`

| # | Question | If NO / different → fallback |
|---|---|---|
| U1 | Exact Web SDK package names and Open Channel client APIs (join, send, receive, metadata get + change listener) | Use what the installed types expose; adjust `nexconn.client.ts` only |
| U2 | Can clients **read/subscribe** to Open Channel metadata on Web? | Rely on `CP:State` / `CP:Tally` messages (already designed) and still write metadata from the server for late joiners via server → HTTP state |
| U3 | Metadata limits (keys, value size, write rate) | Keep ≤10 keys, values ≤1,000 chars, ≤2 writes/s. If value size is smaller: split `cp.options` per slot |
| U4 | Do server-sent custom `objectName`s deliver to Web clients without console registration? | Send as `RC:TxtMsg` with JSON in `extra` and `content` = human-readable line; adapter decodes |
| U5 | Message webhook available on the free plan? Signature scheme? Does it cover the body? | `INGEST_MODE=post` (HTTP path only). If signature excludes the body, keep strict server-side validation (already required) |
| U6 | Low-priority / priority message type APIs accept custom types on the free plan | Skip silently; log finding. Not load-bearing below 200 msgs/s |
| U7 | Direct Channel message from a server "bot" user reaches a Web client that never opened that channel | Use System Channel message; else in-app receipt via `/api/me` poll (already built) |
| U8 | Client send rate limit per user | We already limit to 1 idea / 2 s |
| U9 | Open Channel auto-destroy when idle | Call `setOpenChannelDestroyType` to the longest option; recreate on demand in `ensureChannel()` |
| U10 | Built-in translation and moderation toggles | Optional. LLM handles both if absent |

## 3. Adapter interfaces (`src/lib/realtime/types.ts`)

```ts
export interface RealtimeServer {
  ensureUser(u: { id: string; name: string }): Promise<{ token: string }>;
  ensureChannel(channelId: string, name: string): Promise<void>;
  configurePriorities(): Promise<void>;                       // idempotent, safe to fail
  publishState(channelId: string, state: PublicState, opts: { phaseChanged: boolean }): Promise<void>;
  publishTally(channelId: string, v: number, tally: Record<string, number>, total: number): Promise<void>;
  sendRoomMessage(channelId: string, fromUserId: string, msg: RoomMessage): Promise<void>;
  sendReceipt(toUserId: string, receipt: ReceiptPayload): Promise<boolean>;
  moderate(channelId: string, userId: string, action: 'mute' | 'ban' | 'unmute' | 'unban'): Promise<void>;
  countParticipants(channelId: string): Promise<number | null>;
  verifyWebhook(req: Request, rawBody: string): Promise<IncomingMessage[] | null>;
  destroyChannel(channelId: string): Promise<void>;
}

export interface RealtimeClient {
  connect(creds: { appKey: string; token: string; area?: string }): Promise<void>;
  joinRoom(channelId: string): Promise<void>;
  leaveRoom(channelId: string): Promise<void>;
  sendIdea(channelId: string, p: IdeaPayload): Promise<void>;
  sendCheer(channelId: string, emoji: string): Promise<void>;
  on(ev: 'state', cb: (s: PublicState) => void): Unsub;
  on(ev: 'tally', cb: (t: TallyPayload) => void): Unsub;
  on(ev: 'idea', cb: (i: IdeaPayload & { userId: string }) => void): Unsub;
  on(ev: 'cheer' | 'moderation' | 'receipt' | 'notice', cb: (p: any) => void): Unsub;
  on(ev: 'connection', cb: (s: 'connected' | 'connecting' | 'disconnected') => void): Unsub;
  disconnect(): Promise<void>;
}
```
The mock implementations mirror these exactly (server keeps an in-memory bus; client uses `EventSource('/api/mock/stream?room=…&user=…')` and `fetch` for sends).

## 4. Message types

All payloads are JSON, ≤2 KB, with field `t` (type) and `v` where relevant. Registered on the client with `registerCustomMessages`. Object names:

| objectName | Direction | Priority | Payload |
|---|---|---|---|
| `CP:Idea` | player → room | **low** | `{t:'idea', roundId, text, clientMsgId, name, isBot?}` |
| `CP:Cheer` | player → room | **low** | `{t:'cheer', emoji}` |
| `CP:State` | narrator → room | **priority** | `PublicState` (on phase change) |
| `CP:Tally` | narrator → room | normal | `{t:'tally', v, roundNo, tally, total}` (≤2/s) |
| `CP:Moderation` | narrator → room | priority | `{t:'mod', hideIdeaIds?: string[], notice?: string}` |
| `CP:Notice` | narrator → room | normal | `{t:'notice', text}` |
| `CP:Receipt` | narrator → user (Direct) | — | `{t:'receipt', type:'BALLOT'|'CANON', showId, roundNo, optionLabel, ideaText}` |

The narrator user id is `cp_narrator`; add it to the priority sender list.

## 5. Open Channel metadata keys

Written by the server only. Each value is a JSON string.

| Key | Content | Written when |
|---|---|---|
| `cp.phase` | `{v, phase, roundNo, roundsTotal, phaseStartedAt, phaseEndsAt, serverNow, paused, showId, title}` | every phase change |
| `cp.prompt` | `{v, title, text}` | PROMPT |
| `cp.options` | `{v, options:[…]}` | DISTILL done / veto / reroll |
| `cp.tally` | `{v, tally, total}` | ≤2/s during VOTE |
| `cp.outcome` | `{v, optionId, narration, credit, more, ttsUrl}` | REVEAL (+ update when narration arrives) |
| `cp.stats` | `{v, players, ideasThisRound, ideasTotal, canonMakers}` | every 2 s when changed |
| `cp.story` | `{v, beats:[…3]}` | REVEAL |

Client assembles `PublicState` from keys; any key with a lower `v` than already seen is ignored. A full `PublicState` from `CP:State` or HTTP always wins if its `v` is higher.

## 6. Flows

**Join:** `POST /api/session` → server `ensureUser` → token → client `connect` → `POST /join` (returns state) → `joinRoom` → subscribe.
**Idea:** client `sendIdea` (Nexconn) + HTTP dual-post → server ingest → other clients render from the Nexconn message directly.
**Phase change:** engine commit → `publishState` (metadata batch set + `CP:State`).
**Vote:** HTTP `POST /vote` (secret ballot, authoritative) → tally coalescer → `publishTally` (metadata + `CP:Tally`).
**Receipt:** `sendReceipt` (Direct) → gold toast; stored in DB regardless.
**Ban:** DB flag + `moderate('ban')` + `CP:Moderation` to hide their ideas.

Why votes use HTTP: ballots must be secret, deduplicated and authoritative; broadcasting 300 vote messages adds noise without value. Everything players *see* still arrives through Nexconn.

## 7. Feature → Nexconn table (use on `/how-it-works` and in the write-up)

| Feature | Nexconn capability |
|---|---|
| Zero-signup join | Server API token issue + Web Chat SDK connect |
| The live room | Open Channel (unlimited participants, online-only) |
| Idea storm | Custom message `CP:Idea`, marked low priority |
| Everyone sees the same phase and countdown | Open Channel metadata + priority `CP:State` |
| Live vote bars | Open Channel metadata `cp.tally` + `CP:Tally` |
| Narrator and bots | Server-sent Open Channel messages from registered bot users; priority sender list |
| "Your idea became canon" | Direct Channel message `CP:Receipt` |
| Moderation | Open Channel mute/ban lists, profanity word list |
| Server learns about messages | Message webhook (signature-checked, deduplicated) |
| Reconnect banner | Connection status handler |

## 8. Console checklist for the human (first hour)

1. Create the app; confirm it is on **Chat Growth Credit** (not only the one-month default). Send one message.
2. Copy App Key, App Secret, API domains (primary + backup), SDK area/data-center code into `.env`.
3. Webhooks: enable message events → `https://<deploy>/api/nexconn/webhook`. Note the signature docs.
4. Check Open Channel settings: auto-destroy, metadata.
5. Check whether custom message types need registration in the console.
6. Run `pnpm smoke:nexconn` and read `docs/NEXCONN_FINDINGS.md`.
