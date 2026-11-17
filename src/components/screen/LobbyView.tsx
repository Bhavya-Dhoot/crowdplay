"use client";
// LOBBY: the room's front door, drawn like a poster. The show's title on a banner, then two numbered boxes: the QR
// ("1 Scan to join") and the code written huge in Kalam ("2 Or type the code"). Each arrival is an "admit one" paper
// ticket placed in a row, and a head-count with a live ink dot. Without a QR (OBS) the code box is step 1 and takes the page.
import type { ReactNode } from "react";
import { Banner, NumberBanner } from "@/components/ui/Banner";
import { cn } from "@/components/ui/cn";
import { tiltOf } from "@/components/ui/doodle";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { AnimatePresence, m } from "@/components/ui/motion";
import { TRANSITION } from "@/components/ui/motionTokens";
import { QrCode } from "@/components/ui/QrCode";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { bannerPx } from "./fit";
import { ticketSeats } from "./lobby";
import { bannerStyle, tiltStyle, useStage } from "./stage";

/** One numbered step of the poster: a paper box with its yellow number banner hanging over the top-left corner. */
function Step({ n, label, delayMs, tilt, className, testId, children }: { n: number; label: string; delayMs: number; tilt: number; className?: string; testId?: string; children: ReactNode }) {
  const { compact, px } = useStage();
  return (
    <section data-testid={testId} style={tiltStyle(tilt)} className={cn("cps-box cps-box-poster placed", className)}>
      <div className="absolute z-10 whitespace-nowrap" style={{ left: px(compact ? 6 : 14), top: px(compact ? -26 : -44) }}>
        <NumberBanner n={n} label={label} play delayMs={delayMs} style={bannerStyle(px(compact ? 22 : 36))} />
      </div>
      {children}
    </section>
  );
}

function Tickets({ players }: { players: number }) {
  // Oldest seat first, so a new arrival is placed at the end and nobody shifts.
  const seats = ticketSeats(players).reverse();
  return (
    <ul aria-hidden="true" className="flex flex-wrap justify-end gap-[0.6em]">
      <AnimatePresence initial={false}>
        {seats.map((n) => (
          <m.li
            key={n}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.175 } }}
            transition={TRANSITION.medium}
            style={tiltStyle(tiltOf(`seat-${n}`, 2.5))}
            className="cps-note flex items-stretch leading-none"
          >
            <span className="grid place-items-center border-r-[length:var(--bw-s)] border-dashed border-ink px-[0.55em] font-display text-[0.95em] tabular-nums">{n}</span>
            <span className="flex flex-col justify-center gap-[0.25em] px-[0.6em] py-[0.4em]">
              <span className="text-[0.72em] text-ink-notes">{SCREEN_COPY.lobby.admit}</span>
              <span className="font-display text-[0.95em]">{SCREEN_COPY.lobby.seat(n)}</span>
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
  const title = state.title;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center"
      style={{ paddingInline: px(metrics.padX), paddingTop: px(compact ? 4 : 12), paddingBottom: px(compact ? 8 : 26), gap: px(compact ? 14 : 30) }}
    >
      <div aria-hidden="true" className="placed shrink-0">
        <Banner size="xl" play style={bannerStyle(px(bannerPx(title, compact ? 600 : 1500, compact ? 28 : 58)))}>
          {title}
        </Banner>
      </div>

      <div className="flex min-h-0 items-center justify-center" style={{ gap: px(compact ? 0 : 110), marginTop: px(compact ? 26 : 64) }}>
        {qr ? (
          <Step n={1} label={SCREEN_COPY.lobby.scan} delayMs={150} tilt={-1.2} testId="screen-qr" className="shrink-0 p-[0.45em]">
            <QrCode value={`${origin}/join/${code}`} size={px(360)} label={`Scan to join show ${code}`} />
          </Step>
        ) : null}
        <Step
          n={qr ? 2 : 1}
          label={qr ? SCREEN_COPY.lobby.typeCode : SCREEN_COPY.lobby.noQr}
          delayMs={qr ? 350 : 150}
          tilt={1}
          className={cn("flex flex-col items-center", compact ? "gap-[0.2em] px-[1em] pt-[0.8em] pb-[0.5em]" : "gap-[0.4em] px-[1.2em] pt-[0.9em] pb-[0.6em]")}
        >
          <div role="img" aria-label={`Show code ${code.split("").join(" ")}`} className={cn("flex", compact ? "mb-[0.1em] text-[1.9em]" : "mb-[0.2em] text-[5.6em]")}>
            <InkUnderline play delayMs={500} seed={code}>
              <span aria-hidden="true" className="flex font-display leading-[1.15] tracking-[0.06em]">
                {code.split("").map((ch, i) => (
                  <span key={i} className="inline-block" style={{ rotate: `${tiltOf(`${code}-${i}`, 3)}deg`, translate: `0 ${tiltOf(`${code}+${i}`, 2.5) * 0.06}em` }}>
                    {ch}
                  </span>
                ))}
              </span>
            </InkUnderline>
          </div>
          {!compact ? (
            <p className="text-[1.15em] leading-none text-ink-notes">
              {SCREEN_COPY.lobby.openSite} <span className="text-ink">{host || "…"}</span> {SCREEN_COPY.lobby.enterCode}
            </p>
          ) : null}
        </Step>
      </div>

      <div className="flex w-full min-h-0 items-start justify-between" style={{ gap: px(compact ? 12 : 56) }}>
        <blockquote style={tiltStyle(-0.6)} className={cn("cps-slip cps-tape min-w-0", compact ? "max-w-[20em] px-[0.7em] py-[0.35em] text-[0.7em] leading-snug" : "max-w-[19em] px-[0.9em] py-[0.5em] text-[1.1em] leading-[1.3]")}>
          <p className={compact ? "line-clamp-2" : "line-clamp-3"}>{state.premise}</p>
        </blockquote>
        <div className="flex min-w-0 flex-col items-end gap-[0.6em]">
          <p className={cn("cps-slip flex items-center gap-[0.5em] leading-none", compact ? "px-[0.6em] py-[0.35em] text-[0.7em]" : "px-[0.8em] py-[0.4em] text-[1.1em]")}>
            <span aria-hidden="true" className="size-[0.55em] rounded-full bg-ink motion-safe:animate-pulse" />
            <span data-testid="screen-lobby-count">{players > 0 ? SCREEN_COPY.lobby.inRoom(players) : SCREEN_COPY.lobby.waiting}</span>
          </p>
          {!compact && players > 0 ? <Tickets players={players} /> : null}
        </div>
      </div>
    </div>
  );
}
