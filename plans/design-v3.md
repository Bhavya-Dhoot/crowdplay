# Design v3: "Live Sketchnote"

Founder brief (2026-11-17): extremely premium, unique, doodle-like, dopamine-worthy, not a riot of random colours. Pick one
style from the brag catalogue and stick to it. Chosen: **Sketchnote** (`brag-styles/opuscar/styles/sketchnote/STYLE.md`,
poster `.../sketchnote/poster.jpg`). Replaces design v2 ("The Writers' Room", dark stage) everywhere.

## 1. The idea

CrowdPlay is a room writing one page of notes together, live. Every surface is that page: warm white dot-grid paper, a black
fineliner, a grey marker for volume, and **one yellow marker**. In the source style the yellow follows one thread through the
page. Here the thread is **an idea on its way to canon**: your idea, your vote, the winner, the CANON ribbon, the one primary
action. Everything else is black ink and grey marker. If a screen has yellow on more than its thread, banners and fat arrows,
it is wrong.

Dopamine comes from moments that are *drawn for you*, not from colour or bounce:
- your idea is sent: a pen check draws itself on your note (220 ms) + `haptic("tap")`.
- your idea makes the ballot: the yellow marker swipes under it (410 ms, left to right, multiply).
- you vote: the pen circles your option's letter and a yellow swash fills behind it.
- the winner: the pen draws a yellow loop around the winning card (stroke-dashoffset, ~700 ms), the **CANON** ribbon is
  written in, then a short burst of doodle confetti (ink stars, squiggles, yellow dots; ~1.2 s, once).
- your idea became canon: all of the above plus the full-phone moment, `haptic("canon")`.
- buttons press *into their shadow* (translate 3px 3px, shadow 0): tactile, every tap.
- finale: the whole story becomes one sketchnote poster (numbered scene boxes joined by fat arrows): "the page you wrote".

## 2. Tokens (src/styles/tokens.css; names below are the contract)

Paper & ink
- `--paper` #FBFAF6 (page), `--paper-raised` #FFFEFA (cards; a card is "paper on top", so it hides the dots), `--dots` #D9D4C9.
- `--ink` #1E1E22 (lines, words, primary text), `--ink-notes` #5B5852 (secondary text; 7:1 on paper), `--ink-faint` #8A867D
  (decoration and large text only, never body copy).
- Dot grid on the page: `radial-gradient(circle, var(--dots) 1.3px, transparent 1.5px) 0 0 / 26px 26px`. Optional static
  grain at <= 4% opacity (one inline SVG noise layer, no image request).

Markers (translucent, laid with `mix-blend-mode: multiply` where they overlap ink or paper)
- `--marker-1` rgba(100,100,110,.16) volume/fills, `--marker-2` rgba(80,80,92,.28) shadows and ribbon tails,
  `--marker-3` rgba(52,52,64,.45) folds and small dark parts.
- `--hl` rgba(255,205,40,.80) the yellow marker; `--hl-solid` #FFD23F (opaque yellow where multiply is impossible, e.g. the
  primary button face); `--hl-deep` #F5AA00 (sparks, the canon loop stroke, the yellow edge of "your" note).
- Marker texture (optional, CSS only): a repeating-linear-gradient at -12deg alternating `--hl` and a 0.65-alpha variant in
  7-9 px bands, so a swash reads as streaks, not a flat fill.

Status (the only extra colour)
- `--danger` #B4321F, for error text, the destructive confirm and "removed". Small areas only. No green, no blue. Success is a
  drawn check in ink; "live" is an ink dot that pulses.

Lines, shapes, shadows
- Outline: `--line` 2.5px solid var(--ink) for cards and boxes; 2px for chips/inputs; 3px for buttons.
- Hand-drawn radii (no perfect rounds): `--r-card: 18px 24px 16px 22px / 22px 16px 24px 18px`;
  `--r-card-alt: 24px 16px 22px 18px / 16px 22px 18px 24px` (alternate on siblings); `--r-pill: 255px 18px 225px 18px /
  18px 225px 18px 255px`; `--r-blob: 52% 48% 55% 45% / 48% 55% 45% 52%` (letter circles, avatars).
