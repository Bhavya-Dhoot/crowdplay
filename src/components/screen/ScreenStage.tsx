"use client";
// ScreenStage: the big screen / stream overlay as a component, so /screen/[code] and the Judge Mode
// page (compact mini-screen, ~480 px wide) share one implementation.
//
//   <ScreenStage code="ABCDE" />                         full 16:9 stage, fills its parent
//   <ScreenStage code="ABCDE" compact />                 mini screen: 16:9 at the width of its parent
//   <ScreenStage code="ABCDE" obs qr />                  transparent OBS overlay, QR on request
//
// The parent of the full stage must have a size (the page gives it the whole viewport). The stage
// fits itself inside, letterboxed, and never reflows between phases: header, main region and
// footer have fixed heights, and each phase view fills the main region. Phase views change one at a
// time (old one out in 175 ms, new one in over 410 ms), so two headings never overlap.
import { Pause, Volume2, VolumeX, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ConnectionBanner } from "@/components/ui/ConnectionBanner";
import { FullScreenMessage } from "@/components/ui/FullScreenMessage";
import { LiveRegion } from "@/components/ui/LiveRegion";
import { AnimatePresence, m, MotionScope } from "@/components/ui/motion";
import { TRANSITION } from "@/components/ui/motionTokens";
import { paperCardClass } from "@/components/ui/PaperCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { useReducedMotion } from "@/lib/client/useReducedMotion";
import { useRoom } from "@/lib/client/useRoom";
import { COPY, phaseAnnouncement } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { ConfettiLayer } from "./ConfettiLayer";
import { SCREEN_COPY } from "./copy";
import { DistillView } from "./DistillView";
import { EndedView } from "./EndedView";
import { FinaleView } from "./FinaleView";
import { LobbyView } from "./LobbyView";
import { PromptView } from "./PromptView";
import { RevealView } from "./RevealView";
import { COMPACT_STAGE, FULL_STAGE, STAGE_FONT_PX, StageProvider, useStage, type StageCtx } from "./stage";
import { StageHeader } from "./StageHeader";
import { StormView } from "./StormView";
import { useScreenSound } from "./useScreenSound";
import { VoteView } from "./VoteView";
import "./screen.css";

export type ScreenStageProps = {
  code: string;
  /** Mini screen for embedding (Judge Mode): smaller canvas, no sound, no QR, no corner controls. */
  compact?: boolean;
  /** OBS browser-source mode: transparent background, no QR unless `qr`, no connection banner. */
  obs?: boolean;
  /** With `obs`: show the QR codes anyway (?obs=1&qr=1). */
  qr?: boolean;
};

const CODE_RE = /^[A-Za-z]{5}$/;
const noopSubscribe = () => () => {};
/** Real px kept free at the right of the story strip for the sound button. */
const SOUND_RESERVE_PX = 340;

/** window.location.origin, empty on the server and during hydration. */
function useOrigin(): string {
  return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
}

