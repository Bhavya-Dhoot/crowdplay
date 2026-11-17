"use client";
// Console column 2: a mirror of what the big screen shows, plus the moderator's hands on it.
//   scene / premise / finale     what the room is looking at (a paper note)
//   JoinCard + LobbyRoster       in LOBBY: the QR, the code and who has arrived (getting people in is job one)
//   OptionsBoard                 the three option boxes like the screen's (letter badge, grey marker bar), Veto and Force win;
//                                Re-roll once. The winner is circled by a yellow pen loop and wears the CANON ribbon
//   IdeaFeed                     newest first, paper notes with per-idea delete, blocked / removed styling, 🤖 on bots
// "Backup options used" shows as a pill here; players never see it (UX §4). Yellow stays on the thread: the winner and the
// story; every key here is paper (Veto is the danger one), because the one yellow key is the phase key.
import { Ban, Dices, Sparkles, Trash2, Trophy, TriangleAlert, Zap } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Banner } from "@/components/ui/Banner";
import { BotBadge } from "@/components/ui/BotBadge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { hash32, tiltOf } from "@/components/ui/doodle";
import { gelOf, LetterBadge } from "@/components/ui/LetterBadge";
import { AnimatePresence, m, MotionScope, PHASE_TRANSITION } from "@/components/ui/motion";
import { TRANSITION } from "@/components/ui/motionTokens";
import { paperCardClass, PaperCard } from "@/components/ui/PaperCard";
import { PenLoop } from "@/components/ui/PenLoop";
import { Pill } from "@/components/ui/Pill";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Ribbon } from "@/components/ui/Ribbon";
import { Skeleton } from "@/components/ui/Skeleton";
import { Swash } from "@/components/ui/Swash";
import type { HostFeedIdea, HostFeedPlayer, HostFeedRes, HostMetrics } from "@/lib/api/contracts";
import { creditLine } from "@/lib/copy";
import type { PublicOption, PublicState } from "@/lib/realtime/types";
import { controlAvailability, ideaStatusLabel, newestFirst, optionTag, votePercent } from "./consoleLogic";
import { IconButton } from "./controls";
import { JoinCard } from "./JoinCard";
import type { HostDesk } from "./useHostDesk";

type Props = {
  state: PublicState;
  feed: HostFeedRes | null;
  metrics: HostMetrics | null;
  desk: HostDesk;
  code: string;
  links: { join: string; screen: string; obs: string; host: string };
  /** The one players count of the console (the roster). */
  joined: number;
};

// ---------- scene ----------

function SceneCard({ state, compact }: { state: PublicState; compact: boolean }) {
  if (state.phase === "LOBBY") {
    return (
      <Card as="section" tone="raised" aria-label="Premise" className="p-5">
        <p className="font-display text-small">The premise</p>
        <p className="mt-1 text-body leading-7">{state.premise}</p>
      </Card>
    );
  }
  if (state.phase === "FINALE" || state.phase === "ENDED") {
    const f = state.finale;
    return (
      <Card as="section" aria-label="Story so far" className="relative p-5 pt-7">
        <Banner size="sm" className="absolute -top-[14px] left-3" seed={`story-${state.phase}`}>
          {state.phase === "ENDED" ? "The show is over" : "The finale"}
        </Banner>
        <h3 className="text-h3 leading-8">
          <Swash className="whitespace-normal">{f?.storyTitle || state.title}</Swash>
        </h3>
        {f?.tagline ? <p className="mt-2 text-ink-notes">{f.tagline}</p> : null}
        {f?.recap ? (
          <p className="mt-3 text-body leading-7">{f.recap}</p>
        ) : (
          <p className="mt-3 text-small text-ink-notes">The narrator is still writing the recap. It appears here and on the big screen when it is ready.</p>
        )}
        {f && f.canonMakers.length > 0 ? (
          <p className="mt-3 text-small text-ink-notes">
            Canon makers: <span className="text-ink">{creditLine(f.canonMakers.slice(0, 5).map((c) => ({ name: c.name, bot: c.bot })), Math.max(0, f.canonMakers.length - 5))}</span>
          </p>
        ) : null}
      </Card>
    );
  }
  return (
    <Card as="section" tone="raised" aria-label={`Scene for round ${state.roundNo} of ${state.roundsTotal}`} className={compact ? "px-5 py-3" : "p-5"}>
      <h3 className={cn("leading-7", compact ? "text-lead" : "text-h3 leading-8")}>{state.prompt?.title ?? "Loading the scene…"}</h3>
      {state.prompt?.text && !compact ? <p className="mt-2 text-body leading-7 text-ink-notes">{state.prompt.text}</p> : null}
    </Card>
  );
}

