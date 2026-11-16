"use client";
// LOBBY: the room's front door. A huge QR, the code as five tiles (same look as the join form on a
// phone), the premise and a live head-count. Without a QR (OBS) the code and host take the stage.
import { m } from "@/components/ui/motion";
import { QrCode } from "@/components/ui/QrCode";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { useStage } from "./stage";

export function LobbyView({ state }: { state: PublicState }) {
  const { compact, showQr, code, host, origin, metrics, px } = useStage();
  const players = state.stats.players;
  const qr = showQr && !compact && origin;

  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ paddingInline: px(metrics.padX), gap: px(compact ? 20 : 88) }}>
      {qr ? (
        <m.div
          data-testid="screen-qr"
          initial={{ opacity: 0, scale: 0.88, rotate: -2 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="shrink-0 rounded-[1.1em] bg-white p-[0.35em] shadow-[0_0_0_1px_var(--line),0_30px_90px_-20px_rgb(255_210_63/0.35)]"
        >
          <QrCode value={`${origin}/join/${code}`} size={px(520)} label={`Scan to join show ${code}`} light="#FFFFFF" className="rounded-[0.8em]" />
        </m.div>
      ) : null}

      <div className="flex min-w-0 flex-col items-start" style={{ gap: px(compact ? 12 : 30) }}>
        <m.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className={compact ? "font-display text-[1.1em] leading-none font-extrabold text-muted" : "font-display text-[2.2em] leading-none font-extrabold"}
        >
          {qr ? SCREEN_COPY.lobby.scan : SCREEN_COPY.lobby.noQr}
        </m.h2>

        <div className="flex" style={{ gap: px(compact ? 6 : 14) }} role="img" aria-label={`Show code ${code.split("").join(" ")}`}>
          {code.split("").map((ch, i) => (
            <m.span
              key={i}
              initial={{ opacity: 0, y: 36, rotate: i % 2 ? 4 : -4 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 + i * 0.07 }}
              aria-hidden="true"
              className={
                compact
                  ? "cps-tile grid h-[1.3em] w-[1.05em] place-items-center rounded-[0.22em] font-display text-[1.5em] leading-none font-extrabold text-accent"
                  : "cps-tile grid h-[1.45em] w-[1.1em] place-items-center rounded-[0.17em] font-display text-[4em] leading-none font-extrabold text-accent"
              }
            >
              {ch}
            </m.span>
          ))}
        </div>

        {!qr && !compact ? (
          <p className="text-[1.4em] leading-none text-muted">
            {SCREEN_COPY.stage.join} <span className="font-semibold text-text">{host || "…"}</span>
          </p>
        ) : null}

        <m.blockquote
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className={
            compact
              ? "line-clamp-2 max-w-[22em] border-l-4 border-accent pl-[0.7em] text-[0.7em] leading-snug text-text/85"
              : "line-clamp-4 max-w-[24em] border-l-[6px] border-accent pl-[0.8em] font-display text-[1.45em] leading-[1.25] font-bold text-text/90"
          }
        >
          {state.premise}
        </m.blockquote>

        <p className={compact ? "flex items-center gap-[0.5em] text-[0.7em] font-semibold text-muted" : "flex items-center gap-[0.6em] text-[1.1em] font-semibold text-muted"}>
          <span aria-hidden="true" className="size-[0.6em] rounded-full bg-ok motion-safe:animate-pulse" />
          <span data-testid="screen-lobby-count">{players > 0 ? SCREEN_COPY.lobby.inRoom(players) : SCREEN_COPY.lobby.waiting}</span>
        </p>
      </div>
    </div>
  );
}
