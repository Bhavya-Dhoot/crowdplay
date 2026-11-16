# CROWDPLAY — UX Specification

Completeness & UX is **50% of the score**. Treat every screen below as required. Mobile-first.

## 1. Design language

- **Mood:** late-night game show. Dark stage, one bright accent, big type, motion with purpose.
- **Tokens (CSS variables in `src/styles/tokens.css`):**
  - `--bg: #0B0B12` · `--surface: #15151F` · `--surface-2: #1E1E2B` · `--line: #2A2A3A`
  - `--text: #F5F5FA` · `--muted: #9A9AB0`
  - `--accent: #FFD23F` (crowd / primary) · `--wild: #FF4D8D` (wildcard) · `--ok: #3DDC97` · `--warn: #FF8A3D` · `--danger: #FF5A5A`
  - Option colours: A `#5B8CFF`, B `#3DDC97`, C (wildcard) `#FF4D8D`
  - Radius 16 px cards, 999 px pills. Spacing scale 4/8/12/16/24/32/48.
- **Type:** display = "Bricolage Grotesque" (700/800); body = "Inter" (400/500/600). Load via `next/font`. Phone base 16 px; screen overlay base 28 px.
- **Motion:** Framer Motion. Phase changes = 250 ms slide/fade. Idea rain = spring pop. Winner = confetti burst (canvas-confetti) + scale. Respect `prefers-reduced-motion` (fades only, no confetti).
- **Sound (screen only, optional toggle):** tick in last 5 s, whoosh on options, sting on reveal.
- **Icons:** lucide-react. **Components:** Tailwind + small in-house primitives (Button, Card, Pill, Countdown, ProgressBar, Toast, Sheet). No heavy UI kit.
- **Copy voice:** short, playful, second person. Never technical. No "error 500" — say what to do.

## 2. Global components

| Component | Behaviour |
|---|---|
| `PhaseHeader` | Round "2 / 6", phase label, circular countdown synced to server time. Turns `--warn` in last 5 s. |
| `ConnectionBanner` | Hidden when connected. "Reconnecting…" (amber) / "Back online" (green, 2 s). |
| `Toast` | Bottom on phone, top-right on desktop. Receipts use a special gold toast with haptic (`navigator.vibrate(60)` when available). |
| `BotBadge` | 🤖 pill next to any bot name. Tooltip: "Simulated player (demo room)". |
| `NexconnBadge` | "Built on Nexconn Chat SDK" → `/how-it-works`. Footer of landing, host, try. |

## 3. Screens

### 3.1 Landing `/`
- Hero: "The audience writes the show." Sub: "Everyone types. AI turns the chaos into three choices. The room decides. You get the credit."
- Three actions: **Join a show** (code input, 5 boxes, auto-advance, paste support) · **Host a show** · **Try it alone (60 s)** → `/try`.
- 3-step explainer strip with tiny looping animation of storm → options → credit.
- Footer: How it works · Impact · GitHub · NexconnBadge.

### 3.2 Join `/join/:code`
- Shows show title + host name + player count. Input: display name (prefilled with a fun random name, e.g. "Brave Otter"; a 🎲 button re-rolls). Button: **I'm in**.
- States: invalid code (suggest checking the code), show ended (link to story), room full (≥ cap) → "Watch on the big screen" link.

### 3.3 Player `/play/:code` (the most important screen)
Single column, no scrolling of the page; only the feed scrolls. Bottom-anchored composer above the safe area.

| Phase | Layout |
|---|---|
| **LOBBY** | "Waiting for the host…" + player count ticking up + "Share" button + premise card. Cheer emojis enabled. |
| **PROMPT** | Scene card animates in (title + 1–2 sentences). Big question: "What happens next?" Composer disabled with hint "Get ready…". |
| **STORM** | Composer live: input (140 counter), send button. Feed shows everyone's ideas in real time (own ideas right-aligned, gold outline). Chips with 3 starter nudges ("a betrayal", "something falls", "a stranger appears") that insert text. Cooldown ring on the send button (2 s). |
| **DISTILL** | Composer replaced by "Reading 142 ideas…" shimmer with rotating lines ("Finding the wildest one…", "Counting the votes of the brave…"). |
| **VOTE** | Three large option cards (A/B/wildcard with ⚡ "Wildcard" tag). Each shows label, live bar, supporter count "from 23 ideas". If mine contributed: gold "✨ Yours" ribbon. Tap = select (haptic); can change until 0. |
| **REVEAL** | Winner card expands; narration text types in; credits line "@priya + 23 others". If credited: full-screen gold moment for 2.5 s "🏆 Your idea became canon" then collapses to toast. Losing options fade with their final %. |
| **FINALE** | Story recap (scroll), "Canon makers" top 5, my stats (ideas sent, on ballot, canon), buttons: Share story · See my receipts. |
| **PAUSED** | Dim overlay "Host paused the show". |

