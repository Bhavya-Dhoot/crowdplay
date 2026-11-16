# CROWDPLAY — Product Requirements Document

**Version:** 1.0 · **Date:** 15 Nov 2026 · **Owner:** BD (team "chammak")
**Event:** Nexconn Build Challenge 2026 (Reskilll) · **Track:** Gaming & Live Streams
**Hard deadline:** 22 Nov 2026 23:59 AoE = 23 Nov 2026 15:59 GST. Internal target: submit 21 Nov.

> Companion files: `TECH_SPEC.md` (architecture, data, APIs), `NEXCONN_INTEGRATION.md`, `AI_PROMPTS.md`, `UX_SPEC.md`, `BUILD_PLAN.md`, `GOAL.md` (definition of done), `CLAUDE.md` (agent rules), `SUBMISSION_KIT.md`, `KICKOFF_PROMPT.md`, `env.example`.
> If two files disagree: `GOAL.md` > `TECH_SPEC.md` > `PRD.md` > others.

---

## 1. One-liner

**The audience writes the show.** A live room where everyone types anything at once; within seconds AI turns the chat storm into three choices written by the crowd (one is always the best *minority* idea); the room votes; the story goes that way; and the people whose ideas were used are credited by name on screen and on their own phone.

## 2. Problem

- In any live room above ~50 people, chat stops being a conversation. Messages scroll past unread. Research on 1.28 billion Twitch messages (Nematzadeh et al., Royal Society Open Science, 2019) shows per-person participation *falls* as the crowd grows.
- Today's fixes silence the crowd: slow mode, emote-only mode, or polls where **the host writes the options**.
- Result: audiences spectate. Hosts cannot use what the room is saying. The quiet person with the best idea is never heard.

## 3. Solution

A repeating 60–90 second loop, run entirely inside a Nexconn Open Channel:

| # | Phase | Duration (default) | What happens |
|---|---|---|---|
| 1 | **PROMPT** | 6 s | Narrator sets the scene and asks "What happens next?" |
| 2 | **STORM** | 30 s | Everyone types ideas (≤140 chars). Ideas rain on the big screen. |
| 3 | **DISTILL** | ≤8 s | AI groups the storm and writes 3 options: two "crowd" options and one **wildcard** from a small group or single person. |
| 4 | **VOTE** | 12 s | One tap per person. Live bars. |
| 5 | **REVEAL** | 12 s | Narrator tells what happens, naming contributors ("@priya + 23 others"). Credited phones get a receipt. |
| 6 | next round or **FINALE** | — | After N rounds: full story recap, credits roll, shareable page. |

### Why this is new (after prior-art check)
- Twitch/YouTube polls: host-written options, no free text, no attribution.
- Remesh / Slido / Jigsaw Sensemaker: cluster crowd text for *analysis*, not live co-creation; no minority slot; no personal receipt.
- CROWDPLAY's three inventions: **crowd-written options in seconds**, a **guaranteed minority slot**, and **personal attribution receipts**.

## 4. Judging alignment (published rubric)

| Criterion | Weight | How CROWDPLAY scores |
|---|---|---|
| Completeness & UX — "does it work from start to end and is easy to use" | 50% | Zero-signup join by QR; one loop; Judge Mode works solo in 60 s; every phase has loading, empty and error states; mobile-first. |
| Innovation & scenario value — "new idea that solves a real communication problem" | 30% | Makes large live chat participatory; minority slot + receipts are novel. |
| Business & growth — "real users on Nexconn and a path to a product" | 20% | Real sessions on our App Key, `/impact` page with real numbers, creator-SaaS path. |
| Bonus: traction proof | — | 3+ live sessions with real people; counts and screenshots. |

**Honesty rule (non-negotiable):** never claim scale we did not run. Bots are always labelled 🤖 and excluded from traction numbers.

## 5. Goals and non-goals

### Goals
- G1. A stranger can go from QR scan to typing an idea in **≤15 seconds**, no signup.
- G2. Storm-close → options on every screen in **≤8 s p95** (target 6 s).
- G3. A full 6-round show runs unattended (auto-advance) without a single manual fix.
- G4. Every credited participant receives a receipt within 3 s of REVEAL.
- G5. A judge alone on one device can experience a complete round in under 90 s (`/try`).
- G6. Nexconn is the only real-time transport in production mode. All live state reaches clients through Nexconn (Open Channel messages + Open Channel metadata).

### Non-goals (v1)
- Video/audio streaming (hosts use their own stream; we provide an overlay).
- Call SDK stage, payments, accounts with passwords, native mobile apps.
- Claims of 10,000-person rooms. We say: "Open Channels are unlimited; we ran it with N real people."

## 6. Users and personas

| Persona | Need | Key screen |
|---|---|---|
| **Player** (audience member on a phone) | Join instantly, be heard, see credit | `/play/:code` |
| **Host** (streamer, GM, MC, teacher) | Start a show, keep it safe, keep pace | `/host/:code` |
| **Viewer** (watching the stream/projector) | Understand what's happening in 5 s | `/screen/:code` |
| **Judge** (alone, 3 minutes) | See the magic without a crowd | `/try` |

