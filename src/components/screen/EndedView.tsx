"use client";
// ENDED: thanks, and a link (with a QR on a paper card) to the finished story.
import { m } from "@/components/ui/motion";
import { SPRING } from "@/components/ui/motionTokens";
import { paperCardClass } from "@/components/ui/PaperCard";
import { QrCode } from "@/components/ui/QrCode";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { useStage } from "./stage";

export function EndedView({ state }: { state: PublicState }) {
  const { compact, showQr, host, origin, metrics, px } = useStage();
  const storyUrl = origin ? `${origin}/story/${state.showId}` : "";
  const qr = showQr && !compact && storyUrl;
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 8 : 26), gap: px(compact ? 16 : 96) }}>
      <div className="flex min-w-0 flex-col" style={{ gap: px(compact ? 8 : 26) }}>
        <m.h2
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 150, damping: 20 }}
          className={compact ? "font-display text-[1.7em] leading-none font-extrabold" : "font-display text-[5.2em] leading-[0.95] font-extrabold tracking-tight"}
        >
          {SCREEN_COPY.ended.thanks}
        </m.h2>
        <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.4 }} className="flex flex-col" style={{ gap: px(compact ? 4 : 10) }}>
          <p className={compact ? "text-[0.8em] font-semibold text-muted-on-stage" : "font-script text-[1.7em] font-medium text-muted-on-stage"}>{SCREEN_COPY.ended.read}</p>
          <p data-testid="screen-story-link" className={compact ? "text-[0.7em] font-bold break-all text-on-stage" : "font-display text-[1.7em] font-bold break-all text-on-stage"}>
            {host ? `${host}/story/${state.showId}` : "…"}
          </p>
        </m.div>
      </div>
      {qr ? (
        <m.div
          data-testid="screen-qr"
          initial={{ opacity: 0, scale: 0.9, rotate: -4 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ ...SPRING.land, delay: 0.3 }}
          style={{ ["--tilt" as string]: "1.2deg" }}
          className={paperCardClass({ className: "shrink-0 rounded-[0.7em] p-[0.5em]" })}
        >
          <QrCode value={storyUrl} size={px(400)} label={SCREEN_COPY.ended.scanStory} light="transparent" />
        </m.div>
      ) : null}
    </div>
  );
}