// ---------- lobby ----------

const LOBBY_CHIPS = 24;

function LobbyRoster({ players, joined }: { players: HostFeedPlayer[]; joined: number }) {
  const shown = players.filter((p) => !p.banned).slice(0, LOBBY_CHIPS);
  const extra = shown.length > 0 ? Math.max(0, joined - shown.length) : 0;
  return (
    <Card as="section" aria-label="Who is in the room" data-testid="host-lobby-roster">
      <h3 className="text-lead leading-6">{joined === 0 ? "Waiting for the first player" : `${joined} in the room`}</h3>
      {joined === 0 ? (
        <p className="mt-1 text-small text-ink-notes">Share the code or let people scan the QR. They show up here as they join.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {shown.map((p) => (
            <m.li
              key={p.userId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={TRANSITION.medium}
              className="inline-flex min-h-10 items-center gap-2 rounded-pill border-2 border-ink bg-paper-raised py-1 pr-3 pl-1 shadow-[2px_3px_0_var(--marker-2)]"
            >
              <Avatar name={p.name} size={30} />
              <span className="text-small">{p.name}</span>
              {p.isBot ? <BotBadge /> : null}
            </m.li>
          ))}
          {extra > 0 ? <li className="inline-flex min-h-10 items-center px-2 text-small text-ink-notes">+ {extra} more</li> : null}
        </ul>
      )}
    </Card>
  );
}

// ---------- options ----------

function OptionRow({
  option,
  votes,
  total,
  winner,
  dimmed,
  controls,
  replacing,
  desk,
  onVeto,
}: {
  option: PublicOption;
  votes: number;
  total: number;
  winner: boolean;
  dimmed: boolean;
  controls: boolean;
  replacing: boolean;
  desk: HostDesk;
  onVeto: (optionId: string) => void;
}) {
  const pct = votePercent(votes, total);
  const tag = optionTag(option);
  const wild = option.kind === "wildcard";
  const credit = creditLine(option.credit, option.more);
  return (
    <li
      data-testid={`host-option-${option.slot}`}
      data-option-id={option.id}
      className="relative"
    >
      <PaperCard as="div" gel={gelOf(option.slot)} edge={wild ? "wild" : undefined} alt={option.slot === "B"} className={cn("p-4 pt-5", dimmed && "border-ink-faint shadow-none")}>
        <div className="flex items-start gap-3">
          <LetterBadge letter={option.slot} size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-body leading-6 break-words">{replacing ? "Finding a replacement…" : option.label}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-small text-ink-notes">
              {tag ? (
                <Pill tone={wild ? "wild" : "paper"} size="sm">
                  {wild ? <Zap aria-hidden="true" className="size-3.5" /> : null}
                  {tag}
                </Pill>
              ) : null}
              {option.supporters > 0 ? (
                <span>
                  from {option.supporters} {option.supporters === 1 ? "idea" : "ideas"}
                </span>
              ) : null}
              {winner ? <span className="sr-only">Winner</span> : null}
            </div>
          </div>
          <p className="shrink-0 text-right font-display text-h3 leading-6 tabular-nums">
            {pct}%
            <span className="block font-sans text-small leading-5 text-ink-notes">
              {votes} {votes === 1 ? "vote" : "votes"}
            </span>
          </p>
        </div>
        <ProgressBar value={pct / 100} label={`Option ${option.slot}, ${pct} percent`} tone={winner ? "accent" : "light"} className="mt-3" />
        {credit || controls ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
            {credit ? (
              <p className="flex min-w-0 flex-1 basis-36 items-start gap-1.5 text-small text-ink-notes">
                <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {credit}
              </p>
            ) : (
              <span className="flex-1" />
            )}
            {controls ? (
              <div className="flex gap-3">
                <Button variant="danger" size="sm" data-testid={`veto-${option.id}`} disabled={replacing} loading={desk.busy.has(`veto:${option.id}`)} onClick={() => onVeto(option.id)}>
                  <Ban aria-hidden="true" className="size-4" />
                  Veto
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid={`forcewin-${option.id}`}
                  disabled={replacing}
                  loading={desk.busy.has(`win:${option.id}`)}
                  onClick={() => void desk.run(`win:${option.id}`, { action: "forceWin", optionId: option.id })}
                >
                  <Trophy aria-hidden="true" className="size-4" />
                  Force win
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </PaperCard>
      {winner ? (
        <>
          <PenLoop tone="yellow" shape="round" boil seed={option.id} className="pointer-events-none absolute inset-0 block">
            <span className="block size-full" />
          </PenLoop>
          <Ribbon kind="canon" size="sm" boil className="absolute -top-3 right-4 z-10" />
        </>
      ) : null}
    </li>
  );
}

const optionSig = (opts: readonly PublicOption[]) => opts.map((o) => o.id).join("|");

function OptionsBoard({ state, desk }: { state: PublicState; desk: HostDesk }) {
  const options = state.options ?? [];
  const can = controlAvailability(state);
  const total = state.votesTotal ?? Object.values(state.tally ?? {}).reduce((a, b) => a + b, 0);
  const winnerId = state.phase === "REVEAL" ? state.outcome?.optionId : undefined;
  const sig = optionSig(options);

  // A veto swaps one option for the next best candidate. Show "Finding a replacement…" on that row
  // until the ballot changes (or 6 s pass), so the click visibly did something.
  const [vetoed, setVetoed] = useState<{ id: string; sig: string } | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    [],
  );
  const onVeto = (optionId: string) => {
    const at = sig;
    void desk.run(`veto:${optionId}`, { action: "veto", optionId }).then((ok) => {
      if (!ok) return;
      setVetoed({ id: optionId, sig: at });
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setVetoed(null), 6000);
    });
  };

  return (
    <section aria-label="Options" className="space-y-5">
      <ul className="space-y-5">
        {options.map((o) => (
          <OptionRow
            key={o.id}
            option={o}
            votes={state.tally?.[o.id] ?? 0}
            total={total}
            winner={winnerId === o.id}
            dimmed={winnerId !== undefined && winnerId !== o.id}
            controls={can.canModerateVote}
            replacing={vetoed !== null && vetoed.id === o.id && vetoed.sig === sig}
            desk={desk}
            onVeto={onVeto}
          />
        ))}
      </ul>
      {state.phase === "REVEAL" && state.outcome ? (
        <PaperCard as="section" tone="paper-2" aria-label="Narration" className="p-5">
          <p className="text-body leading-7">{state.outcome.narration ?? <span className="text-ink-notes">The narrator is writing…</span>}</p>
          {state.outcome.credit.length > 0 ? (
            <p className="mt-3 flex items-start gap-1.5 text-small">
              <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {creditLine(state.outcome.credit, state.outcome.more)}
            </p>
          ) : null}
        </PaperCard>
      ) : null}
    </section>
  );
}

// ---------- ideas ----------

const IdeaRow = memo(function IdeaRow({
  idea,
  removing,
  authorBanned,
  onDelete,
  busy,
}: {
  idea: HostFeedIdea;
  removing: boolean;
  authorBanned: boolean;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const status = removing ? "deleted" : idea.status;
  const label = ideaStatusLabel(status, authorBanned);
  return (
    <m.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={TRANSITION.medium}
      data-testid="host-idea"
      data-status={status}
      data-surface="paper"
      style={{ "--tilt": `${tiltOf(idea.id, 0.7)}deg` } as CSSProperties}
      className={cn(
        paperCardClass({ tone: status === "ok" ? "paper" : "paper-2", alt: hash32(idea.id) % 2 === 0 }),
        "flex items-center gap-3 rounded-element py-2 pr-1 pl-3 shadow-slip",
        status === "blocked" && "border-danger",
        status === "deleted" && "border-dashed border-ink-faint shadow-none",
      )}
    >
      <Avatar name={idea.name} size={32} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-small leading-5 text-ink-notes">
          <span className="truncate">{idea.name}</span>
          {idea.isBot ? <BotBadge /> : null}
          {label ? <span className={cn("shrink-0", status === "blocked" && "text-danger")}>{label}</span> : null}
        </p>
        <p className={cn("text-body leading-6 break-words", status !== "ok" && "line-through decoration-ink-faint")}>{idea.text}</p>
      </div>
      {status === "ok" ? (
        <IconButton label={`Delete idea from ${idea.name}`} tone="danger" data-testid={`idea-delete-${idea.id}`} loading={busy} onClick={() => onDelete(idea.id)}>
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      ) : (
        <span className="size-11 shrink-0" aria-hidden="true" />
      )}
    </m.li>
  );
});

const FEED_RENDER_CAP = 120;

function IdeaFeed({ ideas, players, state, desk }: { ideas: HostFeedIdea[]; players: HostFeedPlayer[]; state: PublicState; desk: HostDesk }) {
  const ordered = useMemo(() => newestFirst(ideas), [ideas]);
  const bannedIds = useMemo(() => new Set(players.filter((p) => p.banned).map((p) => p.userId)), [players]);
  const shown = ordered.slice(0, FEED_RENDER_CAP);
  const run = desk.run;
  const onDelete = useCallback((id: string) => void run(`del:${id}`, { action: "deleteIdea", ideaId: id }, { key: `del:${id}`, value: true }), [run]);
  const storming = state.phase === "STORM" || state.phase === "PROMPT";
  return (
    <section aria-label="Idea feed" className="flex min-h-[260px] flex-1 flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-lead leading-6">Ideas this round</h3>
        <p className="font-display text-small tabular-nums" data-testid="host-idea-count">
          {state.stats.ideasThisRound} {state.stats.ideasThisRound === 1 ? "idea" : "ideas"}
        </p>
      </div>
      <div className="host-scroll -mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2" aria-live="off">
        {shown.length === 0 ? (
          <div className="grid h-full min-h-40 place-items-center rounded-card border-2 border-dashed border-ink-faint px-6 py-8 text-center">
            <div>
              <p className="font-display text-lead">{storming ? "No ideas yet" : "Nothing came in this round"}</p>
              <p className="mt-1 text-small text-ink-notes">
                {storming ? "They land here the moment players type. Delete any you don't want on the screen." : "The narrator fills the options when the room is quiet."}
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-3 p-1" data-testid="host-ideas">
            {shown.map((idea) => (
              <IdeaRow
                key={idea.id}
                idea={idea}
                removing={desk.pending[`del:${idea.id}`] === true}
                authorBanned={desk.pending[`ban:${idea.userId}`] ?? bannedIds.has(idea.userId)}
                busy={desk.busy.has(`del:${idea.id}`)}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
        {ordered.length > FEED_RENDER_CAP ? (
          <p className="mt-3 text-center text-small text-ink-notes">
            Showing the newest {FEED_RENDER_CAP} of {ordered.length} ideas.
          </p>
        ) : null}
      </div>
    </section>
  );
}

// ---------- panel ----------

export function LivePanel({ state, feed, metrics, desk, code, links, joined }: Props) {
  const scroller = useRef<HTMLElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [state.phase, state.roundNo]);
  const hasOptions = (state.phase === "VOTE" || state.phase === "REVEAL") && (state.options?.length ?? 0) > 0;
  const can = controlAvailability(state);
  const rerollUsed = metrics?.rerollUsed ?? false;
  const showFeed = state.phase !== "LOBBY" && state.phase !== "FINALE" && state.phase !== "ENDED";
  const distilling = state.phase === "DISTILL";
  return (
    <section ref={scroller} aria-labelledby="live-title" className={paperCardClass({ alt: true, className: "host-scroll flex min-h-0 flex-col gap-5 p-4 lg:overflow-y-auto" })}>
      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="live-title" className="text-h3 leading-8">
          {state.phase === "LOBBY" ? "Get people in" : "On the big screen"}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {metrics?.fallbackUsed ? (
            <Pill tone="outline" data-testid="fallback-warning" title="The AI was slow or unavailable, so simple options were made instead. Players can't tell.">
              <TriangleAlert aria-hidden="true" className="size-3.5" />
              Backup options used
            </Pill>
          ) : null}
          {state.phase === "VOTE" && hasOptions ? (
            <Button
              variant="secondary"
              size="sm"
              data-testid="host-reroll"
              disabled={!can.canModerateVote || rerollUsed}
              loading={desk.busy.has("reroll")}
              onClick={() => void desk.run("reroll", { action: "reroll" })}
            >
              <Dices aria-hidden="true" className="size-4" />
              {rerollUsed ? "Re-roll used" : "Re-roll (1 left)"}
            </Button>
          ) : null}
        </div>
      </div>

      <MotionScope>
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={state.phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={PHASE_TRANSITION}
            className="shrink-0 space-y-5"
          >
            {state.phase === "LOBBY" ? <JoinCard code={code} links={links} variant="hero" /> : null}
            {state.phase === "LOBBY" ? <LobbyRoster players={feed?.players ?? []} joined={joined} /> : null}
            <SceneCard state={state} compact={hasOptions} />
            {distilling ? (
              <Card as="div" tone="raised" role="status" data-testid="host-distilling">
                <p className="font-display text-lead">
                  Reading {state.stats.ideasThisRound} {state.stats.ideasThisRound === 1 ? "idea" : "ideas"}…
                </p>
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </div>
              </Card>
            ) : null}
            {hasOptions ? <OptionsBoard state={state} desk={desk} /> : null}
          </m.div>
        </AnimatePresence>
        {showFeed ? <IdeaFeed ideas={feed?.ideas ?? []} players={feed?.players ?? []} state={state} desk={desk} /> : null}
      </MotionScope>
    </section>
  );
}
