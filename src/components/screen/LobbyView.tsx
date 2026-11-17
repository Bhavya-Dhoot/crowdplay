"use client";
// LOBBY: the room's front door. A huge QR on a paper card, the code as five paper tiles (same look as the join
// form on a phone), the premise in the script voice and a live head-count. Each arrival pops in as a small paper
// ticket, newest first, capped. Without a QR (OBS) the code and host take the stage.
import { cn } from "@/components/ui/cn";
import { AnimatePresence, m } from "@/components/ui/motion";
import { SPRING } from "@/components/ui/motionTokens";
import { paperCardClass } from "@/components/ui/PaperCard";
import { QrCode } from "@/components/ui/QrCode";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { ticketSeats } from "./lobby";
import { useStage } from "./stage";

function Tickets({ players }: { players: number }) {
  const seats = ticketSeats(players);
  return (
    <ul aria-hidden="true" className="flex flex-wrap items-center" style={{ gap: "0.5em" }}>
      <AnimatePresence initial={false}>
        {seats.map((n) => (
          <m.li
            key={n}
            layout="position"
            initial={{ opacity: 0, scale: 0.6, y: 18, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0, rotate: ((n * 7) % 5) - 2 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.175 } }}
            transition={{ ...SPRING.land, layout: { type: "spring", stiffness: 300, damping: 30 } }}
            className="flex items-stretch overflow-hidden rounded-[0.3em] bg-paper-2 text-ink shadow-contact"
          >
            <span className="grid place-items-center border-r-[0.1em] border-dashed border-paper-edge bg-paper px-[0.5em] font-display text-[0.85em] leading-none font-extrabold tabular-nums">{n}</span>
            <span className="flex flex-col justify-center gap-[0.2em] px-[0.6em] py-[0.35em] leading-none">
              <span className="text-[0.7em] font-semibold text-ink-muted">{SCREEN_COPY.lobby.admit}</span>
              <span className="font-display text-[0.95em] font-extrabold">{SCREEN_COPY.lobby.seat(n)}</span>
            </span>
          </m.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

export function LobbyView({ state }: { state: PublicState }) {
  const { compact, showQr, code, host, origin, metrics, px } = useStage();
  const players = state.stats.players;
  const qr = showQr && !compact && origin;

  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 8 : 26), gap: px(compact ? 20 : 88) }}>
      {qr ? (
        <m.div
          data-testid="screen-qr"
          initial={{ opacity: 0, scale: 0.88, rotate: -4 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={SPRING.land}
          style={{ ["--tilt" as string]: "-1.2deg" }}
          className={paperCardClass({ className: "shrink-0 rounded-[0.7em] p-[0.6em]" })}
        >
          <QrCode value={`${origin}/join/${code}`} size={px(500)} label={`Scan to join show ${code}`} light="transparent" />
        </m.div>
      ) : null}

      <div className="flex min-w-0 flex-col items-start" style={{ gap: px(compact ? 12 : 28) }}>
        <m.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.41, delay: 0.1 }}
          className={compact ? "font-display text-[1.1em] leading-none font-extrabold text-muted-on-stage" : "font-display text-[2.2em] leading-none font-extrabold"}
        >
          {qr ? SCREEN_COPY.lobby.scan : SCREEN_COPY.lobby.noQr}
        </m.h2>

        <div className="flex" style={{ gap: px(compact ? 6 : 14) }} role="img" aria-label={`Show code ${code.split("").join(" ")}`}>
          {code.split("").map((ch, i) => (
            <m.span
              key={i}
              initial={{ opacity: 0, y: 36, rotate: i % 2 ? 4 : -4 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ ...SPRING.land, delay: 0.2 + i * 0.07 }}
              aria-hidden="true"
              style={{ ["--tilt" as string]: `${i % 2 ? 1.2 : -1.2}deg` }}
              className={paperCardClass({
                className: compact
                  ? "grid h-[1.3em] w-[1.05em] place-items-center rounded-[0.22em] font-display text-[1.5em] leading-none font-extrabold"
                  : "grid h-[1.45em] w-[1.1em] place-items-center rounded-[0.17em] font-display text-[4em] leading-none font-extrabold",
              })}
            >
              {ch}
            </m.span>
          ))}
        </div>

        {!compact ? (
          <p className="text-[1.15em] leading-none text-muted-on-stage">
            {SCREEN_COPY.lobby.openSite} <span className="font-semibold text-on-stage">{host || "…"}</span> {SCREEN_COPY.lobby.enterCode}
          </p>
        ) : null}

        <m.blockquote
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className={cn(
            "border-light font-script text-on-stage/90",
            compact ? "line-clamp-2 max-w-[22em] border-l-[0.25em] pl-[0.7em] text-[0.7em] leading-snug" : "line-clamp-4 max-w-[24em] border-l-[0.22em] pl-[0.8em] text-[1.4em] leading-[1.35]",
          )}
        >
          {state.premise}
        </m.blockquote>

        <p className={compact ? "flex items-center gap-[0.5em] text-[0.7em] font-semibold text-muted-on-stage" : "flex items-center gap-[0.6em] text-[1.1em] font-semibold text-muted-on-stage"}>
          <span aria-hidden="true" className="size-[0.6em] rounded-full bg-ok motion-safe:animate-pulse" />
          <span data-testid="screen-lobby-count">{players > 0 ? SCREEN_COPY.lobby.inRoom(players) : SCREEN_COPY.lobby.waiting}</span>
        </p>
        {!compact && players > 0 ? <Tickets players={players} /> : null}
      </div>
    </div>
  );
}
