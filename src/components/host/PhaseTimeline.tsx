// Where the show is, at a glance: one dot per round, and the five phases of the round that is live as a row of small numbered
// ribbons (the poster's "1 SIP" banners, drawn small): finished = grey marker, live = the yellow one, still to come = dashed.
// Pure display (server-safe): the logic is timeline() in consoleLogic.ts. Colour is never the only signal: every ribbon is
// numbered, the live one carries aria-current="step", and every ribbon and dot has a spoken status.
import { cn } from "@/components/ui/cn";
import { tiltOf } from "@/components/ui/doodle";
import type { StepStatus, Timeline } from "./consoleLogic";

const SPOKEN: Record<StepStatus, string> = { done: "finished", now: "live now", next: "coming up" };

// One ribbon in a 44 x 28 box: two grey marker tails with a notch, a hand-squared face on top (the numeral is real text).
const FACE = "M9 3.4 L35.2 2.6 L35.6 24.8 L8.6 24.4 Z";
const FILL: Record<StepStatus, string> = { done: "var(--marker-2)", now: "var(--hl-solid)", next: "var(--paper-raised)" };

function StepRibbon({ status, tilt }: { status: StepStatus; tilt: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 44 28" className="absolute inset-0 size-full overflow-visible" style={{ rotate: `${tilt}deg` }}>
      <g stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" strokeDasharray={status === "next" ? "3 2" : undefined}>
        <path d="M11 6 H1.4 L6 14 L1.4 22 H11 Z" fill="var(--marker-2)" strokeDasharray="none" />
        <path d="M33 6 H42.6 L38 14 L42.6 22 H33 Z" fill="var(--marker-2)" strokeDasharray="none" />
        <path d={FACE} fill={FILL[status]} strokeWidth="2" />
      </g>
    </svg>
  );
}

export function PhaseTimeline({ timeline, className }: { timeline: Timeline; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} data-testid="host-timeline">
      <ol aria-label="This round" className="flex items-center justify-between">
        {timeline.steps.map((s, i) => (
          <li key={s.phase} aria-current={s.status === "now" ? "step" : undefined} title={s.label} className="relative h-7 w-11 shrink-0">
            <StepRibbon status={s.status} tilt={tiltOf(`tl-${s.phase}`, 1.5)} />
            <span aria-hidden="true" className={cn("relative grid h-full place-items-center pt-0.5 font-display text-small leading-none tabular-nums", s.status === "next" ? "text-ink-notes" : "text-ink")}>
              {i + 1}
            </span>
            <span className="sr-only">
              {s.label}, {SPOKEN[s.status]}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex min-h-5 items-center justify-between gap-3">
        <ol aria-label={`Rounds. ${timeline.caption}`} className="flex flex-wrap items-center gap-2">
          {timeline.rounds.map((r) => (
            <li key={r.n} className="flex h-5 items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "block rounded-blob border-2 border-ink",
                  r.status === "now" && "size-4 bg-ink",
                  r.status === "done" && "size-3 bg-marker-3",
                  r.status === "next" && "size-3 border-dashed border-ink-faint",
                )}
              />
              <span className="sr-only">
                Round {r.n} {SPOKEN[r.status]}
              </span>
            </li>
          ))}
        </ol>
        {timeline.label ? <p className="shrink-0 text-small leading-5 text-ink-notes">{timeline.label}</p> : null}
      </div>
    </div>
  );
}
