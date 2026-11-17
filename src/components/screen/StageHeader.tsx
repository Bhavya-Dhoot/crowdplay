"use client";
// The persistent top band: the show's title and "Scene N of M" on the left, join info + QR + live player count on the
// right. Its height is fixed per stage size, so no phase ever moves anything below it. On the OBS overlay both sides sit
// on paper slips (the page behind them is the stream, not paper).
import { Users } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { QrCode } from "@/components/ui/QrCode";
import { PHASE_LABEL } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { tiltStyle, useStage } from "./stage";
import { LogoMark } from "@/components/ui/LogoMark";

export function StageHeader({ state }: { state: PublicState }) {
  const { compact, obs, showQr, code, host, origin, metrics, px } = useStage();
  const { phase } = state;
  const hasRound = phase !== "LOBBY" && phase !== "FINALE" && phase !== "ENDED";
  // The lobby's own banner carries the title; the heading stays for screen readers.
  const titleHidden = phase === "LOBBY";
  // The big lobby QR replaces the corner one; the ended screen has its own story QR.
  const cornerQr = showQr && !compact && phase !== "LOBBY" && phase !== "ENDED";
  const slip = obs ? "cps-slip px-[0.8em] py-[0.4em]" : "";
  const sub = hasRound ? `${SCREEN_COPY.stage.scene(state.roundNo, state.roundsTotal)} · ${PHASE_LABEL[phase]}` : PHASE_LABEL[phase];

  return (
    <header className="relative z-10 flex shrink-0 items-center justify-between gap-[1em]" style={{ height: px(metrics.header), paddingInline: px(metrics.padX) }}>
      <div className={cn("flex min-w-0 flex-col gap-[0.25em]", slip)} style={obs ? tiltStyle(-0.5) : undefined}>
        <div className="flex min-w-0 items-center gap-[0.5em]">
          <LogoMark size={px(compact ? 20 : 38)} />
          <h1 className={cn("truncate font-display leading-none", compact ? "text-[1em]" : "text-[1.55em]", titleHidden && "sr-only")}>{state.title}</h1>
        </div>
        <p key={phase} className={cn("placed leading-none text-ink-notes", compact ? "text-[0.72em]" : "text-[0.85em]")}>
          {sub}
        </p>
      </div>

      <div className={cn("flex shrink-0 items-center", compact ? "gap-[0.6em]" : "gap-[1em]", slip)} style={obs ? tiltStyle(0.5) : undefined}>
        <div className={cn("flex flex-col leading-none", compact ? "items-end gap-[0.4em]" : "items-end gap-[0.5em]")}>
          {compact ? (
            <span className="font-display text-[0.85em] tracking-[0.12em]">{code}</span>
          ) : (
            <p className="text-[1em] whitespace-nowrap">
              <span className="text-ink-notes">{SCREEN_COPY.stage.join}</span> {host || "…"}
              <span className="text-ink-notes"> · </span>
              <span className="font-display text-[1.25em] tracking-[0.12em]">{code}</span>
            </p>
          )}
          <p className={cn("flex items-center gap-[0.4em] text-ink-notes tabular-nums", compact ? "text-[0.72em]" : "text-[0.9em]")}>
            <Users aria-hidden="true" className={compact ? "size-[1.1em]" : "size-[1.15em]"} />
            <span data-testid="screen-players">{SCREEN_COPY.stage.players(state.stats.players)}</span>
          </p>
        </div>
        {showQr && !compact ? (
          cornerQr && origin ? (
            <div data-testid="screen-qr">
              <QrCode value={`${origin}/join/${code}`} size={px(110)} label={`Scan to join show ${code}`} />
            </div>
          ) : (
            <div aria-hidden="true" style={{ width: px(110), height: px(110) }} />
          )
        ) : null}
      </div>
    </header>
  );
}
