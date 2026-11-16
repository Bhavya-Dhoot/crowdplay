# CROWDPLAY — Submission Kit

Deadline: **22 Nov 2026 23:59 AoE = 23 Nov 15:59 GST.** Target: submit 21 Nov. Required: write-up PDF + App Key, demo video, runnable app link, public GitHub repo. Traction proof = optional bonus.

## 1. Timeline (from 15 Nov)

| Day | Do |
|---|---|
| 15–16 Nov | One-shot build; console checklist (`NEXCONN_INTEGRATION.md` §8); deploy; first friends test |
| 17 Nov | Fix live findings; book 3 public sessions |
| 18–19 Nov | Run sessions 1–2; screen-record everything; capture `/impact` |
| 20 Nov | Session 3; record demo video; finish write-up |
| 21 Nov | Submit; test links from an incognito window and a phone |
| 22 Nov | Buffer only |

## 2. Demo video script (≤3:00)

| Time | Shot | Voice-over |
|---|---|---|
| 0:00–0:12 | A real fast-scrolling live chat | "In a room of 300 people your message lives for two seconds. Nobody reads it. Polls don't fix that — the host writes the options." |
| 0:12–0:20 | Title card | "CROWDPLAY. The audience writes the show." |
| 0:20–0:45 | QR on screen; real phones joining; counter rising | "No signup. Scan, pick a name, you're in. This is a real session with N people." |
| 0:45–1:10 | STORM: ideas raining | "Thirty seconds. Everyone types what happens next." |
| 1:10–1:30 | DISTILL → three options; wildcard glows | "In about six seconds, AI turns the storm into three choices. Two from the crowd. One wildcard — always from a small voice." |
| 1:30–1:50 | VOTE bars live | "One tap each. Live." |
| 1:50–2:15 | REVEAL + phone close-up of receipt | "The wildcard wins. The story turns — and Priya's phone tells her: your idea became canon." |
| 2:15–2:40 | Architecture animation + latency counter | "It all runs on Nexconn: an Open Channel for the room, channel metadata for shared state, priority messages so the narrator is never dropped, direct messages for receipts." |
| 2:40–2:55 | `/impact` numbers + `/try` | "N real people across 3 sessions. Judges can try it alone in sixty seconds." |
| 2:55–3:00 | End card with URL | "CROWDPLAY. Every voice can change the story." |

Rules: show real numbers only; label any bot footage; capture the receipt moment on a real phone.

## 3. Write-up outline (export `docs/WRITEUP.md` to PDF, ≤6 pages)

1. **One-liner + links** (app, repo, video, App Key).
2. **Problem** — live chat at scale is unreadable; polls silence the crowd (cite the Twitch study).
3. **Solution** — the loop, with one screenshot per phase.
4. **What is new** — crowd-written options, minority slot, personal receipts; comparison table vs polls / Slido / Remesh.
5. **How it uses Nexconn** — Feature → Nexconn table; why Open Channel + metadata + priority controls fit.
6. **Architecture** — diagram; engine; AI pipeline with fallbacks; latency numbers.
7. **Safety** — three layers + host control.
8. **Real usage** — sessions, people, ideas, canon makers, quotes, screenshots. Bots excluded.
9. **Business** — users, pricing, wedge, why it grows Nexconn MAU.
10. **Honest limits** — 500 concurrent on the free plan; LLM latency; what we did not test.
11. **Prior work** — nothing before 23 Oct; first commit date; dependencies.

## 4. README must contain
- Live link, `/try` link, 20-second GIF.
- Problem → what it does → Feature → Nexconn table → architecture diagram.
- Local setup, env table, tests, deploy.
- **How judges can test it:** alone (`/try`), two devices (host + phone), overlay.
- Limitations and prior-work statement.

## 5. Traction playbook (the 20% + bonus)

- **Where to get 30–150 real people fast:** college clubs and E-Cell groups, Discord servers (D&D, writing, anime, gaming), hackathon community chats, friends' WhatsApp groups, a short LinkedIn/X post with the link at a fixed time.
- **Format:** "10-minute live story — we write it together. 8:30 pm, link here." Six rounds ≈ 10 minutes.
- **Run it:** host shares screen (`/screen`) on Meet/Discord/YouTube; players join on phones.
- **Capture:** screen recording, a phone recording of a receipt, `/impact` screenshot, 2–3 player quotes (ask in chat at the end), the `/story` link.
- **After:** post the story link; ask one question: "Would you play again?"
- Record honest counts. Do not inflate.

## 6. Submission checklist

- [ ] App deployed; `REALTIME_MODE=nexconn`; webhook set; `/api/health` OK
- [ ] `/try` works on a fresh phone and incognito desktop
- [ ] Repo public; README complete; secrets absent; history shows in-window commits
- [ ] Video ≤3 min, uploaded, public/unlisted link works logged-out
- [ ] Write-up PDF with App Key
- [ ] Track selected: **Gaming & Live Streams**
- [ ] Traction evidence attached (optional bonus)
- [ ] Submitted by 21 Nov; confirmation screenshot saved

## 7. Q&A prep (likely judge questions)

- **"Isn't this Twitch polls?"** Polls: host writes options. Here the crowd does, in seconds, with a guaranteed minority slot and personal credit.
- **"Is the crowd real?"** Yes in sessions (numbers on `/impact`). `/try` uses labelled bots so you can test alone.
- **"Does it scale?"** Open Channels are unlimited; the free plan caps us at 500 concurrent. Distillation cost is flat per round (clusters, not messages).
- **"What if the AI picks something offensive?"** Filter → model safety flags → host veto, before anything hits the screen.
- **"Why Nexconn?"** Open Channel + metadata as shared state + priority controls + direct messages cover the whole product; all real-time delivery is Nexconn.
