"use client";
// PlayerView: the whole player experience for one room (UX §3.3, design-v3 "Live Sketchnote"). /play/[code] renders it
// full page; Judge Mode (/try) embeds the very same component.
//
//   <PlayerView code="ABCDE" coach={(step) => step && <Mark>{...}</Mark>} onEvent={(e) => ...} />
//
//   code     room code (any case)
//   coach    optional render slot, called every render with the current guided step
//            ("type" in STORM before my first idea, "watch" after it and during DISTILL, "vote" in VOTE
//            until I tap, otherwise null). Whatever it returns sits in the flow just above the dock, so it
//            pushes the content up instead of covering it, and it steps aside while the keyboard is open.
//   onEvent  { type: "idea", text } after an idea was accepted, { type: "vote", optionId } after a vote
//            landed, { type: "receipt", receipt } when a BALLOT/CANON receipt arrives.
//   backdrop the page's grain layer (default true); pass false when the page renders its own <StageBackdrop>.
//   className  size it from the outside; it fills 100% of its parent's height and never scrolls itself.
// Layout: header (56 px) / body (fills; only the feed or the card list scrolls) / dock (a paper bar with an ink outline
// holding the composer and the cheers, floating above the safe area; it overlaps the body's last 36 px, so every body
// scrolls behind the bar: each one pads its bottom with var(--dock-pad), which this component sets to 44 px when a dock
// is showing). Toasts sit at the top while this component is mounted, so none ever covers the composer or the vote boxes.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Ticket, Search, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { FullScreenMessage } from "@/components/ui/FullScreenMessage";
import { LiveRegion } from "@/components/ui/LiveRegion";
import { haptic } from "@/components/ui/motionTokens";
import { Skeleton } from "@/components/ui/Skeleton";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { useToast, useToastPlacement } from "@/components/ui/Toast";
import { useRoom } from "@/lib/client/useRoom";
import { COPY, friendlyError, PHASE_LABEL } from "@/lib/copy";
import type { ReceiptPayload } from "@/lib/realtime/types";
import { CanonMoment } from "./CanonMoment";
import { CheerBar, CheerFloat } from "./CheerBar";
import { Composer, type ComposerHandle } from "./Composer";
import { ConnectionPill } from "./ConnectionPill";
import { DistillStatus } from "./DistillStatus";
import { FinaleActions, FinaleView } from "./FinaleView";
import { getStoredLang, useVisualViewport } from "./hooks";
import { IdeaFeed, PromptStrip } from "./IdeaFeed";
import { bodyKey, composerLock, coachStep, dockHeight, dockKey, isLiveCanon, receiptKey, starterChips, translateView, type CoachStep } from "./logic";
import { PlayHeader } from "./PlayHeader";
import { PLAY_COPY } from "./playCopy";
import { RevealView } from "./RevealView";
import { LobbyView, PausedOverlay, PlayerSkeleton, PromptView } from "./StageViews";
import { VoteView } from "./VoteView";
import styles from "./play.module.css";

export type { CoachStep } from "./logic";

type PlayerEvent =
  | { type: "idea"; text: string }
  | { type: "vote"; optionId: string }
  | { type: "receipt"; receipt: ReceiptPayload };

type PlayerViewProps = {
  code: string;
  coach?: (step: CoachStep | null) => ReactNode;
  onEvent?: (event: PlayerEvent) => void;
  backdrop?: boolean;
  className?: string;
};

const subscribeNone = () => () => {};

/** How far the dock's paper bar reaches up over the body (px). The feed scrolls behind it; other bodies pad for it. */
const DOCK_OVERLAP = 36;
const BALLOT_TOAST_MS = 3500;
const BALLOT_TOAST_CHARS = 60;

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

