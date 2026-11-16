"use client";
// PROMPT: the scene. Title and text are huge and arrive in one move; a small ring counts down to the storm.
import { Countdown } from "@/components/ui/Countdown";
import { m } from "@/components/ui/motion";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { useStage } from "./stage";

export function PromptView({ state }: { state: PublicState }) {
  const { compact, offsetMs, metrics, px } = useStage();
  const prompt = state.prompt;
  return (
    <div className="absolute inset-0 flex flex-col justify-center" style={{ paddingInline: px(metrics.padX), gap: px(compact ? 8 : 28) }}>
      <m.h2
        initial={{ opacity: 0, y: 44, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 150, damping: 20, delay: 0.1 }}
        className={compact ? "line-clamp-3 font-display text-[1.9em] leading-[1] font-extrabold tracking-tight" : "line-clamp-3 max-w-[20em] font-display text-[5.2em] leading-[0.95] font-extrabold tracking-tight"}
      >
        {prompt?.title ?? ""}
      </m.h2>

      {prompt?.text ? (
        <m.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className={compact ? "line-clamp-3 max-w-[26em] text-[0.8em] leading-snug text-text/85" : "line-clamp-4 max-w-[30em] text-[1.5em] leading-[1.35] text-text/85"}
        >
          {prompt.text}
        </m.p>
      ) : null}

      <div className="flex items-center" style={{ gap: px(compact ? 10 : 24), marginTop: px(compact ? 2 : 12) }}>
        <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={px(compact ? 44 : 110)} />
        <span className={compact ? "text-[0.7em] font-semibold text-muted" : "font-display text-[1.5em] font-bold text-muted"}>{SCREEN_COPY.prompt.ready}</span>
      </div>
    </div>
  );
}
