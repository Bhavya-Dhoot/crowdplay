"use client";
// Console column 1: the stage manager's hands. Where we are (phase header + timeline), the ONE gold key that
// follows the phase, pause / +10 s, the three switches, and End show behind a confirm. The engine decides what is
// legal (controlAvailability mirrors machine.ts), so buttons the server would ignore are disabled, not failing.
import { LoaderCircle, Pause, Play, Plus, Power } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PhaseHeader } from "@/components/ui/PhaseHeader";
import { Sheet } from "@/components/ui/Sheet";
import type { HostMetrics } from "@/lib/api/contracts";
import type { Features } from "@/lib/config";
import type { PublicState } from "@/lib/realtime/types";
import { controlAvailability, primarySpec, timeline, type PrimarySpec } from "./consoleLogic";
import { ActionButton, Switch } from "./controls";
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

// The gold pill of ui/Button, made taller: this is the one button the host presses all night. Written out here
// (not buttonClass) because that helper's size classes would fight the larger type.
const KEY =
  "host-key press relative isolate inline-flex min-h-[76px] w-full items-center justify-center gap-3 overflow-hidden rounded-pill bg-gold px-6 font-display text-h3 leading-none font-extrabold tracking-tight text-ink select-none disabled:pointer-events-none disabled:bg-stage-2 disabled:text-muted-on-stage aria-disabled:bg-stage-2 aria-disabled:text-muted-on-stage";

function StageKey({ spec, busy, onPress }: { spec: PrimarySpec; busy: boolean; onPress: () => void }) {
  const inner = (
    <>
      {busy ? <LoaderCircle aria-hidden="true" className="size-6 animate-spin motion-reduce:animate-none" /> : null}
      <span>{spec.label}</span>
      {busy ? <span className="sr-only">Working…</span> : null}
    </>
  );
  if (spec.href) {
    return (
      <Link href={spec.href} data-testid="host-primary" data-action="story" className={KEY}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      data-testid="host-primary"
      data-action={spec.action?.action ?? "wait"}
      data-waiting={spec.waiting || undefined}
      disabled={spec.disabled || busy}
      aria-busy={busy || undefined}
      onClick={onPress}
      className={KEY}
    >
      {inner}
    </button>
  );
}

export function ControlPanel({ state, offsetMs, metrics, features, desk, joined }: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const spec = primarySpec(state.phase === "LOBBY" ? { ...state, stats: { ...state.stats, players: joined } } : state);
  const can = controlAvailability(state);
  const { run, busy, pending } = desk;
  const over = state.phase === "ENDED";

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
    <section aria-labelledby="control-title" className="host-scroll flex min-h-0 flex-col gap-4 rounded-card border border-stage-line bg-stage-1 p-4 lg:overflow-y-auto">
      <h2 id="control-title" className="sr-only">
        Control
      </h2>
      <div className="shrink-0 space-y-3">
        <PhaseHeader state={state} offsetMs={offsetMs} />
        <PhaseTimeline timeline={timeline(state)} />
      </div>

      <div className="shrink-0">
        <StageKey spec={spec} busy={busy.has("primary")} onPress={() => spec.action && void run("primary", spec.action)} />
        <p className="mt-3 min-h-10 px-1 text-center text-small leading-5 text-muted-on-stage" data-testid="host-primary-hint">
          {spec.hint}
        </p>
      </div>

      {over ? (
        <div className="shrink-0 rounded-card border border-stage-line bg-stage-2 p-4" data-testid="host-ended-card">
          <p className="font-display text-lead leading-6">That&apos;s a wrap</p>
          <p className="mt-1 text-small text-muted-on-stage">The story page stays online, so you can share it any time. Nobody can join this show now.</p>
          <ButtonLink href="/host" variant="secondary" block className="mt-4" data-testid="host-new-show">
            Host another show
          </ButtonLink>
        </div>
      ) : null}

      <div className={cn("grid shrink-0 grid-cols-2 gap-3", over && "hidden")}>
        <ActionButton
          variant={state.paused ? "accent" : "secondary"}
          size="lg"
          data-testid="host-pause"
          disabled={state.paused ? false : !can.canPause}
          loading={busy.has("pause")}
          onClick={() => void run("pause", { action: state.paused ? "resume" : "pause" })}
        >
          {state.paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
          {state.paused ? "Resume" : "Pause"}
        </ActionButton>
        <ActionButton
          size="lg"
          data-testid="host-extend"
          disabled={!can.canExtend}
          loading={busy.has("extend")}
          onClick={() => void run("extend", { action: "extend", ms: 10000 })}
          aria-label="Add 10 seconds"
        >
          <Plus aria-hidden="true" className="size-4" />
          10 s
        </ActionButton>
      </div>

      <div className={cn("flex shrink-0 flex-col gap-2", over && "hidden")}>
        <Switch label="Auto-advance" hint="Off: you press Next round." testId="host-auto" {...toggle("auto")} />
        <Switch label="Strict filter" hint="Hides edgy ideas from the screen." testId="host-strict" {...toggle("strict")} />
        {features?.tts ? <Switch label="Voice" hint="The narrator reads each reveal aloud on the big screen." testId="host-voice" {...toggle("voice")} /> : null}
      </div>

      {state.phase === "FINALE" || over ? null : (
        <div className="mt-auto shrink-0 pt-2">
          <ActionButton variant="danger" size="lg" block disabled={!can.canEnd} data-testid="host-end" onClick={() => setConfirmEnd(true)}>
            <Power aria-hidden="true" className="size-4" />
            End show
          </ActionButton>
        </div>
      )}

      <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} title="End the show now?">
        <p className="text-muted-on-stage">Everyone jumps to the finale and the story is saved. You can&apos;t restart this show.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ActionButton variant="secondary" size="lg" onClick={() => setConfirmEnd(false)}>
            Keep playing
          </ActionButton>
          <Button
            variant="danger"
            size="md"
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