- Shadow is grey marker, always down-right, no blur: cards `6px 7px 0 var(--marker-2)`, buttons `4px 4px 0 var(--ink)`
  (pressed: `0 0 0`, translate 4px 4px), big poster boxes `9px 10px 0 var(--marker-2)`.
- Tilt for notes: -2.5deg..2.5deg by a seeded hash of the id (never random per render).

Type (next/font/google, self-hosted, `display: swap`; drop Fraunces, Bricolage, Inter)
- **Kalam 700**: display, titles, banners, keywords, room codes, big numbers, buttons. Slight per-word tilt only on display
  sizes >= 40px (seeded; `rotate(-1deg..1deg)`), never on UI labels.
- **Patrick Hand 400**: everything else (body, notes, inputs, narration, host UI). Minimum 16px on the host console, 17px on
  phones, 15px for fine print only.
- Scale (px): 15 fine, 17 body, 20 lead, 24 h3, 32 h2, 44 h1, 64 display, 96-180 screen display. Max four sizes per view.
- Numbers that matter get a yellow swash behind them or a pen loop around them.

Motion (src/components/ui/motionTokens.ts stays the single source)
- Durations keep the Astryx set: 175 / 410 / 975 ms; draw-ons: outline 250-500 ms, check 220 ms, canon loop 700 ms.
- Easing: arrive `cubic-bezier(0.24,1,0.4,1)`, exit `cubic-bezier(0.3,0,0.6,0.6)`, pen `cubic-bezier(0.55,0,0.35,1)`.
- Things are **drawn or placed**, never slid across the screen: SVG `pathLength=1` + `stroke-dashoffset` for lines, loops,
  arrows, checks, underlines; cards are "placed": opacity 0 to 1 + translateY(6px) + rotate settle, 175-410 ms.
- No idle bouncing. Life comes from new strokes, the countdown, and an optional ink "boil" (one shared SVG turbulence filter
  cycled over 3 seeds at 8 fps) applied **only** to the canon loop and the CANON ribbon outline while REVEAL is on screen.
- Text is written, not wiped: ScriptText's typewriter (overlay pattern, no CLS) is the "pen writing" for narration.
- `prefers-reduced-motion`: no draw-ons (strokes appear complete), no boil, no confetti, no tilt animation; layout identical.

## 3. Primitives (src/components/ui; keep exported names and props backward compatible, add new ones)

- `StageBackdrop` -> now the **page**: dot-grid paper (+ optional faint grain). `hue`/round props become no-ops; keep the
  prop types so callers compile; the dead-code sweep removes them later.
- `PaperCard` -> paper-raised fill, ink outline, hand-drawn radius (alt radius via `tilt`/index), marker shadow. `gel` prop:
  maps A/B/C to nothing visual except a small ink letter tab; `edge="gold"` -> yellow edge (`--hl-deep` 4px left edge +
  a yellow swash on the corner) = "this is yours".
- `GelDisc` -> **LetterBadge**: ink letter in a hand-drawn blob circle on paper; `selected` draws a yellow fill behind it
  and a pen circle around it. Wildcard: the ⚡ doodle instead of a letter. Export both names.
- `Stamp` -> **Ribbon**: a banner with a yellow centre, ink outline, grey-marker notched tails (as the poster's
  "1 SIP" ribbons). Kinds: canon ("CANON"), wildcard ("WILDCARD", dashed outline, no yellow), narrator ("NARRATOR'S PICK",
  no yellow), demo ("DEMO", no yellow). The canon ribbon draws its outline on, then the word is written. Export both names.
- `Button`: primary = yellow (`--hl-solid`) face, 3px ink outline, pill radius, ink shadow, presses into its shadow; ONE per
  view. secondary = paper face, same outline and press. ghost = ink text with a hand-drawn underline on hover/focus.
  danger = paper face, ink outline, `--danger` text + icon.
