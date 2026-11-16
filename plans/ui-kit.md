# UI kit for page builders (from the design-system agent; read the header comment of each file for details)

- Import primitives individually: `@/components/ui/<Name>` (no barrel). Each page renders its own `<main id="main">`.
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
- `<PhaseHeader state offsetMs/>` (announces phase via aria-live), `<Countdown endsAt startedAt offsetMs paused size labelled/>`,
  `<Ring fraction/>`, `useCountdown`, `useReducedMotion`.
- `<ConnectionBanner status={connection}/>`, `<LiveRegion message={phaseAnnouncement(state)}/>`,
  `<FullScreenMessage title body onRetry actions/>`.
- `useToast()` -> show({title, body, kind}), receipt({title, body}) (gold + vibrate 60), dismiss(id); `<Sheet open onClose title>`.
- `<Button variant="primary|secondary|ghost|danger|wild" size loading block/>`, `<ButtonLink href/>`,
  `<Card tone="default|raised|accent|wild"/>`, `<Pill tone="neutral|accent|ok|warn|danger|wild|a|b|c|outline"/>`,
  `<ProgressBar value label tone/>` (label required).
- `<CodeInput value onChange onComplete/>`, `<QrCode value size label light dark/>`, `<Avatar name/>`,
  `<BotBadge/>` after EVERY bot name, `<NexconnBadge/>`, `<Footer/>`, `<Skeleton/>`.
- `@/lib/copy`: COPY, PHASE_LABEL, phaseAnnouncement, DISTILL_LINES, STORM_NUDGES, CHEER_EMOJI,
  friendlyError(code, fallback), creditLine(credit, more) ("@a, @b + N others", 🤖 for bots), randomName().
- Tailwind tokens: bg-bg / bg-surface / bg-surface-2, border-line, text-text / text-muted / text-accent / text-ink,
  bg-opt-a / bg-opt-b / bg-opt-c, text-wild / ok / warn / danger, rounded-card / rounded-pill, font-display;
  CSS classes .glow-accent / .glow-wild / .skeleton. Animation: `m` / `MotionScope` from `@/components/ui/motion`
  (LazyMotion; reducedMotion="user"). Toasts are mounted in the root layout and sit at the bottom on phones.
- Presets: `PRESETS` from `@/lib/presets` (data-only, safe on the client).

## Shared dev server
The orchestrator runs ONE dev server at http://localhost:3000 (mock modes, DB in ./.data/dev). Do not start another
`next dev` (Next 16 locks .next/dev). To look at pages, write a throwaway Playwright script in
H:\ClaudeData\Temp-claude\<your-area>\ and run it with `node` (chromium is installed; import from
`@playwright/test` resolved from H:\Nexconn\node_modules). Drive rooms through the HTTP API (POST /api/session,
POST /api/rooms, POST /api/rooms/CODE/host with x-host-key, ...). If the server is down or a route 500s because
another area is unfinished, keep building against the contracts and report it.

## e2e hooks (keep these stable; the e2e agent depends on them)
- Root of every room page: `data-testid="phase"` with `data-phase="<PHASE>"`.
- Player: `idea-input`, `idea-send`, `feed-item` (with `data-mine="1"` on own), `option-A|B|C` (button),
  `data-selected="1"` on the chosen option, `receipt-moment` (full-screen canon moment), `narration`, `credits`,
  `connection-banner`, `starter-chip`, `cheer-<emoji>`.
- Host: `host-primary` (the big phase button), `host-pause`, `host-extend`, `host-auto`, `host-strict`, `host-voice`,
  `veto-<optionId>`, `forcewin-<optionId>`, `host-reroll`, `idea-delete-<ideaId>`, `mute-<userId>`, `ban-<userId>`,
  `fallback-warning`, `host-links`.
- Screen: `screen-rain-item`, `screen-option-A|B|C`, `screen-outcome`, `screen-credits`, `screen-qr`.
