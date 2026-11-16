"use client";
// Sound for the big screen: off by default, remembered in localStorage, never required.
//   const { on, toggle } = useScreenSound({ state, offsetMs, enabled })
//   - ticks in the last 5 s of STORM and VOTE, a whoosh when the options appear, a sting on REVEAL
//   - plays state.outcome.ttsUrl once per round when the toggle is on (play() rejections are swallowed)
// `enabled` false (the embedded mini screen) keeps everything silent and the toggle inert.
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useCountdown } from "@/lib/client/useCountdown";
import type { Phase, PublicState } from "@/lib/realtime/types";
import { createSynth, cueFor, SOUND_STORAGE_KEY, tickDue, ttsKey, type Synth } from "./sound";

// The choice lives in a tiny external store so it survives remounts and works when storage is blocked.
let remembered: boolean | null = null;
const listeners = new Set<() => void>();

function readSound(): boolean {
  if (remembered === null) {
    try {
      remembered = window.localStorage.getItem(SOUND_STORAGE_KEY) === "1";
    } catch {
      remembered = false;
    }
  }
  return remembered;
}
function writeSound(on: boolean): void {
  remembered = on;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* blocked storage: the choice lasts until reload */
  }
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

type Args = { state: PublicState | null; offsetMs: number; enabled: boolean };

export function useScreenSound({ state, offsetMs, enabled }: Args): { on: boolean; toggle: () => void } {
  const stored = useSyncExternalStore(subscribe, readSound, () => false);
  const on = enabled && stored;
  const synth = useRef<Synth | null>(null);
  const prevPhase = useRef<Phase | null>(null);
  const prevSeconds = useRef<number | null>(null);
  const spoken = useRef<Set<string>>(new Set());
  const confirm = useRef(false);

  const phase = state?.phase ?? null;
  const paused = state?.paused ?? false;
  const clip = ttsKey(state);
  const clipUrl = state?.outcome?.ttsUrl ?? null;
  const count = useCountdown({ endsAt: state?.phaseEndsAt ?? null, startedAt: state?.phaseStartedAt ?? null, offsetMs, paused });

  // The synth exists only while sound is on. Browsers keep it suspended until the page has seen a
  // click or key press, so resume on the first one (the toggle click itself counts).
  useEffect(() => {
    if (!on) return;
    const s = createSynth();
    synth.current = s;
    s?.resume();
    if (confirm.current) s?.play("tick"); // an audible yes to the click that switched it on
    confirm.current = false;
    const wake = () => s?.resume();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      s?.close();
      synth.current = null;
    };
  }, [on]);

  const seconds = count.seconds;
  useEffect(() => {
    const prev = prevSeconds.current;
    prevSeconds.current = seconds;
    if (on && phase && tickDue(phase, seconds, prev, paused)) synth.current?.play("tick");
  }, [seconds, on, phase, paused]);

  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = phase;
    if (!on || !phase) return;
    const cue = cueFor(prev, phase);
    if (cue) synth.current?.play(cue);
  }, [phase, on]);

  useEffect(() => {
    if (!on || !clip || !clipUrl || spoken.current.has(clip)) return;
    spoken.current.add(clip);
    let audio: HTMLAudioElement | null = null;
    try {
      audio = new Audio(clipUrl);
      void audio.play().catch(() => {});
    } catch {
      /* no audio element, no narrator voice */
    }
    return () => audio?.pause();
  }, [on, clip, clipUrl]);

  const toggle = useCallback(() => {
    if (!enabled) return;
    const next = !readSound();
    confirm.current = next;
    writeSound(next);
  }, [enabled]);

  return { on, toggle };
}