/** Fit factor between the design canvas and the box the stage lives in (0 until measured). */
function useFit(w: number, h: number): { setBox: (el: HTMLDivElement | null) => void; k: number } {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [k, setK] = useState(0);
  useEffect(() => {
    if (!box) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      setK(r && r.width > 0 && r.height > 0 ? Math.min(r.width / w, r.height / h) : 0);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [box, w, h]);
  return { setBox, k };
}

/** VOTE and REVEAL are separate views: the ballot leaves, then the winner's page arrives. */
const viewKey = (s: PublicState): string => s.phase.toLowerCase();

function PhaseView({ state, feed }: { state: PublicState; feed: ReturnType<typeof useRoom>["feed"] }) {
  switch (state.phase) {
    case "LOBBY":
      return <LobbyView state={state} />;
    case "PROMPT":
      return <PromptView state={state} />;
    case "STORM":
      return <StormView state={state} feed={feed} />;
    case "DISTILL":
      return <DistillView feed={feed} />;
    case "VOTE":
      return <VoteView state={state} />;
    case "REVEAL":
      return <RevealView state={state} />;
    case "FINALE":
      return <FinaleView state={state} />;
    case "ENDED":
      return <EndedView state={state} />;
  }
}

function StoryStrip({ state, soundButton }: { state: PublicState; soundButton: boolean }) {
  const { metrics, obs, px } = useStage();
  const beats = state.phase === "LOBBY" || state.phase === "FINALE" || state.phase === "ENDED" ? [] : state.storySoFar.slice(-2);
  return (
    <footer
      className="relative z-10 flex shrink-0 items-center"
      style={{ height: px(metrics.footer), paddingLeft: px(metrics.padX), paddingRight: soundButton ? `max(${px(metrics.padX)}px, ${SOUND_RESERVE_PX}px)` : px(metrics.padX), gap: px(32) }}
      aria-label={SCREEN_COPY.stage.storySoFar}
    >
      <AnimatePresence initial={false}>
        {beats.map((b, i) => (
          <m.p
            key={b}
            layout="position"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION.medium}
            className={cn("line-clamp-2 min-w-0 flex-1 border-l-[0.12em] pl-[0.6em] leading-[1.25]", i === beats.length - 1 ? "border-light text-on-stage" : "border-stage-line text-muted-on-stage", obs && "cps-obs-panel rounded-[0.4em] py-[0.2em] pr-[0.5em]")}
          >
            {b}
          </m.p>
        ))}
      </AnimatePresence>
    </footer>
  );
}

function PausedOverlay({ obs }: { obs: boolean }) {
  const { compact } = useStage();
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="status"
      data-testid="screen-paused"
      className={cn("absolute inset-0 z-20 grid place-items-center", obs ? "" : "bg-stage-0/85 backdrop-blur-sm")}
    >
      <div className={cn("flex flex-col items-center text-center", obs ? "cps-obs-panel rounded-[1em] px-[1.6em] py-[1.2em]" : "", compact ? "gap-[0.3em]" : "gap-[0.5em]")}>
        <Pause aria-hidden="true" fill="currentColor" className={cn("text-light", compact ? "size-[2em]" : "size-[4.5em]")} />
        <h2 className={cn("font-display leading-none font-extrabold", compact ? "text-[1.2em]" : "text-[4em]")}>{COPY.states.paused.title}</h2>
        <p className={cn("text-muted-on-stage", compact ? "text-[0.7em]" : "text-[1.5em]")}>{COPY.states.paused.body}</p>
      </div>
    </m.div>
  );
}

/** Our server cannot be reached: sized for the room, retries by itself every few seconds. */
function UnreachableOverlay({ onRetry }: { onRetry: () => void | Promise<unknown> }) {
  const { compact } = useStage();
  useEffect(() => {
    const t = setInterval(() => void onRetry(), 4000);
    return () => clearInterval(t);
  }, [onRetry]);
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="status"
      data-testid="screen-unreachable"
      className="absolute inset-0 z-30 grid place-items-center bg-stage-0/90 backdrop-blur-sm"
    >
      <div className={cn("flex flex-col items-center text-center", compact ? "gap-[0.3em]" : "gap-[0.5em]")}>
        <WifiOff aria-hidden="true" className={cn("text-warn", compact ? "size-[2em]" : "size-[4em]")} />
        <h2 className={cn("max-w-[14em] font-display leading-[1.05] font-extrabold text-balance", compact ? "text-[1.1em]" : "text-[3.4em]")}>{COPY.states.unreachable.title}</h2>
        <p className={cn("max-w-[24em] text-muted-on-stage", compact ? "text-[0.65em]" : "text-[1.4em]")}>{COPY.states.unreachable.body}</p>
        {compact ? null : (
          <Button variant="secondary" onClick={() => void onRetry()} className="mt-[0.4em]">
            Try now
          </Button>
        )}
      </div>
    </m.div>
  );
}

