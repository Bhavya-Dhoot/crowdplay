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
// footer have fixed heights, and each phase view fills the main region.
import { Pause, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ConnectionBanner } from "@/components/ui/ConnectionBanner";
import { FullScreenMessage } from "@/components/ui/FullScreenMessage";
import { LiveRegion } from "@/components/ui/LiveRegion";
import { AnimatePresence, m, MotionScope, PHASE_TRANSITION } from "@/components/ui/motion";
import { Skeleton } from "@/components/ui/Skeleton";
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
import { OptionsView } from "./OptionsView";
import { PromptView } from "./PromptView";
import { COMPACT_STAGE, FULL_STAGE, STAGE_FONT_PX, StageProvider, useStage, type StageCtx } from "./stage";
import { StageHeader } from "./StageHeader";
import { StormView } from "./StormView";
import { useScreenSound } from "./useScreenSound";
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

const viewKey = (s: PublicState): string =>
  s.phase === "VOTE" || s.phase === "REVEAL" ? "options" : s.phase.toLowerCase();

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
    case "REVEAL":
      return <OptionsView state={state} />;
    case "FINALE":
      return <FinaleView state={state} />;
    case "ENDED":
      return <EndedView state={state} />;
  }
}

function StoryStrip({ state }: { state: PublicState }) {
  const { metrics, px } = useStage();
  const beats = state.phase === "LOBBY" || state.phase === "FINALE" || state.phase === "ENDED" ? [] : state.storySoFar.slice(-3);
  return (
    <footer className="relative z-10 flex shrink-0 items-center" style={{ height: px(metrics.footer), paddingInline: px(metrics.padX), gap: px(24) }} aria-label={SCREEN_COPY.stage.storySoFar}>
      <AnimatePresence initial={false}>
        {beats.map((b, i) => (
          <m.p
            key={b}
            layout="position"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={PHASE_TRANSITION}
            className={cn("line-clamp-2 min-w-0 flex-1 border-l-[3px] pl-[0.8em] text-[0.78em] leading-[1.3]", i === beats.length - 1 ? "border-accent text-text" : "border-line text-muted")}
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
      className={cn("absolute inset-0 z-20 grid place-items-center", obs ? "" : "bg-bg/85 backdrop-blur-sm")}
    >
      <div className={cn("flex flex-col items-center text-center", obs ? "cps-obs-panel rounded-[1em] px-[1.6em] py-[1.2em]" : "", compact ? "gap-[0.3em]" : "gap-[0.5em]")}>
        <Pause aria-hidden="true" fill="currentColor" className={compact ? "size-[2em] text-accent" : "size-[4.5em] text-accent"} />
        <h2 className={cn("font-display leading-none font-extrabold", compact ? "text-[1.2em]" : "text-[4em]")}>{COPY.states.paused.title}</h2>
        <p className={cn("text-muted", compact ? "text-[0.7em]" : "text-[1.5em]")}>{COPY.states.paused.body}</p>
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
        <p className={cn("flex items-center gap-[0.5em] font-display font-extrabold text-muted", compact ? "text-[0.9em]" : "text-[2em]")}>
          <span aria-hidden="true" className="size-[0.5em] rounded-full bg-accent motion-safe:animate-pulse" />
          {SCREEN_COPY.stage.loading}
        </p>
      </div>
    </div>
  );
}

function NotFoundMessage({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <div role="status" className="grid aspect-video w-full place-items-center rounded-card border border-line bg-surface p-4 text-center">
        <div>
          <p className="font-display text-lg font-extrabold">{SCREEN_COPY.notFound.title}</p>
          <p className="mt-1 text-sm text-muted">{SCREEN_COPY.notFound.body}</p>
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
  const { state, feed, connection, offsetMs, unreachable, error, refresh } = room;
  const reduced = useReducedMotion();
  const origin = useOrigin();
  const metrics = compact ? COMPACT_STAGE : FULL_STAGE;
  const { setBox, k } = useFit(metrics.w, metrics.h);
  const sound = useScreenSound({ state, offsetMs, enabled: !compact });

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

  // The server says ROOM_NOT_FOUND; the client helpers say NOT_FOUND for a bare 404. Both mean the same.
  const notFound = error?.code === "NOT_FOUND" || error?.code === "ROOM_NOT_FOUND";
  if (notFound) return <NotFoundMessage compact={compact} />;
  if (error && !state) {
    return (
      <FullScreenMessage title={COPY.states.error.title} body={error.message} onRetry={refresh} actions={null} />
    );
  }

  return (
    <MotionScope>
      <StageProvider value={ctx}>
        <div
          ref={setBox}
          data-testid={compact ? "screen-stage" : "phase"}
          data-phase={state?.phase ?? "LOADING"}
          data-obs={obs ? "1" : undefined}
          className={cn("relative grid place-items-center overflow-hidden text-text", compact ? "aspect-video w-full rounded-card ring-1 ring-line" : "h-full w-full")}
        >
          <div
            className={cn("relative flex flex-col overflow-hidden", obs ? "cps-obs" : "cps-bg", compact && "rounded-card")}
            style={stageStyle}
          >
            {state ? (
              <>
                <StageHeader state={state} />
                <div className="relative min-h-0 flex-1">
                  <AnimatePresence initial={false}>
                    <m.div
                      key={viewKey(state)}
                      initial={{ opacity: 0, y: 28 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -28 }}
                      transition={PHASE_TRANSITION}
                      className="absolute inset-0"
                    >
                      <PhaseView state={state} feed={feed} />
                    </m.div>
                  </AnimatePresence>
                </div>
                {metrics.footer > 0 ? <StoryStrip state={state} /> : null}
                <AnimatePresence>{state.paused ? <PausedOverlay key="paused" obs={obs} /> : null}</AnimatePresence>
              </>
            ) : obs ? null : (
              <LoadingStage />
            )}
            <ConfettiLayer
              fireKey={confettiKey}
              width={Math.round(metrics.w * (k || 1))}
              height={Math.round(metrics.h * (k || 1))}
              reduced={reduced}
              scalar={(compact ? 1.7 : 2) * (k || 1)}
            />
          </div>

          {state ? <LiveRegion message={phaseAnnouncement(state)} /> : null}
          {!compact && !obs ? <ConnectionBanner status={connection} /> : null}
          {unreachable && !compact && !obs ? <FullScreenMessage title={COPY.states.unreachable.title} body={COPY.states.unreachable.body} onRetry={refresh} /> : null}
          {unreachable && compact ? (
            <div role="status" className="absolute inset-0 z-40 grid place-items-center bg-bg/90 p-4 text-center">
              <div>
                <p className="font-display text-base font-extrabold">{COPY.states.unreachable.title}</p>
                <p className="mt-1 text-xs text-muted">{COPY.states.unreachable.body}</p>
              </div>
            </div>
          ) : null}
          {!compact ? <SoundToggle on={sound.on} toggle={sound.toggle} obs={obs} /> : null}
        </div>
      </StageProvider>
    </MotionScope>
  );
}

function SoundToggle({ on, toggle, obs }: { on: boolean; toggle: () => void; obs: boolean }) {
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label="Sound"
      title={on ? SCREEN_COPY.sound.on : SCREEN_COPY.sound.off}
      data-testid="screen-sound"
      className={cn(
        "absolute right-3 bottom-3 z-40 grid size-11 place-items-center rounded-pill border border-line bg-surface/80 text-muted backdrop-blur transition-opacity hover:text-text focus-visible:opacity-100",
        obs ? "opacity-0 hover:opacity-100" : on ? "opacity-70 hover:opacity-100" : "opacity-45 hover:opacity-100",
      )}
    >
      <Icon aria-hidden="true" className="size-5" />
    </button>
  );
}