export function PlayerView({ code: rawCode, coach, onEvent, backdrop = true, className }: PlayerViewProps) {
  const code = rawCode.toUpperCase();
  const r = useRoom(code, "player");
  const { state, me } = r;
  const router = useRouter();
  const toast = useToast();
  useToastPlacement("top");
  const keyboardOpen = useVisualViewport()?.keyboard ?? false;
  const lang = useSyncExternalStore(subscribeNone, getStoredLang, () => "en");

  const [announce, setAnnounce] = useState("");
  const [canon, setCanon] = useState<{ text: string } | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [ideasSent, setIdeasSent] = useState(0);
  const [ballot, setBallot] = useState<{ round: number; text: string } | null>(null);

  const composerRef = useRef<ComposerHandle>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const seenReceipts = useRef<Set<string>>(new Set());
  const canonRef = useRef<{ text: string } | null>(null);
  const stateRef = useRef(state);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    stateRef.current = state;
    onEventRef.current = onEvent;
  });

  const roundNo = state?.roundNo ?? 0;
  const phase = state?.phase;

  // ---------- receipts, notices, cookies, redirects ----------

  const finishCanon = useCallback(() => {
    const c = canonRef.current;
    if (!c) return;
    canonRef.current = null;
    setCanon(null);
    // The moment already buzzed; the toast it collapses into stays quiet and sits low, away from the winner card.
    toast.show({ kind: "receipt", title: COPY.reveal.canon, body: c.text, placement: "bottom" });
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
            toast.receipt({ title: COPY.reveal.canon, body: rc.ideaText, placement: "bottom" });
          }
        } else {
          haptic("tap");
          setBallot({ round: rc.roundNo, text: rc.ideaText });
          // Two lines at most, so on a 360 px phone it fits the lane above the vote boxes.
          const body = rc.ideaText.length > BALLOT_TOAST_CHARS ? `${rc.ideaText.slice(0, BALLOT_TOAST_CHARS - 1).trimEnd()}…` : rc.ideaText;
          toast.show({ kind: "receipt", title: PLAY_COPY.play.reveal.ballotTitle, body, durationMs: BALLOT_TOAST_MS });
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

  // ---------- actions (all stable, so the feed and the composer never re-render for them) ----------

  const { sendIdea, vote, sendCheer } = r;
  const myVote = me?.vote ?? null;

  const onSend = useCallback(
    async (text: string) => {
      const res = await sendIdea(text);
      if (res.ok) {
        setIdeasSent((n) => n + 1);
        onEventRef.current?.({ type: "idea", text });
      }
      return res;
    },
    [sendIdea],
  );

  const onEdit = useCallback((text: string) => composerRef.current?.edit(text), []);

  const onVote = useCallback(
    async (optionId: string) => {
      if (myVote === optionId) return;
      // The first vote clears the "on the ballot" toast; it has done its job.
      if (!myVote) toast.clear();
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

  const preset = state?.preset;
  const chips = useMemo(() => starterChips(preset), [preset]);
  const toggleOriginal = useCallback(() => setShowOriginal((v) => !v), []);

  // ---------- fatal and blocking states ----------

  const home = (
    <ButtonLink href="/" variant="secondary">
      {PLAY_COPY.play.notFound.action}
    </ButtonLink>
  );
  const iconProps = { "aria-hidden": true, className: "size-9" } as const;
  if (errorCode && errorCode !== "NO_SESSION") {
    if (errorCode === "NOT_FOUND" || errorCode === "ROOM_NOT_FOUND") {
      return <FullScreenMessage icon={<Search {...iconProps} />} title={PLAY_COPY.play.notFound.title} body={PLAY_COPY.play.notFound.body} actions={home} retryEveryMs={0} />;
    }
    if (errorCode === "ROOM_FULL") {
      return (
        <FullScreenMessage
          icon={<Ticket {...iconProps} />}
          title={PLAY_COPY.play.full.title}
          body={PLAY_COPY.play.full.body}
          actions={
            <ButtonLink href={`/screen/${code}`} variant="secondary">
              {PLAY_COPY.play.full.action}
            </ButtonLink>
          }
          retryEveryMs={0}
        />
      );
    }
    if (errorCode === "BANNED") {
      return <FullScreenMessage icon={<Ban {...iconProps} />} title={friendlyError("BANNED")} body={PLAY_COPY.play.banned.body} actions={home} retryEveryMs={0} />;
    }
    return <FullScreenMessage title={COPY.states.error.title} body={r.error?.message || COPY.states.error.body} actions={home} retryEveryMs={0} />;
  }
  if (me?.banned) {
    return <FullScreenMessage icon={<Ban {...iconProps} />} title={friendlyError("BANNED")} body={PLAY_COPY.play.banned.body} actions={home} retryEveryMs={0} />;
  }

  // ---------- content ----------

  const tr = state ? translateView(state, lang, showOriginal) : null;
  const mineIds = me?.myOptionIds ?? [];
  const lock =
    state && phase
      ? composerLock({ phase, paused: state.paused, connection: r.connection, banned: Boolean(me?.banned), muted: Boolean(me?.muted) })
      : null;
  const step = state && phase ? coachStep({ phase, ideasThisRound: me?.ideasThisRound ?? 0, voted: Boolean(me?.vote) }) : null;
  const coachNode = coach && !keyboardOpen ? coach(step) : null;
  const cheersOn = Boolean(r.features?.cheers);
  const dk = phase ? dockKey(phase) : "none";
  const showCheers = cheersOn && !keyboardOpen && dk !== "finale";
  const hasDock = dk !== "none" || showCheers;

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
            <IdeaFeed feed={r.feed} ideasInRound={state.stats.ideasThisRound} closed={phase === "DISTILL"} onEdit={onEdit} dim={phase === "DISTILL"} />
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
            ballotIdea={ballot?.round === roundNo ? ballot.text : null}
            disabled={state.paused || phase !== "VOTE"}
            label={tr.label}
            onVote={(id) => void onVote(id)}
          />
        ) : (
          <div role="status" className="flex h-full flex-col gap-4 pt-9 pb-[var(--dock-pad,8px)]">
            <span className="sr-only">{PLAY_COPY.play.loading}</span>
            <Skeleton className="flex-1 rounded-card" />
            <Skeleton className="flex-1 rounded-card" />
            <Skeleton className="flex-1 rounded-card" />
          </div>
        );
      case "reveal":
        return <RevealView state={state} narration={tr.narration} label={tr.label} mineIds={mineIds} votedId={myVote} />;
      case "finale":
        return <FinaleView state={state} meName={me?.displayName ?? null} ideasSentHere={ideasSent} />;
    }
  }

  function dockSlot(): ReactNode {
    if (!state || !phase) return null;
    switch (dk) {
      case "composer":
        return <Composer ref={composerRef} roundNo={roundNo} lockedHint={lock} chips={chips} cooldownUntil={r.cooldownUntil} onSend={onSend} />;
      case "distill":
        return <DistillStatus ideas={state.stats.ideasThisRound} />;
      case "finale":
        return <FinaleActions showId={state.showId} onShare={(id) => void share("story", id)} />;
      case "none":
        return null;
    }
  }

  return (
    <div
      data-testid="phase"
      data-phase={phase ?? "LOADING"}
      data-round={roundNo || undefined}
      className={cn("relative mx-auto flex h-full min-h-0 w-full max-w-[480px] flex-col overflow-hidden md:border-x-2 md:border-dashed md:border-ink-faint/50", className)}
    >
      {backdrop ? <StageBackdrop /> : null}
      {state && !r.unreachable ? <ConnectionPill status={r.connection} /> : null}
      <LiveRegion message={announce} />

      {!state || !phase || !tr ? (
        <PlayerSkeleton />
      ) : (
        <>
          <h1 ref={headingRef} tabIndex={-1} className="sr-only focus:outline-none">
            {state.title}. {PHASE_LABEL[phase]}
          </h1>

          <PlayHeader state={state} offsetMs={r.offsetMs} translate={tr.available ? { showOriginal, onToggle: toggleOriginal } : null} />

          <div className="relative flex min-h-0 flex-1 flex-col px-4" style={{ ["--dock-pad" as string]: hasDock ? "44px" : "8px" }}>
            <div className="relative min-h-0 flex-1">
              <div key={bodyKey(phase)} className={cn("h-full min-h-0", styles.settle)}>
                {body()}
              </div>
              {cheersOn ? <CheerFloat cheers={r.cheers} /> : null}
            </div>
            {coachNode ? <div className="relative z-10 shrink-0 pt-2 empty:hidden">{coachNode}</div> : null}
          </div>

          {hasDock ? (
            <div className="relative z-10 shrink-0 px-3 pb-[max(8px,var(--safe-bottom))]" style={{ marginTop: -DOCK_OVERLAP }}>
              <div className="slip rounded-sheet p-2">
                {dk !== "none" ? (
                  <div key={dk} className={styles.fade} style={{ minHeight: dockHeight(phase) }}>
                    {dockSlot()}
                  </div>
                ) : null}
                {showCheers ? (
                  <div className={cn(dk !== "none" && "mt-1 border-t-2 border-dashed border-ink-faint/60 pt-1")}>
                    <CheerBar onCheer={sendCheer} disabled={r.connection !== "connected"} />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {state.paused ? <PausedOverlay /> : null}
        </>
      )}

      {canon ? <CanonMoment ideaText={canon.text} onDone={finishCanon} /> : null}

      {r.unreachable ? (
        <FullScreenMessage
          icon={<WifiOff {...iconProps} />}
          title={COPY.states.unreachable.title}
          body={COPY.states.unreachable.body}
          onRetry={r.refresh}
          actions={
            <Link href="/" className="inline-flex min-h-11 items-center text-body text-ink-notes underline-offset-4 hover:underline">
              {PLAY_COPY.play.notFound.action}
            </Link>
          }
        />
      ) : null}
    </div>
  );
}
