"use client";
// PlayerView: the whole player experience for one room (UX §3.3). /play/[code] renders it full page;
// Judge Mode (/try) embeds the very same component.
//
//   <PlayerView code="ABCDE" coach={(step) => step && <Mark>{...}</Mark>} onEvent={(e) => ...} />
//
//   code     room code (any case)
//   coach    optional render slot, called every render with the current guided step
//            ("type" in STORM before my first idea, "watch" after it and during DISTILL, "vote" in VOTE
//            until I tap, otherwise null). Whatever it returns floats just above the composer.
//   onEvent  { type: "idea", text } after an idea was accepted, { type: "vote", optionId } after a vote
//            landed, { type: "receipt", receipt } when a BALLOT/CANON receipt arrives.
//   className  size it from the outside; it fills 100% of its parent's height and never scrolls itself.
// Layout: header (72 px) / body (fills; only the feed or the card list scrolls) / dock (composer,
// cheers; anchored above the safe area). Heights are reserved so phases never shift the page.
import { Languages, MessageCircleHeart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { FullScreenMessage } from "@/components/ui/FullScreenMessage";
import { LiveRegion } from "@/components/ui/LiveRegion";
import { AnimatePresence, m, MotionScope, PHASE_TRANSITION } from "@/components/ui/motion";
import { PhaseHeader } from "@/components/ui/PhaseHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useReducedMotion } from "@/lib/client/useReducedMotion";
import { useRoom } from "@/lib/client/useRoom";
import { COPY, friendlyError, PHASE_LABEL } from "@/lib/copy";
import type { ReceiptPayload } from "@/lib/realtime/types";
import { CanonMoment } from "./CanonMoment";
import { CheerBar } from "./CheerBar";
import { Composer } from "./Composer";
import { ConnectionPill } from "./ConnectionPill";
import { DistillStatus } from "./DistillStatus";
import { FinaleActions, FinaleView } from "./FinaleView";
import { getStoredLang, useVisualViewport } from "./hooks";
import { IdeaFeed, PromptStrip } from "./IdeaFeed";
import {
  bodyKey,
  composerLock,
  coachStep,
  dockHeight,
  isLiveCanon,
  receiptKey,
  starterChips,
  translateView,
  type CoachStep,
} from "./logic";
import { PLAY_COPY } from "./playCopy";
import { LobbyView, PausedOverlay, PlayerSkeleton, PromptView } from "./StageViews";
import { RevealView } from "./RevealView";
import { VoteView } from "./VoteView";

export type { CoachStep } from "./logic";

export type PlayerEvent =
  | { type: "idea"; text: string }
  | { type: "vote"; optionId: string }
  | { type: "receipt"; receipt: ReceiptPayload };

export type PlayerViewProps = {
  code: string;
  coach?: (step: CoachStep | null) => ReactNode;
  onEvent?: (event: PlayerEvent) => void;
  className?: string;
};

const subscribeNone = () => () => {};

async function shareLink(opts: { title: string; text: string; url: string }): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share(opts);
      return "shared";
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "shared";
  }
  try {
    await navigator.clipboard.writeText(opts.url);
    return "copied";
  } catch {
    return "failed";
  }
}

function DockHint({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <p className="flex h-[52px] items-center justify-center gap-2 text-center text-sm text-muted">
      {icon}
      {children}
    </p>
  );
}