- `Chip`/`Pill`: paper, 2px ink outline, pill radius; `active` = yellow swash behind the label.
- New: `Swash` (yellow marker highlight behind inline text; `play` animates the swipe), `PenLoop` (SVG hand-drawn ellipse
  around its child; draws on), `PenCheck`, `FatArrow` (yellow-filled, ink-outlined arrow, the poster's "->"), `InkUnderline`,
  `NumberBanner` (the numbered ribbon used for phase/section heads: "1 IDEAS", "2 VOTE", "3 CANON").
- `Countdown`: a hand-drawn circle; the remaining time is the ink arc (draws down), number in Kalam; in the last 5 s the
  number gets a yellow swash (yellow = something you should act on now).
- `Toast`: a paper slip with a strip of grey washi tape on its corner (the style's subtitle slip); "yours" toasts get a
  yellow swash on the keyword.
- `Skeleton`: grey marker streaks on paper. `Avatar`: initials in a blob circle, ink outline, marker-1 fill (no colours).
- `BotBadge`: the 🤖 stays (honesty rule), in an ink-outlined pill.
- `ConnectionBanner`/`FullScreenMessage`/`Sheet`/`CodeInput`/`QrCode`/`ProgressBar`: same language; QR sits in a drawn box;
  code input boxes are hand-drawn squares, the caret box gets a yellow swash.
- Confetti (canvas-confetti, already installed): colours `#1E1E22`, `#FFD23F`, `#8A867D` only; shapes from text
  (`✦`, `★`, `~`, `•`) via `shapeFromText`, ~60 particles, one burst. Shared helper in `src/components/ui/doodleConfetti.ts`;
  player CanonMoment/RevealView and screen ConfettiLayer switch to it.

## 4. Surfaces

- **Landing `/`**: one page of notes. Title banner "CROWDPLAY" (Kalam, yellow swash on "the audience writes the show"),
  the 3-step strip drawn on load (1 TYPE -> 2 VOTE -> 3 CANON with yellow fat arrows and small doodles), the single primary
  **Play a 2-minute demo** (`/try?go=1`), "Have a code?" row with the code boxes, Host as an underlined link, footer.
- **Player phone**: header = NumberBanner ("Scene 1 · Ideas") + Countdown; prompt as a boxed note; idea feed as paper notes
  (others' notes plain, yours with the yellow edge and a pen check); composer on a paper bar with an ink outline; vote = three
  big boxes (letter badge, label, grey marker bar rising, %), your vote circled + swashed; reveal = winner box with pen loop +
  CANON ribbon, narration written on a note, result line ("You called it" / "Your idea is canon" with a yellow swash);
  finale = the story poster; /join = an "admit one" paper ticket drawn with a dashed tear line; /me = a notebook page of your
  receipts, canon ones swashed.
- **Big screen**: the room's page, built up live. LOBBY: banner title, QR in a drawn box, code written huge, "admit one"
  tickets as people arrive. STORM: notes pinned across the dot grid (seeded tilt), count + Countdown. DISTILL: fat arrows
  pull the notes into three boxes. VOTE: three numbered boxes with grey marker bars rising. REVEAL: pen loop around the
  winner, CANON ribbon written in, narration written by the pen, byline. FINALE: the pull-back poster of the whole story.
  OBS: transparent page (no dots), boxes stay paper.
- **Host console**: same tokens, denser (Patrick Hand 16-17px), paper panels with ink outlines, ONE yellow primary (the phase
  key). Diagnostics stay collapsed. The timeline is a row of numbered ribbons.
- **/try**: the phone drawn as an ink outline device on the page, mini screen as a drawn 16:9 box; coach notes are paper slips
  with washi tape; boost explainer and "Demo" ribbon stay honest.
- **/story**: the show's sketchnote poster (printable): title banner, numbered scene boxes joined by fat arrows, the winning
  line per scene, narration notes, a cast list. OG image: the same poster in miniature (plain boxes and text, no emoji).
- **/impact, /how-it-works, /admin**: notes pages; big numbers in Kalam with swashes; diagrams redrawn as sketchnote boxes and
  fat arrows.

## 5. Hard rules carried over

Every `data-testid` and route stays. `PublicState` and API contracts are frozen. Bots keep 🤖 and the demo stays labelled.
No CLS (overlay typewriter). Touch targets >= 44 px. Focus ring: 3px solid `--ink`, offset 3px, on every interactive element.
Contrast AA on paper (`--ink-notes` is the floor for text). Lighthouse gates: a11y >= 95, perf >= 85 on `/` and `/play`.
No new runtime dependencies. Remove code your change orphans (old gel/stage-light/dark-theme code, unused fonts, unused CSS).
