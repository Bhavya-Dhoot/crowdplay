# UI kit for page builders (design v3 "Live Sketchnote"; spec: plans/design-v3.md; read each file's header comment)

Idea: every surface is ONE PAGE OF NOTES. Warm dot-grid paper, a black fineliner (ink), a grey marker for volume and shadow, and
ONE yellow marker that follows the thread: your idea, your vote, the winner, CANON, the single primary action. Everything else is
black ink and grey marker. Light only. If a view has yellow on more than the thread, the numbered banners, the fat arrows and the
one primary button, it is wrong. Things are DRAWN (SVG stroke-dashoffset, marker swipe) or PLACED (opacity + 6 px settle), never
slid across or bounced. Reduced motion: strokes appear complete, no confetti, no boil, same layout.

## Core rules for page agents
- Import primitives individually: `@/components/ui/<Name>` (no barrel). Each page renders its own `<main id="main">`.
- The page is `html` (dot-grid paper). Render `<StageBackdrop />` once per page (adds one static grain layer; its old props are
  ignored). Do NOT render it for the OBS overlay (`?obs=1` sets html/body transparent).
- A card is paper laid on top: `<PaperCard>` / `<Card>` hide the dots. Text: `text-ink` (primary), `text-ink-notes` (secondary,
  6.8:1 on paper, the floor for text), `text-ink-faint` (decoration and large text only). Error text: `text-danger` + icon + words.
- Fonts: Kalam 700 (`font-display`) for titles, banners, keywords, room codes, big numbers, buttons; Patrick Hand 400
  (`font-sans`, the default) for everything else. One weight per face: do not use font-semibold/bold on body text (it does
  nothing; browsers must not fake it). Display sizes >= 40 px may carry a tiny seeded tilt (`rotate(-1..1deg)`), never UI labels.
- Max four type sizes per view. Phone body 17 px, host console >= 16 px, 15 px fine print only.
- One yellow `<Button variant="primary">` per view. Secondary = paper key. Never two yellow keys.
- Focus ring is global: 3 px ink at 3 px offset on every interactive element. Touch targets >= 44 px (all primitives are).
- Anything seeded (tilt, wobble) comes from a stable key (id, slot, index): `tiltOf(id)`, `seed` props. NEVER Math.random in render.
- Reward moments are DRAWN: pen check on send, marker swipe under a note that made the ballot, pen circle + swash on your vote,
  pen loop + CANON ribbon + confetti on the winner. Pair taps with `haptic("tap")`, canon with `haptic("canon")`.
- Frequent actions (typing, scrolling, changing a vote) get press feedback only.

## Tokens (CSS variables in src/styles/tokens.css; Tailwind utilities from globals.css)
- Paper and ink: `bg-paper` (page) / `bg-paper-raised` (cards), `bg-dots`, `text-ink`, `text-ink-notes`, `text-ink-faint`,
  `border-ink`. Dot grid var: `--dot-grid`; opaque dot-grid class for overlays: `.dot-grid`.
