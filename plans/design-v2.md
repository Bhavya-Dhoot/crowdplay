# CROWDPLAY design v2 — "The Writers' Room"

Sources: `plans/design-sources.md` (Apple HIG skill + Meta Astryx numbers), `plans/ux-audit.md`, `docs/UX_SPEC.md`
(behaviour and states stay; this file replaces its visual language). Keep every `data-testid`, route and behaviour.

## Idea
The audience writes the show. So the product looks like a writers' room on a late-night stage: **warm paper cards
on a tinted ink stage, lit by a stage light whose hue changes every round.** Ideas are index cards, options are
three script cards, the winner gets a rubber-stamp **CANON**, the narration is typed onto a script page, and the
finale is a printed playbill. Paper is the one signature element; everything else stays quiet so it reads.

Why it is not the generic dark-SaaS template: content is light (paper) on dark (stage), the accent is the stage
light (it moves per round), and the one gold is reserved for "canon" and the primary action.

## Tokens (CSS variables in `src/styles/tokens.css`, mapped into Tailwind `@theme`)
- Stage (tinted, never pure black): `--stage-0 #0F0D16` (page), `--stage-1 #191724` (raised), `--stage-2 #232032`
  (raised more), `--stage-line #34304A`; text on stage `--ink-on-stage #F3EFE6`, muted `--muted-on-stage #A7A1BC`
  (≥4.5:1 on stage-0).
- Paper: `--paper #F6F0E4`, `--paper-2 #EDE4D3` (pressed / stacked), `--paper-edge #D9CDB6`, ink on paper
  `--ink #1C1828`, muted ink `--ink-muted #5E566F` (≥4.5:1 on paper).
- Stage-light hue per round, used ONLY for the backdrop spotlight and small highlights:
  round 1 `--light-1 #FFB547` (amber), round 2 `--light-2 #4FD1C5` (teal), round 3 `--light-3 #B892FF` (lilac),
  then cycle. Exposed as `--light` on the page root from `state.roundNo`.
- Option gels (always with the letter, never colour alone): A `--gel-a #4C7DFF`, B `--gel-b #22C58B`,
  C wildcard `--gel-c #FF3D7F`. On paper cards they appear as a 6 px top band + the lettered disc.
  Measured contrast: gels on stage 5.2–8.7:1. On paper the gel band is decorative (the letter carries the meaning);
  disc letters: A and C white (3.4–3.7:1, large bold only), B ink (7.8:1).
- Gold (canon + the single primary action per view): `--gold #FFC83D`, on-gold text `--ink` (11.2:1).
- Measured: text on stage 16.8:1, muted on stage 7.8:1 (6.4:1 on stage-2), ink on paper 15.3:1, muted ink on paper
  6.1:1 (5.5:1 on paper-2).
- Status: ok `#34D399`, warn `#FFB547`, danger `#FF5C5C` (always with icon + text).
- Radius (concentric): inner 6, element 10, card 16, sheet 24, pill 9999. Nested radius = outer − gap.
- Spacing: 4 px grid; gap tiers 8 (inside a control) / 12 (between controls, min between vote cards) /
  20 (between groups) / 32 (between sections).
- Shadows: paper cards get a crisp contact shadow `0 1px 0 var(--paper-edge), 0 8px 18px -10px rgb(0 0 0 / .55)`.
  No coloured glows, no wide diffuse shadows on stage elements.

## Type
- Display: Bricolage Grotesque 700/800 (headlines, letters, big numbers). Body/UI: Inter 400/500/600.
- Story: **Fraunces** (variable serif, 400–600, optical size on) for prompts, narration, recap, story pages — the
  "script" voice. Load via `next/font/google`, subset latin, `display: swap`.
- Phone scale (ratio ~1.2): 13 / 15 / 17 (body, inputs ≥16) / 20 / 24 / 29 / 35. Screen scale (×1.25 from 28 px
  base): 28 / 35 / 44 / 55 / 69 / 86. Leading ≥1.4 for body, 1.1 for display. Tabular numerals for timers and %.
- No all-caps body; small caps only for stamps (CANON, WILDCARD) and labels ≤3 words.

## Motion (framer-motion via `m` + MotionScope; transform/opacity only)
- Durations: fast 175 ms (press release, chips, vote confirm), medium 410 ms (phase change, sheet), slow 975 ms
  (the reveal moment, once per round). Exit 175 ms.
