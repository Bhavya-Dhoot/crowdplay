"use client";
// PROMPT: the scene, on a paper script page. Title and text arrive in one move; a small ring counts down to the storm.
import { Countdown } from "@/components/ui/Countdown";
import { m } from "@/components/ui/motion";
import { paperCardClass } from "@/components/ui/PaperCard";
import { SPRING } from "@/components/ui/motionTokens";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { useStage } from "./stage";

export function PromptView({ state }: { state: PublicState }) {
  const { compact, offsetMs, metrics, px } = useStage();
  const prompt = state.prompt;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 8 : 26), gap: px(compact ? 8 : 30) }}>
      <m.div
        initial={{ opacity: 0, y: 44, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...SPRING.land, delay: 0.1 }}
        style={{ ["--tilt" as string]: "-1deg" }}
        className={paperCardClass({ className: compact ? "w-full rounded-[0.5em] p-[0.9em]" : "w-full max-w-[40em] rounded-[0.6em] px-[1.3em] py-[1.1em]" })}
      >
        <h2 className={compact ? "line-clamp-3 font-script text-[1.5em] leading-[1.05] font-semibold tracking-normal" : "line-clamp-3 font-script text-[3.4em] leading-[1.02] font-semibold tracking-normal"}>{prompt?.title ?? ""}</h2>
        {prompt?.text ? (
          <m.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className={compact ? "mt-[0.4em] line-clamp-3 font-script text-[0.72em] leading-snug text-ink-muted" : "mt-[0.6em] line-clamp-4 font-script text-[1.3em] leading-[1.4] text-ink-muted"}
          >
            {prompt.text}
          </m.p>
        ) : null}
      </m.div>

      <div className="flex items-center" style={{ gap: px(compact ? 10 : 24) }}>
        <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={px(compact ? 44 : 110)} />
        <span className={compact ? "text-[0.7em] font-semibold text-muted-on-stage" : "font-display text-[1.5em] font-bold text-muted-on-stage"}>{SCREEN_COPY.prompt.ready}</span>
      </div>
    </div>
  );
}
