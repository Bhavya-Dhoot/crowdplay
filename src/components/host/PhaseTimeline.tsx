// Where the show is, at a glance: one pip per round, and the five phases of the round that is live.
// Pure display (server-safe): the logic is timeline() in consoleLogic.ts. Colour is never the only signal:
// the live phase is also bold and carries aria-current="step", and every pip has a spoken status.
import { cn } from "@/components/ui/cn";
import type { StepStatus, Timeline } from "./consoleLogic";

const SPOKEN: Record<StepStatus, string> = { done: "finished", now: "live now", next: "coming up" };

export function PhaseTimeline({ timeline, className }: { timeline: Timeline; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} data-testid="host-timeline">
      <div className="flex min-h-4 items-center justify-between gap-3">
        <ol aria-label={`Rounds. ${timeline.caption}`} className="flex flex-wrap items-center gap-2">
          {timeline.rounds.map((r) => (
            <li key={r.n} className="flex h-4 items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "block rounded-full",
                  r.status === "now" && "size-3.5 bg-light",
                  r.status === "done" && "size-2.5 bg-muted-on-stage",
                  r.status === "next" && "size-2.5 border border-muted-on-stage/60",
                )}
              />
              <span className="sr-only">
                Round {r.n} {SPOKEN[r.status]}
              </span>
            </li>
          ))}
        </ol>
        {timeline.label ? <p className="shrink-0 text-fine leading-4 text-muted-on-stage">{timeline.label}</p> : null}
      </div>
      <ol aria-label="This round" className="flex gap-1.5">
        {timeline.steps.map((s) => (
          <li key={s.phase} aria-current={s.status === "now" ? "step" : undefined} className="min-w-0 flex-auto">
            <span
              aria-hidden="true"
              className={cn("block h-1 rounded-full", s.status === "now" ? "bg-light" : s.status === "done" ? "bg-muted-on-stage/70" : "bg-stage-line")}
            />
            <span className={cn("mt-1.5 block truncate text-fine leading-4", s.status === "now" ? "font-semibold text-on-stage" : "text-muted-on-stage")}>
              {s.label}
              <span className="sr-only">, {SPOKEN[s.status]}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