- Easing: arrive `cubic-bezier(0.24, 1, 0.4, 1)`, exit `cubic-bezier(0.3, 0, 0.6, 0.6)`.
- Overshoot only on arrivals with meaning: idea card landing on the screen, the CANON stamp (scale 1.35→1,
  rotate −8°→−4°, spring stiffness ~420 damping ~22), the winner card lift.
- Press: 0 ms onset `scale(0.98)` + pressed overlay, never layout change. Haptic `navigator.vibrate(12)` on vote and
  send (optional, muted by reduced motion), 60 on canon.
- Frequent actions stay still: typing, scrolling, changing a vote get no flourish beyond press feedback.
- Reduced motion: opacity cross-fades ≤200 ms, no travel/scale/rotate, no confetti, typewriter shows full text.

## Surfaces
- Glass (blur 24 px, saturate 1.4, translucent `--stage-1` at 72%, 1 px `--stage-line` border, opaque fallback
  under `prefers-reduced-transparency`/`forced-colors`) ONLY on floating layers: phone composer bar, toasts,
  connection banner, host top bar, sheets. Never on cards.
- Stage backdrop: one fixed radial spotlight in `--light` at ~14% opacity from the top centre + a faint vignette.
  CSS only (no canvas). On the big screen the light slowly breathes (opacity 12%↔18%, 6 s) unless reduced motion.

## Signature components (new or restyled primitives; APIs documented in each file header)
- `PaperCard` (tone: paper | paper-2; optional `gel: "a"|"b"|"c"` top band; optional `tilt` in degrees for rain).
- `Stamp` ("CANON" gold, "WILDCARD" magenta, "NARRATOR'S PICK" ink) — rotated rubber-stamp label with the
  arrival spring; static under reduced motion.
- `ScriptText` — Fraunces narration with a typewriter reveal that never shifts layout (in-flow transparent full
  text + absolutely positioned typed overlay, like the current RevealView fix).
- `StageBackdrop` — sets `--light` from the round and renders the spotlight.
- `GelDisc` — lettered circle A/B/⚡ in the gel colour.
- Buttons: primary = gold pill (one per view), secondary = paper pill on stage, ghost = text on stage. All ≥44 px.
- Countdown: thin ring in `--light`, number in Bricolage tabular; last 5 s turns `--warn` and the ring pulses once
  per second (not a strobe).

## Per-surface direction
- Landing `/`: one hero line + a LIVE miniature of a round built from real components (cards rain → three script
  cards → CANON stamp) on a loop (static frame under reduced motion; never empty skeletons). Primary CTA (gold):
  **"Play a 2-minute demo"** → /try. Secondary: join with code (5 boxes). Tertiary link: host a show.
- Phone `/play`: stage background, paper idea cards in the feed (own = gold edge, bots 🤖), composer is a glass bar
  pinned above the keyboard; VOTE = three full-width script cards with gel band + letter, 12 px apart, tap = select
  with check + "Your vote" stamp; REVEAL = winner card lifts, CANON stamp lands, narration typewrites on a paper
  script page; if credited: full-screen gold "Your idea is canon" moment with one confetti burst. Toasts never cover
  vote cards (reserve space or place top on VOTE).
- Screen `/screen`: the stage. STORM = paper cards rain onto a desk (tilts −3°..3°, cap 40), DISTILL = cards slide
  into three stacks, VOTE = three tall script cards with vertical gel fill BEHIND the text (fix: never crosses
  text), REVEAL = winner centre, CANON stamp slam, narration typewritten in Fraunces 44 px, credits as a byline
  "Written by @a, @b, @c + N others", FINALE = playbill (title page, cast list of canon makers).
- Host `/host`: calm, dense but legible "stage manager" console on stage-1 panels; the one gold button is the
  phase action; paper cards only for the live preview.
- `/try`: the judge path. Zero setup: name is prefilled and editable, ONE tap "Start the demo". Coach marks are
  small paper notes, auto-advancing with the phases, never blocking.
- `/story`: printed playbill/script look (paper page on stage), Fraunces body — the share artefact.
- `/me`, `/impact`, `/how-it-works`, `/admin`: same tokens; impact numbers in Bricolage; diagrams in stage colours.
