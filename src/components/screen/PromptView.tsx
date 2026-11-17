"use client";
// PROMPT: the scene. Its title sits on the yellow numbered banner ("2 The Bell Rings Backwards") and the prompt is
// written out on a note by the pen; a small ring counts down to the storm.
import { cn } from "@/components/ui/cn";
import { Countdown } from "@/components/ui/Countdown";
import { NumberBanner } from "@/components/ui/Banner";
import { ScriptText } from "@/components/ui/ScriptText";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { bannerPx } from "./fit";
import { bannerStyle, tiltStyle, useStage } from "./stage";

export function PromptView({ state }: { state: PublicState }) {
  const { compact, offsetMs, metrics, px } = useStage();
  const prompt = state.prompt;
  const title = prompt?.title ?? "";
  const text = prompt?.text ?? "";
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 8 : 26), gap: px(compact ? 14 : 44) }}>
      <h2 className="m-0 shrink-0 leading-none">
        <NumberBanner n={state.roundNo} label={title} size="xl" play style={bannerStyle(px(bannerPx(title, compact ? 640 : 1560, compact ? 26 : 64)))} />
      </h2>

      {text ? (
        <div
          data-testid="screen-prompt-note"
          style={tiltStyle(-0.8)}
          className={cn("cps-box cps-box-poster cps-tape placed w-full", compact ? "max-w-[24em] px-[0.9em] py-[0.6em]" : "max-w-[34em] px-[1.2em] py-[0.9em]")}
        >
          <ScriptText
            text={text}
            as="p"
            delayMs={450}
            cps={Math.min(140, Math.max(36, Math.round(text.length / 1.3)))}
            className={cn("text-ink", compact ? "line-clamp-4 text-[0.78em] leading-[1.35]" : "line-clamp-5 text-[1.55em] leading-[1.32]")}
          />
        </div>
      ) : null}

      <div className="flex items-center" style={{ gap: px(compact ? 10 : 24) }}>
        <div className="cps-disc" style={{ padding: px(compact ? 3 : 8) }}>
          <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={px(compact ? 40 : 100)} />
        </div>
        <p className={cn("cps-slip px-[0.8em] py-[0.35em] leading-none", compact ? "text-[0.72em]" : "text-[1.3em]")}>{SCREEN_COPY.prompt.ready}</p>
      </div>
    </div>
  );
}