function LoadingStage() {
  const { compact, metrics, px } = useStage();
  return (
    <div className="absolute inset-0 flex flex-col" role="status">
      <div className="flex shrink-0 items-center" style={{ height: px(metrics.header), paddingInline: px(metrics.padX) }}>
        <Skeleton className={compact ? "h-[1.2em] w-[10em]" : "h-[1.6em] w-[14em]"} />
      </div>
      <div className="grid flex-1 place-items-center">
        <p className={cn("flex items-center gap-[0.5em] font-display font-extrabold text-muted-on-stage", compact ? "text-[0.9em]" : "text-[2em]")}>
          <span aria-hidden="true" className="size-[0.5em] rounded-full bg-light motion-safe:animate-pulse" />
          {SCREEN_COPY.stage.loading}
        </p>
      </div>
    </div>
  );
}

function NotFoundMessage({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <div role="status" className={paperCardClass({ className: "grid aspect-video w-full place-items-center p-4 text-center" })}>
        <div>
          <p className="font-display text-lg font-extrabold">{SCREEN_COPY.notFound.title}</p>
          <p className="mt-1 text-sm text-ink-muted">{SCREEN_COPY.notFound.body}</p>
        </div>
      </div>
    );
  }
  return (
    <FullScreenMessage
      title={SCREEN_COPY.notFound.title}
      body={SCREEN_COPY.notFound.body}
      icon="🔍"
      actions={
        <ButtonLink href="/" variant="secondary">
          {SCREEN_COPY.notFound.action}
        </ButtonLink>
      }
    />
  );
}

export function ScreenStage(props: ScreenStageProps) {
  if (!CODE_RE.test(props.code.trim())) return <NotFoundMessage compact={Boolean(props.compact)} />;
  return <LiveStage {...props} code={props.code.trim().toUpperCase()} />;
}

function LiveStage({ code, compact = false, obs = false, qr = false }: ScreenStageProps) {
  const room = useRoom(code, "screen");
  const { state, error, refresh } = room;
  const sound = useScreenSound({ state, offsetMs: room.offsetMs, enabled: !compact });

  // The server says ROOM_NOT_FOUND; the client helpers say NOT_FOUND for a bare 404. Both mean the same.
  const notFound = error?.code === "NOT_FOUND" || error?.code === "ROOM_NOT_FOUND";
  if (notFound) return <NotFoundMessage compact={compact} />;
  if (error && !state) {
    return <FullScreenMessage title={COPY.states.error.title} body={error.message} onRetry={refresh} actions={null} />;
  }
  return (
    <StageView
      code={code}
      compact={compact}
      obs={obs}
      qr={qr}
      state={state}
      feed={room.feed}
      connection={room.connection}
      offsetMs={room.offsetMs}
      unreachable={room.unreachable}
      refresh={refresh}
      sound={sound}
    />
  );
}

type StageViewProps = Required<Pick<ScreenStageProps, "code">> &
  Pick<ScreenStageProps, "compact" | "obs" | "qr"> & {
    state: PublicState | null;
    feed: ReturnType<typeof useRoom>["feed"];
    connection: ReturnType<typeof useRoom>["connection"];
    offsetMs: number;
    unreachable: boolean;
    refresh: () => void | Promise<unknown>;
    sound: { on: boolean; toggle: () => void };
  };

