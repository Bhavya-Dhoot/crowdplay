"use client";
// ENDED: thanks on a banner, and the story's link (with its QR) in one drawn poster box. Without a QR (OBS) the link
// box is all there is.
import { Banner } from "@/components/ui/Banner";
import { cn } from "@/components/ui/cn";
import { QrCode } from "@/components/ui/QrCode";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { bannerPx } from "./fit";
import { bannerStyle, tiltStyle, useStage } from "./stage";

export function EndedView({ state }: { state: PublicState }) {
  const { compact, showQr, host, origin, metrics, px } = useStage();
  const storyUrl = origin ? `${origin}/story/${state.showId}` : "";
  const qr = showQr && !compact && storyUrl;
  const thanks = SCREEN_COPY.ended.thanks;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 8 : 26), gap: px(compact ? 14 : 44) }}>
      <h2 className="m-0 shrink-0 leading-none">
        <Banner size="xl" play style={bannerStyle(px(bannerPx(thanks, compact ? 640 : 1500, compact ? 28 : 72)))}>
          {thanks}
        </Banner>
      </h2>
      <div
        style={tiltStyle(0.8)}
        className={cn("cps-box cps-box-poster placed flex items-center", compact ? "gap-[0.8em] px-[1em] py-[0.7em]" : "gap-[1.6em] px-[1.4em] py-[1.1em]")}
      >
        <div className="flex min-w-0 flex-col" style={{ gap: px(compact ? 4 : 12) }}>
          <p className={compact ? "text-[0.8em] text-ink-notes" : "text-[1.5em] text-ink-notes"}>{SCREEN_COPY.ended.read}</p>
          <p data-testid="screen-story-link" className={cn("font-display break-all", compact ? "text-[0.75em]" : "text-[1.7em] leading-[1.15]")}>
            {host ? `${host}/story/${state.showId}` : "…"}
          </p>
        </div>
        {qr ? (
          <div data-testid="screen-qr" className="shrink-0">
            <QrCode value={storyUrl} size={px(330)} label={SCREEN_COPY.ended.scanStory} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