export function PlayerView({ code: rawCode, coach, onEvent, className }: PlayerViewProps) {
  const code = rawCode.toUpperCase();
  const r = useRoom(code, "player");
  const { state, me } = r;
  const router = useRouter();
  const toast = useToast();
  const reduced = useReducedMotion();
  const keyboardOpen = useVisualViewport()?.keyboard ?? false;
  const lang = useSyncExternalStore(subscribeNone, getStoredLang, () => "en");

  const [draftBox, setDraftBox] = useState({ round: 0, text: "" });
  const [announce, setAnnounce] = useState("");
  const [canon, setCanon] = useState<{ text: string } | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [ideasSent, setIdeasSent] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const seenReceipts = useRef<Set<string>>(new Set());
  const canonRef = useRef<{ text: string } | null>(null);
  const stateRef = useRef(state);
  const feedRef = useRef(r.feed);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    stateRef.current = state;
    feedRef.current = r.feed;
    onEventRef.current = onEvent;
  });

  const roundNo = state?.roundNo ?? 0;
  const phase = state?.phase;
  const draft = draftBox.round === roundNo ? draftBox.text : "";
  const setDraft = useCallback((text: string) => setDraftBox({ round: roundNo, text }), [roundNo]);

  // ---------- receipts, notices, cookies, redirects ----------

  const finishCanon = useCallback(() => {
    const c = canonRef.current;
    if (!c) return;
    canonRef.current = null;
    setCanon(null);
    toast.receipt({ title: `🏆 ${COPY.reveal.canon}`, body: c.text });
  }, [toast]);

  const { onReceipt, onNotice } = r;
  useEffect(
    () =>
      onReceipt((rc) => {
        const key = receiptKey(rc);
        if (seenReceipts.current.has(key)) return;
        seenReceipts.current.add(key);
        onEventRef.current?.({ type: "receipt", receipt: rc });
        if (rc.type === "CANON") {
          if (isLiveCanon(rc, stateRef.current) && !canonRef.current) {
            canonRef.current = { text: rc.ideaText };
            setCanon({ text: rc.ideaText });
            setAnnounce(`${PLAY_COPY.play.reveal.canonBig}. ${rc.ideaText}`);
          } else {
            toast.receipt({ title: `🏆 ${COPY.reveal.canon}`, body: rc.ideaText });
          }
        } else {
          toast.receipt({ title: PLAY_COPY.play.reveal.ballotTitle, body: rc.ideaText });
        }
      }),
    [onReceipt, toast],
  );
  useEffect(() => onNotice((text) => toast.show({ title: text })), [onNotice, toast]);

  const cookiesBlocked = r.cookiesBlocked;
  useEffect(() => {
    if (cookiesBlocked) toast.show({ title: COPY.states.cookiesBlocked.title, body: PLAY_COPY.play.cookiesToast, durationMs: 9000 });
  }, [cookiesBlocked, toast]);

  const errorCode = r.error?.code;
  useEffect(() => {
    if (errorCode === "NO_SESSION") router.replace(`/join/${code}`);
  }, [errorCode, router, code]);

  // ---------- focus management ----------

  const prevPhaseKey = useRef("");
  const phaseKey = phase ? `${phase}:${roundNo}` : "";
  useEffect(() => {
    if (!phaseKey) return;
    const first = prevPhaseKey.current === "";
    prevPhaseKey.current = phaseKey;
    // STORM hands focus to the idea box itself (Composer); every other phase announces itself via its heading.
    if (first || phase === "STORM") return;
    headingRef.current?.focus({ preventScroll: true });
  }, [phaseKey, phase]);

  // ---------- actions ----------

  const { sendIdea, vote, sendCheer } = r;
  const myVote = me?.vote ?? null;

  const onSend = useCallback(
    async (text: string) => {
      const norm = text.replace(/\s+/g, " ").trim();
      const mineLike = () => feedRef.current.filter((f) => f.mine && f.text === norm).length;
      const before = mineLike();
      const res = await sendIdea(text);
      if (res.ok) {
        setIdeasSent((n) => n + 1);
        onEventRef.current?.({ type: "idea", text });
        return res;
      }
      // A refused idea that reached the feed shows its own message; one stopped before sending needs it in the composer.
      return { ...res, inFeed: mineLike() > before };
    },
    [sendIdea],
  );

  const onVote = useCallback(
    async (optionId: string) => {
      if (myVote === optionId) return;
      const res = await vote(optionId);
      if (res.ok) {
        const slot = stateRef.current?.options?.find((o) => o.id === optionId)?.slot;
        setAnnounce(slot ? `Your vote is in for option ${slot}.` : "Your vote is in.");
        onEventRef.current?.({ type: "vote", optionId });
      } else {
        toast.show({ kind: "error", title: PLAY_COPY.play.vote.failed, body: res.message });
      }
    },
    [vote, myVote, toast],
  );

  const share = useCallback(
    async (kind: "join" | "story", showId?: string) => {
      const origin = window.location.origin;
      const title = state?.title ?? COPY.brand;
      const opts =
        kind === "join"
          ? { title: PLAY_COPY.play.shareTitle, text: PLAY_COPY.play.shareText(title, code), url: `${origin}/join/${code}` }
          : { title, text: `${title}: the story the crowd wrote.`, url: `${origin}/story/${showId ?? ""}` };
      const result = await shareLink(opts);
      if (result === "copied") toast.show({ title: PLAY_COPY.play.copied, kind: "success" });
      else if (result === "failed") toast.show({ title: PLAY_COPY.play.copyFailed, body: opts.url, kind: "error" });
    },
    [state?.title, code, toast],
  );

  // ---------- fatal and blocking states ----------

  if (errorCode && errorCode !== "NO_SESSION") {
    const watch = (
      <ButtonLink href={`/screen/${code}`} variant="secondary">
        {PLAY_COPY.play.full.action}
      </ButtonLink>
    );
    const home = (
      <ButtonLink href="/" variant="secondary">
        {PLAY_COPY.play.notFound.action}
      </ButtonLink>
    );
    if (errorCode === "NOT_FOUND" || errorCode === "ROOM_NOT_FOUND") {
      return <FullScreenMessage icon="🔎" title={PLAY_COPY.play.notFound.title} body={PLAY_COPY.play.notFound.body} actions={home} retryEveryMs={0} />;
    }
    if (errorCode === "ROOM_FULL") {
      return <FullScreenMessage icon="🎟️" title={PLAY_COPY.play.full.title} body={PLAY_COPY.play.full.body} actions={watch} retryEveryMs={0} />;
    }
    if (errorCode === "BANNED") {
      return <FullScreenMessage icon="🚫" title={friendlyError("BANNED")} body={PLAY_COPY.play.banned.body} actions={home} retryEveryMs={0} />;
    }
    return (
      <FullScreenMessage
        title={COPY.states.error.title}
        body={r.error?.message || COPY.states.error.body}
        actions={home}
        retryEveryMs={0}
      />
    );
  }
  if (me?.banned) {
    return (
      <FullScreenMessage
        icon="🚫"
        title={friendlyError("BANNED")}
        body={PLAY_COPY.play.banned.body}
        actions={
          <ButtonLink href="/" variant="secondary">
            {PLAY_COPY.play.notFound.action}
          </ButtonLink>
        }
        retryEveryMs={0}
      />
    );
  }

  // ---------- content ----------

  const tr = state ? translateView(state, lang, showOriginal) : null;
  const mineIds = me?.myOptionIds ?? [];
  const lock =
    state && phase
      ? composerLock({ phase, paused: state.paused, connection: r.connection, banned: Boolean(me?.banned), muted: Boolean(me?.muted) })
      : null;
  const step = state && phase ? coachStep({ phase, ideasThisRound: me?.ideasThisRound ?? 0, voted: Boolean(me?.vote) }) : null;
  const coachNode = coach ? coach(step) : null;
  const cheersOn = Boolean(r.features?.cheers);

  function body(): ReactNode {
    if (!state || !phase || !tr) return null;
    switch (bodyKey(phase)) {
      case "lobby":
        return <LobbyView state={state} onShare={() => void share("join")} />;
      case "prompt":
        return <PromptView title={tr.prompt?.title ?? state.title} text={tr.prompt?.text ?? state.premise} />;
      case "storm":
        return (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <PromptStrip title={tr.prompt?.title ?? state.title} text={tr.prompt?.text ?? state.premise} ideas={state.stats.ideasThisRound} compact={keyboardOpen} />
            <IdeaFeed feed={r.feed} ideasInRound={state.stats.ideasThisRound} closed={phase === "DISTILL"} onEdit={(t) => {
              setDraft(t);
              inputRef.current?.focus({ preventScroll: true });
            }} dim={phase === "DISTILL"} />
          </div>
        );
      case "vote":
        return state.options && state.options.length > 0 ? (
          <VoteView
            options={state.options}
            tally={state.tally}
            votesTotal={state.votesTotal}
            selectedId={myVote}
            mineIds={mineIds}
            disabled={state.paused || phase !== "VOTE"}
            label={tr.label}
            onVote={(id) => void onVote(id)}
          />
        ) : (
          <div role="status" className="flex h-full flex-col gap-2.5">
            <span className="sr-only">{PLAY_COPY.play.loading}</span>
            <Skeleton className="flex-1 rounded-card" />
            <Skeleton className="flex-1 rounded-card" />
            <Skeleton className="flex-1 rounded-card" />
          </div>
        );
      case "reveal":
        return <RevealView state={state} narration={tr.narration} label={tr.label} mineIds={mineIds} reduced={reduced} />;
      case "finale":
        return <FinaleView state={state} meName={me?.displayName ?? null} ideasSentHere={ideasSent} />;
    }
  }

  function dock(): ReactNode {
    if (!state || !phase) return null;
    switch (phase) {
      case "PROMPT":
      case "STORM":
        return (
          <Composer
            draft={draft}
            onDraft={setDraft}
            lockedHint={lock}
            chips={starterChips(state.preset)}
            cooldownUntil={r.cooldownUntil}
            onSend={onSend}
            inputRef={inputRef}
          />
        );
      case "DISTILL":
        return <DistillStatus ideas={state.stats.ideasThisRound} />;
      case "LOBBY":
        return cheersOn ? <DockHint icon={<MessageCircleHeart aria-hidden="true" className="size-4 text-accent" />}>{PLAY_COPY.play.lobby.cheerHint}</DockHint> : <DockHint>{" "}</DockHint>;
      case "VOTE":
        return <DockHint>{myVote ? PLAY_COPY.play.vote.hintVoted : PLAY_COPY.play.vote.hint}</DockHint>;
      case "REVEAL":
        return <DockHint>{state.roundNo < state.roundsTotal ? PLAY_COPY.play.reveal.next : PLAY_COPY.play.reveal.finaleNext}</DockHint>;
      case "FINALE":
      case "ENDED":
        return <FinaleActions showId={state.showId} onShare={(id) => void share("story", id)} />;
    }
  }

  return (
    <MotionScope>
      <div
        data-testid="phase"
        data-phase={phase ?? "LOADING"}
        data-round={roundNo || undefined}
        className={cn("stage-light relative mx-auto flex h-full min-h-0 w-full max-w-[480px] flex-col overflow-hidden md:border-x md:border-line", className)}
      >
        {state && !r.unreachable ? <ConnectionPill status={r.connection} /> : null}
        <LiveRegion message={announce} />

        {!state || !phase || !tr ? (
          <PlayerSkeleton />
        ) : (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="sr-only focus:outline-none">
              {state.title}. {PHASE_LABEL[phase]}
            </h1>

            <div className="relative shrink-0 px-4">
              <PhaseHeader state={state} offsetMs={r.offsetMs} />
              {tr.available ? (
                <button
                  type="button"
                  data-testid="translate-toggle"
                  aria-pressed={showOriginal}
                  onClick={() => setShowOriginal((v) => !v)}
                  className="absolute top-0.5 right-[84px] inline-flex h-6 items-center gap-1 rounded-pill border border-line bg-surface px-2 text-xs font-medium text-muted before:absolute before:-inset-2.5 before:content-[''] hover:text-text"
                >
                  <Languages aria-hidden="true" className="size-3.5" />
                  {showOriginal ? PLAY_COPY.play.translate : PLAY_COPY.play.original}
                </button>
              ) : null}
            </div>

            <div className="relative min-h-0 flex-1 px-4">
              <AnimatePresence mode="wait" initial={false}>
                <m.div
                  key={bodyKey(phase)}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
                  transition={PHASE_TRANSITION}
                  className="h-full min-h-0"
                >
                  {body()}
                </m.div>
              </AnimatePresence>
            </div>

            <div className="relative shrink-0 border-t border-line/70 bg-bg/80 px-4 pt-2 pb-[max(8px,var(--safe-bottom))] backdrop-blur-md">
              {coachNode ? <div className="pointer-events-none absolute inset-x-4 bottom-full z-20 mb-2">{coachNode}</div> : null}
              <div
                className="overflow-hidden transition-[height] duration-[250ms] ease-out motion-reduce:transition-none"
                style={{ height: dockHeight(phase) }}
              >
                {dock()}
              </div>
              {cheersOn && !keyboardOpen ? <CheerBar cheers={r.cheers} onCheer={sendCheer} disabled={r.connection !== "connected"} /> : null}
            </div>

            <AnimatePresence>{state.paused ? <PausedOverlay key="paused" /> : null}</AnimatePresence>
          </>
        )}

        <AnimatePresence>{canon ? <CanonMoment key="canon" ideaText={canon.text} reduced={reduced} onDone={finishCanon} /> : null}</AnimatePresence>

        {r.unreachable ? (
          <FullScreenMessage
            icon="📡"
            title={COPY.states.unreachable.title}
            body={COPY.states.unreachable.body}
            onRetry={r.refresh}
            actions={
              <Link href="/" className="inline-flex min-h-11 items-center text-sm text-muted underline-offset-4 hover:underline">
                {PLAY_COPY.play.notFound.action}
              </Link>
            }
          />
        ) : null}
      </div>
    </MotionScope>
  );
}
