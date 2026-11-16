"use client";
// The persistent top band: show title + round on the left, join info + QR + live player count on the
// right. Its height is fixed per stage size, so no phase ever moves anything below it.
import { Users } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { QrCode } from "@/components/ui/QrCode";
import { AnimatePresence, m, PHASE_TRANSITION } from "@/components/ui/motion";
import { PHASE_LABEL } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { useStage } from "./stage";

function LogoMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="9" r="5.5" fill="var(--opt-a)" />
      <circle cx="20" cy="9" r="5.5" fill="var(--opt-b)" />
      <circle cx="14" cy="20" r="5.5" fill="var(--opt-c)" />
    </svg>
  );
}

export function StageHeader({ state }: { state: PublicState }) {
  const { compact, obs, showQr, code, host, origin, metrics, px } = useStage();
  const { phase } = state;
  const hasRound = phase !== "LOBBY" && phase !== "FINALE" && phase !== "ENDED";
  // The big lobby QR replaces the corner one; the ended screen has its own story QR.
  const cornerQr = showQr && !compact && phase !== "LOBBY" && phase !== "ENDED";
  const panel = obs ? "cps-obs-panel rounded-[0.8em] px-[0.8em] py-[0.45em]" : "";

  return (
    <header
      className="relative z-10 flex shrink-0 items-center justify-between gap-[1em]"
      style={{ height: px(metrics.header), paddingInline: px(metrics.padX) }}
    >
      <div className={cn("flex min-w-0 flex-col gap-[0.35em]", panel)}>
        <div className="flex min-w-0 items-center gap-[0.55em]">
          <LogoMark size={px(compact ? 20 : 38)} />
          <h1 className={cn("truncate font-display leading-none font-extrabold tracking-tight", compact ? "text-[1em]" : "text-[1.55em]")}>{state.title}</h1>
        </div>
        <div className={cn("flex items-center gap-[0.7em] leading-none", compact ? "text-[0.62em]" : "text-[0.85em]")}>
          {hasRound ? (
            <span className="font-display font-extrabold tabular-nums text-accent">
              Round {state.roundNo} / {state.roundsTotal}
            </span>
          ) : null}
          <span className="relative inline-grid min-w-[7em]">
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span
                key={phase}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={PHASE_TRANSITION}
                className="font-semibold text-muted"
              >
                {PHASE_LABEL[phase]}
              </m.span>
            </AnimatePresence>
          </span>
        </div>
      </div>

      <div className={cn("flex shrink-0 items-center", compact ? "gap-[0.6em]" : "gap-[1em]", panel)}>
        <div className={cn("flex flex-col leading-none", compact ? "items-end gap-[0.4em]" : "items-end gap-[0.5em]")}>
          {compact ? (
            <span className="font-display text-[0.8em] font-extrabold tracking-[0.12em] text-accent">{code}</span>
          ) : (
            <p className="text-[1em] whitespace-nowrap">
              <span className="text-muted">{SCREEN_COPY.stage.join}</span> <span className="font-semibold">{host || "…"}</span>
              <span className="text-muted"> · </span>
              <span className="font-display text-[1.25em] font-extrabold tracking-[0.12em] text-accent">{code}</span>
            </p>
          )}
          <p className={cn("flex items-center gap-[0.4em] font-semibold text-muted tabular-nums", compact ? "text-[0.62em]" : "text-[0.85em]")}>
            <Users aria-hidden="true" className={compact ? "size-[1.1em]" : "size-[1.15em]"} />
            <span data-testid="screen-players">{SCREEN_COPY.stage.players(state.stats.players)}</span>
          </p>
        </div>
        {showQr && !compact ? (
          cornerQr && origin ? (
            <div data-testid="screen-qr">
              <QrCode value={`${origin}/join/${code}`} size={px(118)} label={`Scan to join show ${code}`} />
            </div>
          ) : (
            <div aria-hidden="true" style={{ width: px(118), height: px(118) }} />
          )
        ) : null}
      </div>
    </header>
  );
}
