"use client";
// Console column 1: the stage key (one big button that follows the phase), pause / +10 s, the three
// toggles and End show with a confirm. The engine decides what is legal (controlAvailability mirrors
// machine.ts), so buttons the server would ignore are disabled instead of failing.
import { Pause, Play, Plus, Power } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PhaseHeader } from "@/components/ui/PhaseHeader";
import { Sheet } from "@/components/ui/Sheet";
import type { HostMetrics } from "@/lib/api/contracts";
import type { Features } from "@/lib/config";
import type { PublicState } from "@/lib/realtime/types";
import { controlAvailability, primarySpec } from "./consoleLogic";
import { ActionButton, Switch } from "./controls";
import type { HostDesk } from "./useHostDesk";
import "./host.css";

type Props = {
  state: PublicState;
  offsetMs: number;
  metrics: HostMetrics | null;
  features: Features | null;
  desk: HostDesk;
};

export function ControlPanel({ state, offsetMs, metrics, features, desk }: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const spec = primarySpec(state);
  const can = controlAvailability(state);
  const { run, busy, pending } = desk;

  const toggle = (key: "auto" | "strict" | "voice") => {
    const current = key === "auto" ? metrics?.autoAdvance : key === "strict" ? metrics?.strictFilter : metrics?.voice;
    const value = pending[key] ?? current ?? false;
    return {
      checked: value,
      busy: key in pending && busy.has(key),
      disabled: metrics === null || state.phase === "ENDED",
      onChange: (next: boolean) =>
        void run(
          key,
          key === "auto" ? { action: "autoAdvance", on: next } : key === "strict" ? { action: "strictFilter", on: next } : { action: "voice", on: next },
          { key, value: next },
        ),
    };
  };

  const primaryBusy = busy.has("primary");
  const keyInner = (
    <>
      <span>{spec.label}</span>
      {primaryBusy ? <span className="sr-only">Working…</span> : null}
    </>
  );

  return (
    <section aria-labelledby="control-title" className="flex min-h-0 flex-col gap-4 rounded-card border border-line bg-surface p-4 lg:overflow-y-auto host-scroll">
      <h2 id="control-title" className="sr-only">
        Control
      </h2>
      <PhaseHeader state={state} offsetMs={offsetMs} className="shrink-0" />

      <div className="shrink-0">
        {spec.href ? (
          <Link href={spec.href} data-testid="host-primary" data-action="story" className="stage-key" style={{ textDecoration: "none" }}>
            {keyInner}
          </Link>
        ) : (
          <button
            type="button"
            data-testid="host-primary"
            data-action={spec.action?.action ?? "wait"}
            data-waiting={spec.waiting || undefined}
            disabled={spec.disabled || primaryBusy}
            aria-busy={primaryBusy || undefined}
            onClick={() => spec.action && void run("primary", spec.action)}
            className={cn("stage-key", primaryBusy && "opacity-80")}
          >
            {keyInner}
          </button>
        )}
        <p className="mt-3 min-h-10 px-1 text-center text-sm leading-5 text-muted" data-testid="host-primary-hint">
          {spec.hint}
        </p>
      </div>

      {state.phase === "ENDED" ? (
        <div className="shrink-0 rounded-card border border-line bg-surface-2 p-4" data-testid="host-ended-card">
          <p className="font-display text-lg leading-6">That&apos;s a wrap</p>
          <p className="mt-1 text-sm text-muted">The story page stays online, so you can share it any time. Nobody can join this show now.</p>
          <ButtonLink href="/host" variant="secondary" block className="mt-4" data-testid="host-new-show">
            Host another show
          </ButtonLink>
        </div>
      ) : null}

      <div className={cn("grid shrink-0 grid-cols-2 gap-2", state.phase === "ENDED" && "hidden")}>
        <ActionButton
          variant={state.paused ? "accent" : "secondary"}
          data-testid="host-pause"
          disabled={state.paused ? false : !can.canPause}
          loading={busy.has("pause")}
          onClick={() => void run("pause", { action: state.paused ? "resume" : "pause" })}
          className="min-h-12"
        >
          {state.paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
          {state.paused ? "Resume" : "Pause"}
        </ActionButton>
        <ActionButton
          data-testid="host-extend"
          disabled={!can.canExtend}
          loading={busy.has("extend")}
          onClick={() => void run("extend", { action: "extend", ms: 10000 })}
          className="min-h-12"
          aria-label="Add 10 seconds"
        >
          <Plus aria-hidden="true" className="size-4" />
          10 s
        </ActionButton>
      </div>

      <div className={cn("flex shrink-0 flex-col gap-2", state.phase === "ENDED" && "hidden")}>
        <Switch
          label="Auto-advance"
          hint="Off: you press Next round after each reveal."
          testId="host-auto"
          {...toggle("auto")}
        />
        <Switch label="Strict filter" hint="Blocks edgy ideas before anyone sees them." testId="host-strict" {...toggle("strict")} />
        {features?.tts ? <Switch label="Voice" hint="The narrator reads each reveal aloud on the big screen." testId="host-voice" {...toggle("voice")} /> : null}
      </div>

      {state.phase === "FINALE" || state.phase === "ENDED" ? null : (
        <div className="mt-auto shrink-0 pt-2">
          <ActionButton variant="danger" block disabled={!can.canEnd} data-testid="host-end" onClick={() => setConfirmEnd(true)} className="min-h-12">
            <Power aria-hidden="true" className="size-4" />
            End show
          </ActionButton>
        </div>
      )}

      <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} title="End the show now?">
        <p className="text-muted">Everyone jumps to the finale and the story is saved. You can&apos;t restart this show.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ActionButton variant="ghost" className="min-h-12" onClick={() => setConfirmEnd(false)}>
            Keep playing
          </ActionButton>
          <ActionButton
            variant="danger"
            className="min-h-12"
            data-testid="host-end-confirm"
            loading={busy.has("end")}
            onClick={() => {
              void run("end", { action: "endShow" }).then((ok) => {
                if (ok) setConfirmEnd(false);
              });
            }}
          >
            End show
          </ActionButton>
        </div>
      </Sheet>
    </section>
  );
}
