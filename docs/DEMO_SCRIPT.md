# CrowdPlay demo video: shot list and voice-over

Target: **3:00 maximum** (edit to 2:50 to leave margin). Public or unlisted link that plays logged out.
Fields in `<angle brackets>` are filled by whoever records.

## Rules (read first)

1. **Real numbers only.** Every number you say must be visible on screen in the same shot (the players counter, the host console's distill time, `/impact`). If a number is not on screen, do not say it.
2. **Label bot footage.** Anything recorded in `/try` is simulated players. Its banner ("Demo room — 30 🤖 simulated players. Live shows use real people.") must stay visible in every `/try` shot, and the voice-over must say the crowd is bots in the first `/try` segment. Never call bot footage "a real session".
3. **Capture the receipt on a real phone.** The full-screen "Your idea became canon" moment (yellow pen loop, CANON ribbon, doodle confetti) lasts 2.5 s: the phone's screen recording must already be running before the VOTE phase.
4. **Do not stage the win.** The host console has **Force win**. Do not use it to manufacture the receipt shot. If you do, say so in the voice-over and caption it ("host forced this result for the recording").
5. **Say "runs on Nexconn" only for footage from a deployment where `/api/health` shows `"realtimeMode":"nexconn"`.** Footage from a local mock-mode run cannot back that line.
6. **Never show the host URL.** `/host/<CODE>?k=...` carries the secret host key. Record the host console full screen (F11) or crop the address bar, and end that show afterwards.
7. **Consent.** Anyone whose name or face appears has agreed. Display names appear on the big screen and in credits; ask players to pick nicknames they are happy to show.
8. **A rehearsal with teammates is a real show** and will appear on `/impact`. Describe it as what it was in the write-up; do not present it as public traction.

## Which plan

| Plan | When | Crowd |
|---|---|---|
| **A: live crowd** | You can get at least a handful of real people on phones for ~10 minutes | Real people. The on-screen counter is the truth; say that number, whatever it is. |
| **B: `/try` fallback** | No crowd available, or a live take fails | 30 labelled bots. See [Fallback plan](#fallback-plan-if-a-live-crowd-is-not-available). |
| **Mixed** | A few real friends for the join and receipt shots, bots for scale | Allowed only if each shot is labelled for what it is. |

## Timeline (Plan A)

| Time | Shot | Device / capture | Must be |
|---|---|---|---|
| 0:00 to 0:12 | A real, fast-scrolling live chat | Screen recording of a busy public stream chat that you recorded | Real third-party footage (not CrowdPlay, not a mock-up); blur usernames |
| 0:12 to 0:20 | Title card | Landing page `/` at 1440 x 900, hero visible | Product UI |
| 0:20 to 0:45 | QR on the big screen, phones joining, counter rising | `/screen/<CODE>` in the lobby, full screen; cut to a phone screen recording of the join | **Real people** |
| 0:45 to 1:10 | STORM: ideas raining | `/screen/<CODE>`; cut to a phone typing an idea | **Real people** |
| 1:10 to 1:30 | DISTILL, then three options, wildcard glowing | `/screen/<CODE>` | **Real people** |
| 1:30 to 1:50 | VOTE: live bars | `/screen/<CODE>`; cut to a phone tapping an option | **Real people** |
| 1:50 to 2:15 | REVEAL, then the receipt close-up | `/screen/<CODE>`; cut to the phone screen recording of the canon moment, then `/me` | **Real person, real phone** |
| 2:15 to 2:40 | How it runs on Nexconn | `/how-it-works`, slow scroll through Under the hood and What runs on Nexconn | Product UI; any number must be live-measured and on screen |
| 2:40 to 2:55 | `/impact`, then `/try` | `/impact` as displayed; `/try` intro and a few seconds of play | `/impact` real numbers only; `/try` is labelled demo |
| 2:55 to 3:00 | End card with the URL | Static card | `<live app URL>` |

## Shot by shot

### 0:00 to 0:12: the problem

- **Show:** a real, fast-scrolling live chat. Record a busy public chat yourself (a stream with hundreds of viewers), 12 seconds, names blurred or cropped. No stock footage dressed up as a chat and no fabricated messages. If you cannot get real footage, drop this shot: start on the title card and move the first sentence under it.
- **Voice-over:** "In a room of 300 people your message lives for two seconds. Nobody reads it. Polls don't fix that: the host writes the options."
- "300 people" is a framing example, not a CrowdPlay claim. If your footage shows far fewer viewers, say "a big room" instead.

### 0:12 to 0:20: title card

- **Show:** open `<APP>/` full screen at 1440 x 900. The hero reads "The audience writes the show." Hold 3 seconds, then 5 seconds with the join box visible.
- **Voice-over:** "CrowdPlay. The audience writes the show."

### 0:20 to 0:45: join (must be real people in Plan A)

Setup before recording (see pre-flight): a show created on the deployed app, in the lobby.

- **Big screen:** `<APP>/screen/<CODE>` in the browser, full screen, showing the lobby: the big QR, the five code tiles and "N players in the room". Record the screen while people scan.
- **Phone (screen recording):** camera scans the QR, the join page opens ("Get your seat"), the name box is pre-filled with a random name such as "Brave Otter" (the dice re-rolls it), tap **I'm in**, the lobby shows "Waiting for the host…". Cut between the phone and the big screen as the counter ticks up.
- **Voice-over:** "No signup. Scan, pick a name, you're in. This is a real session with `<N>` people." Read `<N>` from the big screen's counter in the shot.

### 0:45 to 1:10: STORM

- **Host action (off camera):** on the host console press **Start show**. The PROMPT scene plays for 6 s, then the storm opens.
- **Big screen:** ideas rain in as cards (up to 40 visible), countdown ring running.
- **Phone:** the composer is live. Type an idea, send (the send button shows a 2 s cooldown ring). The idea appears in your own feed as a paper note with a yellow edge, and a pen tick draws on when it is delivered.
- **Voice-over:** "`<30>` seconds. Everyone types what happens next." Say the storm length you actually configured. The wizard default is 30 s; `/try` uses 20 s.
- Do not script what people type. Ask everyone to type freely, one idea at a time.

### 1:10 to 1:30: DISTILL then the options

- **Big screen:** "The crowd has spoken… almost." then three options appear: A and B from the crowd, C as the pink ⚡ Wildcard.
- **Voice-over:** "In seconds, AI turns the storm into three choices. Two from the crowd. One wildcard, always from a small voice."
- Say "in about `<N>` seconds" only if the host console's **Distill time** counter for this round is in the shot (it shows milliseconds). Automated live runs measured about 3 s from the end of the storm to options on the phones; say the number from your own show's counter, and do not reuse the mock load-test figures.

### 1:30 to 1:50: VOTE

- **Big screen:** three columns with live bars and percentages; "Vote on your phone".
- **Phone:** tap an option; it highlights ("Your vote"). Tap another to show it can change until time runs out.
- **Voice-over:** "One tap each. Live."

### 1:50 to 2:15: REVEAL and the receipt (real phone)

- **Big screen:** the pen draws a yellow loop around the winning card, the CANON ribbon is written in, the narration is written out on it, and the byline reads "Written by @name, @name + N others".
- **Phone (screen recording started before VOTE):**
  1. Around the start of VOTE a toast says "Your idea is on the ballot" if your idea fed an option. (If Nexconn's direct message does not reach the phone, the app asks the server once during REVEAL and the toast appears then.)
  2. If your idea won and the receipt arrives while that round's REVEAL is on screen: a full-screen "Your idea became canon" for 2.5 s (confetti unless the phone has Reduce Motion on), then a toast with "canon" swashed in yellow. A receipt that arrives later is a toast only.
  3. Open `/me`: the receipt is listed under your show.
- Get the shot with a second phone filming over the shoulder if you want a hand-held close-up; the screen recording is the safer capture.
- **Voice-over:** "The `<wildcard / crowd option>` wins. The story turns, and `<the player's name as shown on screen>`'s phone tells them: your idea became canon." Say "wildcard" only if the winning option carries the Wildcard tag. Use a real player's name only with their consent.
- If nobody on camera was credited in your take, record another round. Do not force it.

### 2:15 to 2:40: how it runs on Nexconn

- **Show:** `<APP>/how-it-works`, scrolling slowly: the architecture diagram under "Under the hood", then the table under "What runs on Nexconn". There is no animation in the product; use the page as is. A latency counter appears only if you have a live number: the host console's Distill time from the recorded round, or `/impact`'s median and 95th percentile after real sessions, on screen and labelled with its source. Without a live number, show no counter.
- **Voice-over:** "It all runs on Nexconn: an Open Channel for the room, channel metadata for shared state, priority messages so the narrator is never dropped, direct messages for receipts."
- Soften the line to "the room, the shared state and the receipts all go through Nexconn" if the live two-device show did not confirm priority and direct-message delivery (open items in `docs/NEXCONN_FINDINGS.md`).

### 2:40 to 2:55: impact and try

- **Show:** `<APP>/impact` as displayed, then `<APP>/try` (the intro screen: "Play a whole show. Alone."), then 5 seconds of the live demo with the banner visible.
- **Voice-over, if `/impact` shows real shows:** "`<N>` real people across `<M>` sessions, counted from the database. Bots and demo rooms never appear. Judges can play a round alone in about a minute." Read `<N>` and `<M>` straight off the page.
- **Voice-over, if `/impact` shows "No real show has been played yet":** "The Impact page counts only real people, and it says so honestly: bots and demo rooms never appear. Judges can play a round alone in about a minute."
- Do not say "three sessions" unless three real sessions are listed.

### 2:55 to 3:00: end card

- **Show:** a static card with the title and `<live app URL>` in large type. Make it yourself; nothing in the product provides it.
- **Voice-over:** "CrowdPlay. Every voice can change the story."

## Pre-flight checklist

**The day before**

- [ ] Deployment is up; `curl -s https://<APP>/api/health` shows `"ok":true`, `"realtimeMode":"nexconn"`, `"llmMode":"live"`. If `llmMode` says `mock` the AI keys are missing.
- [ ] Nexconn console done (README checklist): metadata service on, message priority on, webhook set to `https://<APP>/api/nexconn/webhook` with `message:send`.
- [ ] `pnpm smoke:nexconn` ran with the deployment's Nexconn variables and exited 0.
- [ ] A two-device rehearsal ran against the deployment: the phone follows the host's phases and countdown, ideas from one phone appear on another phone and on `/screen`, vote bars move, and a receipt toast appears on a phone that never opened `/me`. In the server logs, ideas arrive at `/api/nexconn/webhook`.
- [ ] If the rehearsal shows custom `CP:*` messages do not reach browsers, set `NEXCONN_TEXT_ENVELOPE=1`, redeploy, and rehearse again.
- [ ] `<APP>/try` works in an incognito window and on a fresh phone.
- [ ] Players are recruited and know the time and the link. Ask them to type freely, one idea at a time, and to pick a nickname they are happy to show.
- [ ] Consent for names and faces is confirmed.

**An hour before**

- [ ] Create the show on the deployed app: `<APP>/host`, story preset, **3 rounds**, storm 30 s, vote 12 s, auto-advance on, strict filter on. Three rounds is about four minutes of footage to cut from.
- [ ] Open `<APP>/screen/<CODE>` in a second browser window at 1920 x 1080, 100% zoom, no bookmarks bar, notifications off. Decide whether to record the big screen's sounds with the sound toggle in its corner.
- [ ] Host console on the laptop with the address bar hidden (it holds the host key).
- [ ] Recording on: OBS or the OS recorder for the big screen; the phone's screen recorder armed on the player phone (Do Not Disturb on, battery above 50%, **Reduce Motion off** so the confetti shows).
- [ ] 10-second test recording of each capture, played back with sound.
- [ ] Re-read the voice-over aloud with a timer: 2:50 or less.

**During the take**

- [ ] Start every recording, then press **Start show**. Clap or say "start" on the phone mic so the captures sync.
- [ ] Keep the phone recording running from the lobby through the end of REVEAL.
- [ ] Note the counter value and the Distill time shown for the round you will use.
- [ ] Do not touch Force win.
- [ ] After the finale, ask the chat one question: "Would you play again?" and keep two or three replies you have permission to quote.

**Afterwards**

- [ ] Screenshot `/impact`; save the `/story/<showId>` link; end the show so the host key is dead.
- [ ] Every number in the voice-over is visible in the cut. Every `/try` shot has the banner. Cuts between phases come from the same session and round (do not splice ideas or options from different sessions).
- [ ] Export 1080p, 3:00 or less. Upload. Open the link in a logged-out window.

## Fallback plan if a live crowd is not available

Record `/try` instead and say so. Everything in the product works with no host and no crowd.

1. Open `<APP>/try` in an incognito window (full screen, 1440 x 900). The banner is permanent: keep it in frame.
2. Press **Start the demo** (or start from the landing page's **Play a 2-minute demo**, which skips the intro). The room plays 3 rounds on its own (2.5 s scene, 20 s storm, the AI step, a vote that closes about 1.5 s after you vote, a reveal as long as the narration). The phone panel is on the left, the mini big screen on the right. About two minutes in all.
3. Type an idea in every round. Your idea gets a demo-only boost into the wildcard slot, tagged "⚡ boosted in demo", so it reaches the ballot and the "Your idea is on the ballot" receipt appears. Until you have one winning idea in the show, the bots' votes lean toward your wildcard, so the "Your idea became canon" moment happens by round 3 at the latest. The demo's own explainer says the bots give it a nudge; say the same in the voice-over and never present a `/try` win as a real crowd's choice.
4. For the receipt close-up, run `/try` on a real phone with the screen recorder armed, so the moment is captured on a real device even though the crowd is bots.

| Segment | What to shoot | Voice-over (replaces Plan A) |
|---|---|---|
| 0:20 to 0:45 | `/` then **Play a 2-minute demo**; the demo starts at once with a random name. No QR: the judge is already in the room. | "No signup. Pick a name and you're in. This is the demo room: the other thirty players are bots, marked with a robot badge." |
| 0:45 to 1:10 | `/try` storm, phone side and big-screen side | "Twenty seconds. Everyone types what happens next. Here the crowd is simulated; live shows use real people." |
| 1:10 to 1:30 | `/try` DISTILL and the options | Same as Plan A. |
| 1:30 to 1:50 | `/try` vote | Same as Plan A. |
| 1:50 to 2:15 | `/try` reveal and the receipt on the phone | "The `<wildcard / crowd option>` wins, and the phone tells the player their idea became canon. In this demo the crowd is bots and they nudge the visitor's idea so you can see the moment; the receipt logic is the same one live shows use." |
| 2:40 to 2:55 | `/impact` as displayed, then the `/try` end card ("That was 3 rounds. Real shows run with real crowds.") | Use the "no real show yet" or real-numbers variant above, exactly as `/impact` shows. |

Add a lower-third caption "Demo room: simulated players" across the whole `/try` portion in the edit, on top of the product's own banner.

## After the shoot: assets for the write-up

- `/impact` screenshot (the real numbers, or the honest empty state) for `docs/WRITEUP.md` section 8.
- The `/story/<showId>` link and the phone recording of the receipt.
- Two or three quotes you have permission to use.
- The 20-second GIF for the README: the cleanest 20 seconds of the storm, options and vote from the big-screen capture.