- Markers: `bg-marker-1` (volume, fills) / `bg-marker-2` (shadows, ribbon tails) / `bg-marker-3` (folds, small dark parts);
  `bg-hl` (translucent yellow marker), `bg-hl-solid` (#FFD23F, the primary key face), `text-hl-deep` / `border-hl-deep`
  (#F5AA00: sparks, the canon loop, your note's edge). Status: `text-danger`, `border-danger` (#B4321F, small areas only).
  No green, no blue. Success is a drawn ink check; "live" is an ink dot that pulses.
- Lines: `border-2 border-ink` chips/inputs, 2.5 px cards and boxes (`--line`), 3 px buttons (`--line-3`).
- Hand-drawn radii (never a perfect round): `rounded-card`, `rounded-card-alt` (alternate on siblings), `rounded-pill`,
  `rounded-blob` (letter circles, avatars), `rounded-element`, `rounded-inner`, `rounded-sheet`.
- Shadows are grey marker, always down-right, no blur: `shadow-marker` 6/7 (cards), `shadow-pen` 4/4 ink (buttons),
  `shadow-poster` 9/10 (big boxes), `shadow-slip` 4/5 (toasts, composer bar).
- Type: `text-fine 15 / small 16 / body 17 / lead 20 / h3 24 / h2 32 / h1 34-44 (fluid) / display 44-64 (fluid)`; screen scale
  `text-screen-sm 28 .. 3xl 86, 4xl 120, 5xl 180`. `tabular-nums` for numbers. Numbers that matter get a `<Swash>` or `<PenLoop>`.
- Motion: `ease-arrive`, `ease-exit`, `ease-pen`, `duration-175` / `duration-[410ms]` / `duration-[975ms]`; draw-ons: outline
  250-500 ms, check 220, canon loop 700. CSS helpers: `.placed` (+ `--placed-delay`), `.draw` / `.draw-fill` (`data-play`),
  `.ink-boil`, `.scribble` (hand underline on hover), `.press` (any non-Button control sinks 2 px on press), `.slip` (floating paper
  slip: ink outline + marker shadow; for your own composer bar / host top bar).
- `@/components/ui/motionTokens`: `DURATION`, `DURATION_MS`, `EASE` (arrive, exit, pen), `DRAW_MS` {outline 400, check 220, loop 700,
  swipe 410}, `SPRING.*`, `TRANSITION.*` (framer), `haptic("tap"|"reject"|"canon")`, `springToLinear(k, c)`.
- `@/components/ui/doodle` (pure, seeded): `tiltOf(key, max=2.5)`, `seeded(key)`, `hash32`, and the path makers the primitives use
  (`loopPath`, `roundLoopPath`, `ringPath`, `boxPath`, `checkPath`, `underlinePath`, `arrowPath`).

### v2 aliases (temporary)
The "v2 aliases" blocks in tokens.css and globals.css keep the old names rendering as readable ink on paper until the pages move:
`bg-stage-0/1/2` (paper / paper-raised / light grey), `border-stage-line` (ink-faint), `text-on-stage` (ink), `text-muted-on-stage`
and `text-ink-muted` (ink-notes), `bg-paper-2`, `border-paper-edge` (ink-faint), `bg-gold`/`border-gold` (yellow; `text-gold` is
ink), `bg-gel-a/b/c` (three greys), `text-ok`/`bg-ok` (ink-notes), `bg-warn` (yellow; `text-warn` is ink), `bg-danger` (pale red
wash with ink text), `text-danger-on-paper`, `bg-light`/`text-light`/`border-light` (ink), `shadow-contact`, `.glass` (= `.slip`). Move to the v3 names; the block is deleted in the dead-code sweep. Old components: `Stamp` = `Ribbon`,
`GelDisc` = `LetterBadge`, `Card`, `StageBackdrop` props (ignored).

## Surfaces
- `<PaperCard tone="paper|paper-2" gel="a|b|c" edge="gold|wild" tilt={deg} seed={id} alt pressable as className/>` +
  `paperCardClass({ tone, gel, edge, pressable, alt, className })` for a `<button>` that IS the card. paper-raised fill, 2.5 px ink
  outline, hand radius, marker shadow. `edge="gold"` = YOUR note (yellow edge + corner swash); `wild` = dashed outline;
  `gel` = a small ink letter tab over the top edge (decorative: write the letter inside too, see LetterBadge); `seed` = stable
  tilt from an id; `alt` = alternate radius for every other sibling; `pressable` = presses into its shadow. Pass `rounded-*` for
  small cards. `<PaperCard seed={idea.id} edge={mine ? "gold" : undefined}>` for an idea note.
- `<Card tone="default|raised|accent|wild" as>`: plain paper panel (`p-4`); raised = greyer sheet, accent = yellow edge, wild = dashed.
- `<Skeleton className/>`, `<SkeletonText lines/>`: static grey marker streaks (`tone` prop accepted, ignored). Keep real sizes.
- `<QrCode value size label dark light/>`: drawn box (ink outline, shadow) around the code; scans at 15:1.
- `<StageBackdrop />`: the grain layer (see rules).

## Pen and marker primitives (all server-safe except PenLoop; all draw on mount unless `play={false}`)
- `<Swash play delayMs>text</Swash>`: yellow marker behind inline text (single line). `play` swipes it on (410 ms); default is a
  static, complete swash. `<Swash play>3 canon</Swash>`.
- `<PenCheck size play delayMs seed label/>`: drawn ink check (220 ms), `currentColor`. Send confirmation: `<PenCheck seed={idea.id}/>`.
- `<PenLoop seed tone="ink|yellow" shape="auto|ellipse|round" boil play delayMs className>child</PenLoop>` (client): measures its
  child and circles it by hand (700 ms). Ellipse for small things, rounded-rect for cards. Reaches up to 28 px (ellipse) / 14 px
  (round) beyond the child: leave room. The canon loop: `<PenLoop tone="yellow" boil className="block">winner card</PenLoop>`.
  Your vote: `<PenLoop seed={optionId}><LetterBadge .../></PenLoop>` (or LetterBadge `selected`).
- `<FatArrow direction="right|down|left|up" size play delayMs seed/>`: yellow-filled ink-outlined arrow with grey shadow; joins boxes,
  steps, scenes. `size` = length along its direction.
- `<InkUnderline play delayMs seed>text</InkUnderline>`: wavy underline drawn under inline text.
- `<Banner tone="paper|yellow" size="sm|md|lg|xl" dashed play delayMs boil seed>label</Banner>`: ribbon with grey notched tails (title
  banners: `size="xl"` paper; set other sizes with `className="[--b-px:36]"`). Keeps 0.95em margin each side for its tails.
- `<NumberBanner n label size play delayMs/>`: the numbered yellow banner for phase/section heads ("2 Vote"). Structural yellow.
- `<Ribbon kind="canon|wildcard|narrator|demo" size animate delayMs boil className/>`: label banner. canon = yellow, outline drawn then
  the word written (once); wildcard = dashed; narrator = "Narrator's pick"; demo = "Demo" (honest label). Position it yourself
  (`absolute -top-3 right-3`). Recolour: `className="[--stamp-bg:var(--ink)] [--stamp-fg:var(--hl-solid)]"`. `boil` only on the
  CANON ribbon / canon loop while REVEAL is on screen.
- `<LetterBadge letter="A|B|C" size selected animate/>`: ink letter in a hand-drawn blob; C shows the bolt (sr-only "C"). `selected` =
  the yellow marker fills it and the pen circles it (YOUR vote). `gelOf(letter)` gives PaperCard's `gel` prop.
- `fireDoodleConfetti({ origin, scalar, fire, zIndex })` (`@/components/ui/doodleConfetti`): ONE burst of ~60 doodle shapes (ink
  stars, squiggles, yellow dots; ink / #FFD23F / #8A867D only), ~1.2 s, no-op under reduced motion. `fire` = a function from
  `confetti.create(canvas)` for your own canvas (the big screen's layer). Replaces the per-page confetti code.
- `<ScriptText text cps={34} delayMs play caret onDone as className/>`: the note hand "written" by a typewriter; NEVER shifts layout
  (full text in flow, typed overlay); full text at once under reduced motion; `onDone` once per text. This is the pen writing
  narration.

## Controls and status
- `<Button variant="primary|secondary|ghost|danger|wild" size="sm|md|lg" loading block/>`, `<ButtonLink href/>`, `buttonClass({...})`.
  All >= 44 px. primary = yellow key (ONE per view), secondary = paper key, ghost = ink text with a hand underline on hover/focus,
  danger = paper key with `--danger` text, wild = dashed. Every key presses INTO its shadow (translate 4 px 4 px). Labels Kalam.
- `<Pill tone="neutral|accent|ok|warn|danger|wild|a|b|c|outline|paper" size="sm|md" active/>`: paper chip, 2 px ink outline. `active`
  (or tone accent / warn) = yellow marker behind the label; danger = danger text + outline; wild/outline = dashed.
- `<ProgressBar value label tone="accent|warn|danger|a|b|c|wild|light|ok"/>` (label required): hand-drawn bar filled with grey
  marker; accent / warn = yellow (the winner, YOUR vote), danger = `--danger`.
- `<CodeInput value onChange onComplete/>`: five hand-drawn squares; the box with the caret gets a yellow swash.
  `<JoinCodeForm variant="secondary|primary"/>` (secondary by default: primary only when joining IS the view's yellow action).
- `<Avatar name size/>` (initials in an ink-outlined blob, grey fill, no colours), `<BotBadge/>` after EVERY bot name (the honesty rule
  stays), `<NexconnBadge/>`, `<Footer/>` (dashed pen line + links).
- `<Countdown endsAt startedAt offsetMs paused size labelled/>`: hand-drawn circle; the ink arc is the time left (draws down);
  number in Kalam; the last 5 s the number gets a yellow swash. `<Ring fraction size stroke color track/>`, `useCountdown`,
  `useReducedMotion`. `<PhaseHeader state offsetMs/>` = "Scene N of M" + NumberBanner + Countdown, announces the phase (aria-live).
- `<ConnectionBanner status={connection}/>` (paper slip: ink spinner / drawn check), `<LiveRegion message={phaseAnnouncement(state)}/>`,
  `<FullScreenMessage title body onRetry actions icon/>` (dot-grid sheet), `<Sheet open onClose title>` (paper page with ink outline).
- Toasts: `useToast()` -> `show({title, body, kind: info|success|error, placement?})`, `receipt({title, body})` ("yours": yellow swash on
  the keyword "canon" or the last word, haptic), `dismiss(id)`, `clear()`, `setPlacement`; `useToastPlacement("top")` pins phones
  to the top (call it on the VOTE view so toasts never cover the vote cards). A toast is a paper slip with washi tape.
- `m` / `MotionScope` / `AnimatePresence` / `PHASE_TRANSITION` from `@/components/ui/motion` (LazyMotion, reducedMotion="user").

## Landing
`/` = title banner + the swash headline, the single yellow "Play a 2-minute demo" key, the 3-step strip (numbered banners, drawings and
yellow fat arrows drawn on load by `src/components/landing/StepDoodles.tsx`), the code row, a drawn "Host a show" link, footer.

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
H:\ClaudeData\Temp-claude\<your-area>\ and run it with `node` (chromium is installed; resolve `@playwright/test` with
`createRequire("H:/Nexconn/package.json")`). Drive rooms through the HTTP API (POST /api/session, POST /api/rooms,
POST /api/rooms/CODE/join, POST /api/rooms/CODE/host with x-host-key, ...); realtime pages never reach "networkidle", use
`domcontentloaded` + `[data-testid="phase"][data-phase="..."]`. The player phone joins through the UI (`/join/CODE`, `join-submit`).
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
- Landing: the code boxes are labelled "Show code, letter N of 5", the key is the button named "Join".
