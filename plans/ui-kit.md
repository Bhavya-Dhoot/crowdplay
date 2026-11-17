# UI kit for page builders (design v2 "The Writers' Room"; spec: plans/design-v2.md; read each file's header comment)

Idea: warm PAPER cards on a tinted ink STAGE, lit by a stage light whose hue changes per round. Gold = canon + the ONE
primary action per view. Everything else stays quiet. Contrast numbers are in src/styles/tokens.css.

## Core rules for page agents
- Import primitives individually: `@/components/ui/<Name>` (no barrel). Each page renders its own `<main id="main">`.
- Render `<StageBackdrop roundNo={state.roundNo} />` once per room page (`breathe` on /screen). It sets `--light` on the
  root and draws the spotlight; the page background is the stage (html bg stage-0, body transparent). Content needs no z-index.
- One gold `<Button variant="primary">` per view. Secondary = paper pill. Never put glass on paper or on cards.
- Text on stage: `text-on-stage` / `text-muted-on-stage`. Text on paper: `text-ink` / `text-ink-muted`. Bright fills
  (gold, gels, status): `text-ink`. Colour is never the only signal (gel + letter, status + icon + words).
- Frequent actions (typing, scrolling, changing a vote) get press feedback only. Overshoot only on meaningful arrivals.