## 7. User stories and acceptance criteria

### Player
- P1. As a player I open a link/QR, type a display name, and I'm in. **AC:** no email/phone; name 2–20 chars; profanity-checked; duplicate names get a suffix.
- P2. During STORM I can send ideas. **AC:** ≤140 chars; max 1 idea per 2 s; my idea appears in my feed instantly (optimistic) and on the big screen; clear error if blocked.
- P3. I see the countdown for every phase, synced to the server clock (±300 ms).
- P4. During VOTE I see 3 options and tap one. **AC:** one vote per round; I can change it until the timer ends; my choice is highlighted; bars update live.
- P5. If my idea fed an option I see "✨ Your idea is on the ballot". If that option wins: "🏆 Your idea became canon" + receipt in `/me`.
- P6. If I join mid-round I get the current phase, prompt, options and story so far within 2 s.
- P7. If my connection drops I see a reconnect banner and resume without reloading.
- P8. I can send quick emoji cheers at any time (rate-limited, never block the UI).

### Host
- H1. Create a show: title, premise (preset or custom), rounds (3–10), timings, auto-advance on/off. **AC:** returns room code, join link, QR, secret host link.
- H2. Start show, start next round, pause/resume, end show.
- H3. During STORM: `+10 s`, `End storm now`.
- H4. During VOTE: **veto** an option (replaced by next best candidate within 3 s), **re-roll** all options once, **force winner**.
- H5. Moderation: mute or ban a user; delete an idea from the screen; toggle "strict filter".
- H6. See live counters: connected players, ideas this round, distill latency.
- H7. If AI fails, the round still completes (fallback options); host sees a small warning, players see nothing broken.

### Viewer / overlay
- V1. `/screen/:code` shows: QR + code, prompt, idea rain, countdown, options with live bars, outcome text with credits, story-so-far strip.
- V2. `?obs=1` gives a transparent-background overlay sized 1920×1080 for OBS.
- V3. Optional narrator voice (TTS) plays on the screen page.

### Judge
- J1. `/try` creates a private room with 30 labelled bot players and starts a 3-round show automatically after I enter a name. **AC:** I can type an idea, see it compete, vote, and get a receipt. Bots are marked 🤖 everywhere. A banner says "Demo room — bots are simulated. Live sessions use real people."
- J2. `/how-it-works` shows the loop, an architecture diagram and a **Feature → Nexconn** table.
- J3. `/impact` shows real usage (bots excluded).

## 8. Feature list

### 8.1 Spine (must be flawless)
1. Guest session + Nexconn token (server-issued).
2. Open Channel per show; join/leave; connection status.
3. Round state machine on the server; state published via Open Channel metadata + priority state messages.
4. Idea ingestion (Nexconn message → webhook; HTTP dual-post fallback; dedupe).
5. Distiller (embeddings + LLM) with strict JSON, validation, and two fallbacks.
6. Voting + live tallies.
7. Narration + credits.
8. Personal receipts via Direct Channel + in-app.
9. Host console.
10. Big-screen overlay.
11. Judge Mode with labelled bots.
12. Safety: profanity filter, LLM safety flags, rate limits, host veto, mute/ban.

### 8.2 Depth (build after the spine passes `GOAL.md` §A–D)
13. Finale: story recap, credits roll, share image, `/story/:showId`.
14. `/impact`, `/how-it-works`, `/me`.
15. Narrator voice (TTS) on `/screen`.
16. Show presets: Heist, Fantasy Quest, Space Mission, Murder Mystery, Classroom "What if?", Custom.
17. Contributor leaderboard per show ("canon makers").
18. Emoji cheers (low-priority messages).
19. Multilingual mode (flag `FEATURE_MULTILINGUAL`): players write in any language; options and narration shown in each player's language.
20. Admin export (CSV) behind `ADMIN_TOKEN`.

### 8.3 Explicitly out
Call SDK stage, user accounts, monetisation, native apps, persistent communities.

## 9. Functional requirements (numbered, testable)

**Sessions**
- FR-1 `POST /api/session` creates a guest, issues a Nexconn access token, sets an httpOnly signed cookie.
- FR-2 App Secret never reaches the browser. Build fails the check if the secret string appears in client bundles.

**Rooms and shows**
- FR-3 Room code: 5 uppercase letters, no ambiguous chars (no O/0/I/1).
- FR-4 One Nexconn Open Channel per room, id `cp_<code>`.
- FR-5 Host key is a 32-char secret, stored hashed.

**Round engine**
- FR-6 Phases: `LOBBY → PROMPT → STORM → DISTILL → VOTE → REVEAL → (PROMPT | FINALE) → ENDED`. `PAUSED` can wrap any timed phase.
- FR-7 Engine is deadline-driven and idempotent: `advance(roomId)` may be called any number of times by any trigger and produces exactly one transition per deadline.
- FR-8 Every state change increments a monotonic version `v`; clients ignore lower versions.
- FR-9 Engine state survives a server restart (persisted in the database).

