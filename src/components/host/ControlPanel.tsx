"use client";
// Console column 1: the stage manager's hands. Where we are (countdown, phase name and the timeline of numbered ribbons), the ONE
// yellow key that follows the phase, pause / +10 s, the three switches, and End show behind a confirm. The engine decides what
// is legal (controlAvailability mirrors machine.ts), so buttons the server would ignore are disabled, not failing.
// Never more than one yellow key: while the show is paused, Resume takes the yellow and the phase key (which the engine
// ignores until then) goes to paper.
import { Pause, Play, Plus, Power } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { Countdown } from "@/components/ui/Countdown";
import { LiveRegion } from "@/components/ui/LiveRegion";
import { paperCardClass } from "@/components/ui/PaperCard";
import { Sheet } from "@/components/ui/Sheet";
import type { HostMetrics } from "@/lib/api/contracts";
import type { Features } from "@/lib/config";
import { phaseAnnouncement, PHASE_LABEL } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { controlAvailability, primarySpec, timeline, type PrimarySpec } from "./consoleLogic";
import { Switch } from "./controls";
import { PhaseTimeline } from "./PhaseTimeline";
import type { HostDesk } from "./useHostDesk";
import "./host.css";

type Props = {
  state: PublicState;
  offsetMs: number;
  metrics: HostMetrics | null;
  features: Features | null;
  desk: HostDesk;
  /** The one players count of the console (the roster), so the Start hint agrees with the rest of the page. */
  joined: number;
};

// The phase key is the one button the host presses all night: a ui/Button made taller by .host-key (host.css).
function StageKey({ spec, paused, busy, onPress }: { spec: PrimarySpec; paused: boolean; busy: boolean; onPress: () => void }) {
  const variant = paused ? "secondary" : "primary";
  if (spec.href) {
    return (
      <ButtonLink href={spec.href} variant={variant} size="lg" block className="host-key" data-testid="host-primary" data-action="story">
        {spec.label}
      </ButtonLink>
    );
  }
  return (
    <Button
      variant={variant}
      size="lg"
      block
      className="host-key"
      data-testid="host-primary"
      data-action={spec.action?.action ?? "wait"}
      data-waiting={spec.waiting || undefined}
      disabled={spec.disabled}
      loading={busy}
      onClick={onPress}
    >
      {spec.label}
      {busy ? <span className="sr-only">Working…</span> : null}
    </Button>
  );
}

export function ControlPanel({ state, offsetMs, metrics, features, desk, joined }: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const spec = primarySpec(state.phase === "LOBBY" ? { ...state, stats: { ...state.stats, players: joined } } : state);
  const can = controlAvailability(state);
  const { run, busy, pending } = desk;
  const over = state.phase === "ENDED";
  const steps = timeline(state);

  const toggle = (key: "auto" | "strict" | "voice") => {
    const current = key === "auto" ? metrics?.autoAdvance : key === "strict" ? metrics?.strictFilter : metrics?.voice;
    const value = pending[key] ?? current ?? false;
    return {
      checked: value,
      busy: key in pending && busy.has(key),
      disabled: metrics === null || over,
      onChange: (next: boolean) =>
        void run(
          key,
          key === "auto" ? { action: "autoAdvance", on: next } : key === "strict" ? { action: "strictFilter", on: next } : { action: "voice", on: next },
          { key, value: next },
        ),
    };
  };

  return (
    <section aria-labelledby="control-title" className={paperCardClass({ className: "host-scroll flex min-h-0 flex-col gap-5 p-4 lg:overflow-y-auto" })}>
      <h2 id="control-title" className="sr-only">
        Control
      </h2>
      <div className="shrink-0 space-y-4">
        <header className="flex items-center gap-4">
          <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={64} />
          <div className="min-w-0 flex-1">
            {steps.label ? null : <p className="text-small tabular-nums text-ink-notes">{steps.caption}</p>}
            <p className="font-display text-h3 leading-7">{PHASE_LABEL[state.phase]}</p>
          </div>
          <LiveRegion message={phaseAnnouncement(state)} />
        </header>
        <PhaseTimeline timeline={steps} />
      </div>

      <div className="shrink-0">
        <StageKey spec={spec} paused={state.paused} busy={busy.has("primary")} onPress={() => spec.action && void run("primary", spec.action)} />
        <p className="mt-4 min-h-10 px-1 text-center text-small leading-5 text-ink-notes" data-testid="host-primary-hint">
          {spec.hint}
        </p>
      </div>

      {over ? (
        <Card as="div" tone="raised" className="shrink-0" data-testid="host-ended-card">
          <p className="font-display text-lead leading-6">That&apos;s a wrap</p>
          <p className="mt-1 text-small text-ink-notes">The story page stays online, so you can share it any time. Nobody can join this show now.</p>
          <ButtonLink href="/host" variant="secondary" size="sm" block className="mt-4" data-testid="host-new-show">
            Host another show
          </ButtonLink>
        </Card>
      ) : null}

      <div className={cn("grid shrink-0 grid-cols-2 gap-4", over && "hidden")}>
        <Button
          variant={state.paused ? "primary" : "secondary"}
          data-testid="host-pause"
          disabled={state.paused ? false : !can.canPause}
          loading={busy.has("pause")}
          onClick={() => void run("pause", { action: state.paused ? "resume" : "pause" })}
        >
          {state.paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
          {state.paused ? "Resume" : "Pause"}
        </Button>
        <Button
          variant="secondary"
          data-testid="host-extend"
          disabled={!can.canExtend}
          loading={busy.has("extend")}
          onClick={() => void run("extend", { action: "extend", ms: 10000 })}
          aria-label="Add 10 seconds"
        >
          <Plus aria-hidden="true" className="size-4" />
          10 s
        </Button>
      </div>

      <div className={cn("flex shrink-0 flex-col gap-1 border-t-2 border-dashed border-ink-faint pt-3", over && "hidden")}>
        <Switch label="Auto-advance" hint="Off: you press Next round." testId="host-auto" {...toggle("auto")} />
        <Switch label="Strict filter" hint="Hides edgy ideas from the screen." testId="host-strict" {...toggle("strict")} />
        {features?.tts ? <Switch label="Voice" hint="The narrator reads each reveal aloud on the big screen." testId="host-voice" {...toggle("voice")} /> : null}
      </div>

      {state.phase === "FINALE" || over ? null : (
        <div className="mt-auto shrink-0 pt-2">
          <Button variant="danger" block disabled={!can.canEnd} data-testid="host-end" onClick={() => setConfirmEnd(true)}>
            <Power aria-hidden="true" className="size-4" />
            End show
          </Button>
        </div>
      )}

      <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} title="End the show now?">
        <p className="text-body text-ink-notes">Everyone jumps to the finale and the story is saved. You can&apos;t restart this show.</p>
        <div className="mt-6 mb-2 flex flex-col-reverse gap-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
            Keep playing
          </Button>
          <Button
            variant="danger"
            data-testid="host-end-confirm"
            loading={busy.has("end")}
            onClick={() => {
              void run("end", { action: "endShow" }).then((ok) => {
                if (ok) setConfirmEnd(false);
              });
            }}
          >
            End show
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