## Tokens (Tailwind utilities; CSS variables in src/styles/tokens.css)
- Colour: `bg-stage-0/1/2`, `border-stage-line`, `text-on-stage`, `text-muted-on-stage`, `bg-paper`, `bg-paper-2`,
  `border-paper-edge`, `text-ink`, `text-ink-muted`, `bg-gel-a/b/c`, `bg-gold`, `bg-light`/`text-light`/`border-light`
  (this round's light), `text-ok|warn|danger`, `text-danger-on-paper` (danger on paper, 4.9:1).
- Radius: `rounded-inner` 6, `rounded-element` 10, `rounded-card` 16, `rounded-sheet` 24, `rounded-pill`. Nested = outer minus gap.
- Spacing is Tailwind's 4 px step; use tiers `gap-2` (8, inside a control), `gap-3` (12, between controls / vote cards),
  `gap-5` (20, groups), `gap-8` (32, sections). `shadow-contact` = paper's contact shadow.
- Type: `font-display` (Bricolage 700/800), `font-sans` (Inter), `font-script` (Fraunces: prompts, narration, recap, story).
  Phone scale `text-fine 13 / small 15 / body 17 / lead 20 / h3 24 / h2 29 / h1 35`; screen scale
  `text-screen-sm 28 / md 35 / lg 44 / xl 55 / 2xl 69 / 3xl 86`. Tabular figures: `tabular-nums`. No all-caps body.
- Motion: `ease-arrive`, `ease-exit`, `duration-175` (fast), `duration-[410ms]` (medium), `duration-[975ms]` (slow, once per round).
  `@/components/ui/motionTokens`: `DURATION`, `DURATION_MS`, `EASE`, `EASE_CSS`, `SPRING.stamp|land|lift|settle`,
  `TRANSITION.fast|medium|slow|exit` (framer), `haptic("tap"|"reject"|"canon")`, `springToLinear(k, c)` -> `{easing, durationMs}` (CSS spring).
  Stage-light helpers (`@/components/ui/stageLight`): `lightIndex(roundNo)`, `lightVar`, `lightHex`, `ROUND_LIGHTS` (for canvas/confetti).
- CSS classes (globals.css): `.press` (press feedback on any control; `[--press-overlay:...]` sets the overlay), `.glass`
  (floating layers only), `.paper`, `.stamp`, `.script`, `.skeleton`.
- Legacy names still work as aliases (see the bottom of tokens.css): bg-bg, bg-surface, bg-surface-2, border-line, text-text,
  text-muted, bg-accent/text-accent (gold), bg-opt-a/b/c, text-wild, `.glow-accent`/`.glow-wild` (now a 2 px ring, no glow),
  `.stage-light`, `.marquee`. Move pages to the v2 names as you restyle them.

## Surfaces
- `<Card tone="default|raised|accent|wild" as>` stage panel (stage-1 / stage-2; accent = gold ring, wild = magenta ring). 16 px radius, p-4.
- `<PaperCard tone="paper|paper-2" gel="a|b|c" edge="gold|wild" tilt={deg} pressable as className/>` + `paperCardClass({...})`
  for a `<button>` that IS the card (vote cards). gel = 6 px top band (decorative: show the letter too). edge gold = my idea,
  wild = wildcard. `tilt` uses CSS `rotate`, so framer transforms on the same element still work. Default radius 16
  (override with `rounded-element` etc.). Focus ring inside paper turns to ink.
- `<Stamp kind="canon|wildcard|narrator" size="sm|md|lg|xl" animate delayMs className/>` rotated rubber stamp, server-safe.
  Arrival = CSS spring (scale 1.35->1, rotate -8->-4 deg, k420/c22), plays on mount; `animate={false}` = static; reduced
  motion = fade only. Position it yourself (`absolute -top-3 right-3`). Pair with `haptic("canon")`.
- `<GelDisc letter="A|B|C" size={40}/>` lettered circle (C = bolt + sr-only "C"); `gelOf(letter)` -> PaperCard gel prop.
- `<ScriptText text cps={34} delayMs play caret onDone as className/>` Fraunces typewriter, never shifts layout (typed part +
  transparent rest in the same flow); full text at once under reduced motion; `onDone` once per text; `play={false}` holds.
- `<StageBackdrop roundNo breathe/>` see rules. Cross-fades the hue over 975 ms on round change.
- `<Skeleton className tone="stage|paper"/>`, `<SkeletonText lines tone/>`: keep the real content's size.
- Glass layers (opaque under reduced transparency / high contrast / no backdrop-filter): Toast, ConnectionBanner, Sheet.
  For your own floating bar (composer, host top bar) use `className="glass"` (+ border/radius); never on cards.

## Controls and status
- `<Button variant="primary|secondary|ghost|danger|wild" size="sm|md|lg" loading block/>`, `<ButtonLink href/>`,
  `buttonClass({...})`. All >= 44 px. primary = gold pill (ONE per view); secondary = paper pill on stage; ghost = text on stage.
  Press: 0 ms onset scale .98 + overlay; disabled = stage grey. Focus ring: global 2 px gold at 3 px offset.
- `<Pill tone="neutral|accent|ok|warn|danger|wild|a|b|c|outline|paper" size="sm|md"/>` (a/b/c need the letter inside).
- `<ProgressBar value label tone="accent|light|a|b|c|wild|ok|warn|danger"/>` (label required).
- `<CodeInput value onChange onComplete/>` (paper tiles), `<JoinCodeForm variant="secondary|primary"/>` (secondary by default:
  use primary only when joining IS the view's gold action), `<QrCode value size label light dark/>` (ink on near-white),
  `<Avatar name size/>`, `<BotBadge/>` after EVERY bot name, `<NexconnBadge/>`, `<Footer/>`.
- `<PhaseHeader state offsetMs/>` (announces the phase via aria-live), `<Countdown endsAt startedAt offsetMs paused size labelled/>`:
  thin ring in `--light`, last 5 s turns warn and beats once per second (round 1's light is amber like warn: the beat tells them apart),
  `<Ring fraction size stroke color track/>`, `useCountdown`, `useReducedMotion`.
- `<ConnectionBanner status={connection}/>`, `<LiveRegion message={phaseAnnouncement(state)}/>`,
  `<FullScreenMessage title body onRetry actions/>`, `<Sheet open onClose title>`.
- Toasts: `useToast()` -> `show({title, body, kind: info|success|error, placement?: "bottom"|"top"})`, `receipt({title, body})`
  (solid gold + haptic), `dismiss(id)`, `clear()` (drop all, e.g. on the first vote), `setPlacement("top"|"bottom"|null)`; `useToastPlacement("top")` pins placement while a
  component is mounted (call it on the phone VOTE view so toasts never cover the vote cards). Placement matters on phones only
  (md+ is top-right); the stack follows the newest toast. Default is "bottom", unchanged.
- `m` / `MotionScope` / `AnimatePresence` / `PHASE_TRANSITION` from `@/components/ui/motion` (LazyMotion, reducedMotion="user";
  `PHASE_TRANSITION` is now the 410 ms arrive transition).

## Landing
`/` = hero + `<RoundMiniature/>` (live looping example round built from the primitives above; still frame under reduced motion;
it also steps the page's stage light amber -> teal -> lilac per loop) + gold "Play a 60-second demo" + join + host link.

## Data and API (unchanged)
- `const r = useRoom(code, "player"|"screen"|"host")` (`@/lib/client/useRoom`) -> { state, me, feed, cheers, connection,
  offsetMs, unreachable, loading, error{code,message}, features, cookiesBlocked, cooldownUntil, channelId, sendIdea(text),
  vote(id), sendCheer(emoji), onReceipt(cb), onNotice(cb), refresh() }.
  error.code NO_SESSION on a player -> redirect to /join/CODE; NOT_FOUND / ROOM_FULL / BANNED -> show copy.
  unreachable -> `<FullScreenMessage onRetry={r.refresh}/>` (stable onRetry).
- sendIdea / vote resolve {ok:true} | {ok:false, code, message (friendly)}. Feed items:
  {key, name, text, mine, isBot, status: "pending"|"sent"|"rejected", rejectCode}.
  Cooldown ring: useCountdown({ endsAt: cooldownUntil || null, startedAt: cooldownUntil - 2000 }).
- Session/API: `ensureSession(name)`, `getStoredName()` (`@/lib/client/session`), `randomName()` (`@/lib/copy`);
  `@/lib/client/api`: createRoom, getRoom, hostAction(code, key, action), getHostFeed, startTry, getMe, getStory,
  getImpact, ... all return {ok:true,...} | {ok:false, code, message}, never throw.
- `@/lib/copy`: COPY, PHASE_LABEL, phaseAnnouncement, DISTILL_LINES, STORM_NUDGES, CHEER_EMOJI,
  friendlyError(code, fallback), creditLine(credit, more) ("@a, @b + N others", robot for bots), randomName().
- Presets: `PRESETS` from `@/lib/presets` (data-only, safe on the client).

## Shared dev server
The orchestrator runs ONE dev server at http://localhost:3000 (mock modes, DB in ./.data/dev). Do not start another
`next dev` (Next 16 locks .next/dev). To look at pages, write a throwaway Playwright script in
H:\ClaudeData\Temp-claude\<your-area>\ and run it with `node` (chromium is installed; import from
`@playwright/test` resolved from H:\Nexconn\node_modules). Drive rooms through the HTTP API (POST /api/session,
POST /api/rooms, POST /api/rooms/CODE/host with x-host-key, ...). If the server is down or a route 500s because
another area is unfinished, keep building against the contracts and report it.
Turbopack lags several seconds behind a CSS edit while other agents touch the filesystem: poll the served stylesheet for
a marker string before judging a screenshot (stale CSS looks like your change did nothing).

## e2e hooks (keep these stable; the e2e agent depends on them)
- Root of every room page: `data-testid="phase"` with `data-phase="<PHASE>"`.
- Player: `idea-input`, `idea-send`, `feed-item` (with `data-mine="1"` on own), `option-A|B|C` (button),
  `data-selected="1"` on the chosen option, `receipt-moment` (full-screen canon moment), `narration`, `credits`,
  `connection-banner`, `starter-chip`, `cheer-<emoji>`.
- Host: `host-primary` (the big phase button), `host-pause`, `host-extend`, `host-auto`, `host-strict`, `host-voice`,
  `veto-<optionId>`, `forcewin-<optionId>`, `host-reroll`, `idea-delete-<ideaId>`, `mute-<userId>`, `ban-<userId>`,
  `fallback-warning`, `host-links`.
- Screen: `screen-rain-item`, `screen-option-A|B|C`, `screen-outcome`, `screen-credits`, `screen-qr`.