**Ideas**
- FR-10 Accepted only in STORM of the current round; ≤140 chars after trim; rate limit 1 per 2 s and 12 per round per user.
- FR-11 Deduplicated by `(userId, clientMsgId)` across webhook and HTTP paths.
- FR-12 Blocked ideas (filter/ban) never reach the distiller or the screen.

**Distiller**
- FR-13 Output exactly 3 options: 2 `crowd` + 1 `wildcard`. Each ≤70 chars, mutually distinct, safe.
- FR-14 Each option lists source idea IDs that exist in this round. Server recomputes supporters and contributors from those IDs; LLM-provided counts are ignored.
- FR-15 Wildcard source must be a cluster with ≤15% of this round's ideas (or the smallest cluster if none qualifies) and must not duplicate a crowd option.
- FR-16 With 0 ideas: three narrator-written options, no credits. With 1–2 ideas: use them, fill the rest with narrator options marked `kind: "narrator"`.
- FR-17 Fallback chain: primary LLM → secondary provider → heuristic (cluster representatives). Total budget 8 s, then heuristic.

**Voting**
- FR-18 One vote per user per round; last write wins until deadline; votes after deadline rejected.
- FR-19 Tallies published at most every 500 ms.
- FR-20 Tie-break: the option with the earliest first supporting idea wins; logged.

**Narration and credits**
- FR-21 Narration ≤90 words, continues the story, names up to 3 contributors, then "+N others".
- FR-22 Story memory: premise + running summary (≤1,200 chars) + last 2 narrations go into each prompt.

**Receipts**
- FR-23 Types: `BALLOT` (your idea is on the ballot), `CANON` (your idea won). Sent as Direct Channel message from the bot user and stored for `/me`.

**Safety**
- FR-24 Three layers before anything is shown on `/screen`: local blocklist + Nexconn profanity list → LLM safety flags in the distiller → host veto.
- FR-25 Ban = server-side block + Nexconn open-channel ban/mute.

**Judge Mode**
- FR-26 Bots send real Nexconn messages through the Server API as bot users; `is_bot = true`; excluded from `/impact`.

**Observability**
- FR-27 Per round, record: ideas count, unique contributors, distill ms, provider used, fallback used, votes, winner.

## 10. Non-functional requirements

| Area | Requirement |
|---|---|
| Latency | Idea → big screen ≤1 s p95. STORM end → options ≤8 s p95. Vote → bar update ≤1 s. |
| Capacity | Designed for 500 concurrent (free-plan cap). Load-tested with 300 simulated senders. |
| Reliability | No single external failure (LLM, embeddings, TTS, webhook) may stall a round. |
| Mobile | Works at 360 px width; touch targets ≥44 px; keyboard does not cover the input. |
| Accessibility | Contrast AA; reduced-motion respected; screen-reader live regions for phase changes. |
| Security | Secrets server-only; signed cookies; webhook signature + timestamp check; input validation with zod; rate limits per IP and user. |
| Privacy | No email/phone. Display name only. "Delete my data" in `/me`. |
| Cost | Not a constraint. Still cap LLM calls per round (≤4) to protect latency. |

## 11. Success metrics

- Demo: 3 real public sessions, ≥30 real people each (target 100+ in one).
- ≥70% of joiners submit at least one idea.
- ≥25% of participants receive at least one receipt per show.
- p95 distill ≤8 s across all recorded rounds.
- Zero stalled rounds in recorded sessions.

## 12. Business and growth (for the write-up)

- **Who pays:** streamers, tabletop GMs, event MCs, teachers, community managers.
- **Model:** free up to 50 players; Creator $12/mo (500 players, OBS overlay, voice); Events $99/event (branding, export, multilingual).
- **Why Nexconn:** every paid show adds MAU and concurrent connections on Nexconn; Open Channels + metadata + priority controls are exactly what the product needs.
- **Wedges:** Discord community nights, D&D streams, college fests, classroom "what if" lessons.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Webhook unavailable/slow on free plan | HTTP dual-post ingestion; `INGEST_MODE` switch |
| Open Channel metadata limits lower than assumed | Values kept <1 KB; ≤10 keys; mirror via `CP:State` messages; HTTP poll fallback |
| LLM latency spikes | Fast model, capped input, streaming-free JSON, heuristic fallback at 8 s |
| Offensive option reaches screen | 3 safety layers; host veto; "strict" default ON in public rooms |
| Not enough real users | Schedule sessions now (see `SUBMISSION_KIT.md` §5); Judge Mode as honest backup |
| Web push absent | In-app receipts + Direct Channel message; no dependency on push |
| Client SDK API names differ from this spec | All Nexconn calls isolated in two adapter files; verify against installed type definitions |

## 14. Release checklist

See `GOAL.md`. Submission assets in `SUBMISSION_KIT.md`.