/** The stage drawn from a room's state: everything LiveStage does except talking to the server. */
function StageView({ code, compact = false, obs = false, qr = false, state, feed, connection, offsetMs, unreachable, refresh, sound }: StageViewProps) {
  const reduced = useReducedMotion();
  const origin = useOrigin();
  const metrics = compact ? COMPACT_STAGE : FULL_STAGE;
  const { setBox, k } = useFit(metrics.w, metrics.h);

  const ctx = useMemo<StageCtx>(
    () => ({
      code,
      compact,
      obs,
      showQr: !obs || qr,
      origin,
      host: origin.replace(/^https?:\/\//, ""),
      offsetMs,
      reduced,
      metrics,
      k: k || 1,
      px: (n: number) => n * (k || 1),
    }),
    [code, compact, obs, qr, origin, offsetMs, reduced, metrics, k],
  );

  const confettiKey = state?.phase === "REVEAL" ? `${state.showId}:${state.roundNo}` : null;
  const stageStyle: CSSProperties = {
    width: metrics.w * (k || 1),
    height: metrics.h * (k || 1),
    fontSize: STAGE_FONT_PX * (k || 1),
    visibility: k > 0 ? "visible" : "hidden",
    ["--spacing" as string]: "0.25em",
  };
  const swap = reduced ? { duration: 0.175 } : undefined;

  return (
    <MotionScope>
      <StageProvider value={ctx}>
        {/* The full screen sits on the page's stage light; OBS stays transparent; the mini screen paints its own. */}
        {!compact && !obs ? <StageBackdrop roundNo={state?.roundNo ?? 0} breathe /> : null}
        <div
          ref={setBox}
          data-testid={compact ? "screen-stage" : "phase"}
          data-phase={state?.phase ?? "LOADING"}
          data-round={state?.roundNo ?? undefined}
          data-obs={obs ? "1" : undefined}
          className={cn("relative grid place-items-center overflow-hidden text-on-stage", compact ? "aspect-video w-full rounded-card ring-1 ring-stage-line" : "h-full w-full")}
        >
          <div className={cn("relative flex flex-col overflow-hidden", obs ? "cps-obs" : compact ? "cps-compact-bg" : "", compact && "rounded-card")} style={stageStyle}>
            <ConfettiLayer
              fireKey={confettiKey}
              width={Math.round(metrics.w * (k || 1))}
              height={Math.round(metrics.h * (k || 1))}
              reduced={reduced}
              scalar={(compact ? 1.7 : 2) * (k || 1)}
            />
            {state ? (
              <>
                <StageHeader state={state} />
                <div className="relative z-10 min-h-0 flex-1">
                  <AnimatePresence mode="wait" initial={false}>
                    <m.div
                      key={viewKey(state)}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0, transition: swap ?? TRANSITION.medium }}
                      exit={{ opacity: 0, y: -12, transition: swap ?? TRANSITION.exit }}
                      className="absolute inset-0"
                    >
                      <PhaseView state={state} feed={feed} />
                    </m.div>
                  </AnimatePresence>
                </div>
                {metrics.footer > 0 ? <StoryStrip state={state} soundButton={!compact && !obs} /> : null}
                <AnimatePresence>{state.paused ? <PausedOverlay key="paused" obs={obs} /> : null}</AnimatePresence>
                <AnimatePresence>{unreachable && !obs ? <UnreachableOverlay key="unreachable" onRetry={refresh} /> : null}</AnimatePresence>
              </>
            ) : obs ? null : (
              <LoadingStage />
            )}
          </div>

          {state ? <LiveRegion message={phaseAnnouncement(state)} /> : null}
          {!compact && !obs ? <ConnectionBanner status={connection} /> : null}
          {!compact ? <SoundToggle on={sound.on} toggle={sound.toggle} obs={obs} /> : null}
        </div>
      </StageProvider>
    </MotionScope>
  );
}


/** A real button with a visible label: a presenter can find it, and its name says what a click does. */
function SoundToggle({ on, toggle, obs }: { on: boolean; toggle: () => void; obs: boolean }) {
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="screen-sound"
      className={cn(
        "glass press absolute right-4 bottom-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-pill border border-stage-line px-5 text-[17px] font-semibold text-on-stage [--press-overlay:rgb(243_239_230/0.12)]",
        obs && "opacity-0 transition-opacity focus-visible:opacity-100 hover:opacity-100",
      )}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      {on ? SCREEN_COPY.sound.on : SCREEN_COPY.sound.off}
    </button>
  );
}