- Error states: idea rejected (filter) → inline "Let's keep it friendly — try another idea."; rate limited → button ring; banned → "You've been removed from this show."
- Late join: skeleton for ≤2 s then current phase.

### 3.4 Host `/host/:code?k=…`
Desktop-first, usable on tablet. Three columns:
1. **Left — Control:** big primary button that changes with phase (Start show → Start round → End storm now → Reveal now → Next round → End show). Secondary: Pause, +10 s, Auto-advance toggle, Strict filter toggle, Voice toggle.
2. **Centre — Live:** mirror of the screen content (prompt, idea feed with per-idea ✕ delete, options with **Veto**, **Force win**, **Re-roll (1 left)**).
3. **Right — Room:** QR + code + copy links (join, screen, OBS), player list (search, mute/ban), counters (connected, ideas, distill ms, fallback used ⚠).
- Setup wizard before LOBBY: title → preset or custom premise → rounds (slider 3–10) → timings (storm 20/30/45, vote 10/12/20) → create.
- Invalid host key → friendly 403 page.

### 3.5 Screen / overlay `/screen/:code`
16:9, designed to be readable from 5 m.
- Persistent: top-left show title + round; top-right QR + "Join: crowdplay.app · CODE" + player count.
- **STORM:** prompt at top; ideas fly in as cards in a masonry "rain" (cap 40 visible, oldest fade). Big countdown ring.
- **DISTILL:** cards swirl into three piles (simple transform animation), text "The crowd has spoken… almost."
- **VOTE:** three columns with thick live bars and percentages; wildcard column glows `--wild`.
- **REVEAL:** winner fills the screen; narration appears line by line; credits "@name, @name, @name + N others" with avatars (generated initials).
- **FINALE:** credits roll of all canon makers + story title.
- `?obs=1`: transparent background, no QR unless `&qr=1`.

### 3.6 Judge Mode `/try`
- One screen: name input + **Start the demo**. Banner (always visible): "Demo room — 30 🤖 simulated players. Live shows use real people."
- Split layout on desktop: left = player view, right = mini big-screen. On mobile: player view with a collapsible mini-screen on top.
- Guided coach marks (3): "Type any idea", "Watch it compete", "Vote — maybe yours wins".
- To make it delightful: the wildcard picker gives the human judge's idea a boosted chance (documented, demo-only, shown as "⚡ boosted in demo").
- End card: "That was 3 rounds. Real shows run with real crowds." Buttons: Host a show · How it works · Impact.

### 3.7 Other pages
- `/me`: receipts list (BALLOT/CANON with show, round, text), stats, "Delete my data".
- `/story/:showId`: title, premise, each round (prompt, winning option, narration, credits), share image (OG), "Host your own".
- `/impact`: big numbers (real people, shows, ideas, canon makers, median distill time), per-session table, note "Bots excluded".
- `/how-it-works`: loop diagram, architecture diagram (Mermaid rendered to SVG), **Feature → Nexconn** table, limits & honesty section.
- `/admin?token=`: sessions export CSV, feature flags view.

## 4. Empty / loading / error matrix (must exist)

| Situation | UI |
|---|---|
| No ideas in a round | Narrator options tagged "Narrator's pick"; screen says "Too quiet! The narrator improvises." |
| AI fallback used | No player-visible change; host sees ⚠ pill. |
| Nexconn disconnected | ConnectionBanner; composer disabled with "Reconnecting…"; state continues via HTTP poll. |
| Server unreachable | Full-screen "Hang tight — we'll be right back" with auto-retry. |
| Show ended while I was away | Redirect to FINALE view. |
| Cookies blocked | Message with steps; fall back to localStorage token. |

## 5. Accessibility
- `aria-live="polite"` region announces phase changes and results.
- All interactive elements reachable by keyboard; visible focus ring `--accent`.
- Option colours always paired with letters/icons (not colour-only).
- Countdown has text equivalent ("12 seconds left").

## 6. Quality bar
- Lighthouse mobile on `/` and `/play`: Performance ≥85, Accessibility ≥95.
- No layout shift when phases change (reserve heights).
- First idea can be typed within 3 s of `/play` load on 4G.
