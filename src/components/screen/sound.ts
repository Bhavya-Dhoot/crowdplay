// Screen sound: pure scheduling rules (testable) and a tiny WebAudio synth (no audio files).
// Off by default; the page keeps the choice in localStorage. Nothing here may throw into React:
// every audio call is wrapped, because autoplay rules can refuse at any time.
import type { Phase, PublicState } from "@/lib/realtime/types";

type Cue = "tick" | "whoosh" | "sting";

/** A tick is due when the whole-seconds figure changes to 5..1 during STORM or VOTE. */
export function tickDue(phase: Phase, seconds: number | null, prev: number | null, paused: boolean): boolean {
  if (paused || seconds === null || seconds === prev) return false;
  if (phase !== "STORM" && phase !== "VOTE") return false;
  return seconds >= 1 && seconds <= 5;
}

/** A soft tick when the head-count grows in the lobby (someone just joined). Opening the page mid-lobby stays silent. */
export function joinTickDue(phase: Phase, players: number, prev: number | null): boolean {
  return phase === "LOBBY" && prev !== null && players > prev;
}

/**
 * The one-shot cue for a phase change: a whoosh when the options appear (VOTE), a sting on REVEAL.
 * Opening the page mid-phase (prev = null) stays silent.
 */
export function cueFor(prev: Phase | null, next: Phase): Exclude<Cue, "tick"> | null {
  if (prev === null || prev === next) return null;
  if (next === "VOTE") return "whoosh";
  if (next === "REVEAL") return "sting";
  return null;
}

/** One narrator clip per round: the key changes with the round, and only exists when a clip exists. */
export function ttsKey(state: Pick<PublicState, "showId" | "roundNo" | "outcome"> | null): string | null {
  const url = state?.outcome?.ttsUrl;
  return state && url ? `${state.showId}:${state.roundNo}:${url}` : null;
}

export const SOUND_STORAGE_KEY = "cp.screen.sound";

// ---------- synth ----------

export type Synth = { resume(): void; play(cue: Cue): void; close(): void };

type AudioCtor = typeof AudioContext;

export function createSynth(): Synth | null {
  if (typeof window === "undefined") return null;
  const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  const tone = (freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + dur + 0.02);
  };

  const whoosh = (at: number) => {
    const len = Math.floor(ctx.sampleRate * 0.7);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(260, at);
    f.frequency.exponentialRampToValueAtTime(3200, at + 0.45);
    f.frequency.exponentialRampToValueAtTime(900, at + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5, at + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    src.connect(f).connect(g).connect(master);
    src.start(at);
  };

  const play = (cue: Cue): void => {
    try {
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const t = ctx.currentTime + 0.01;
      if (cue === "tick") tone(1100, t, 0.07, 0.35, "triangle");
      else if (cue === "whoosh") whoosh(t);
      else {
        [523.25, 659.25, 783.99].forEach((f, i) => tone(f, t + i * 0.09, 0.5, 0.22, "triangle"));
        tone(1046.5, t + 0.3, 1.1, 0.28, "sine");
        tone(523.25, t + 0.3, 1.1, 0.16, "sawtooth");
      }
    } catch {
      /* audio is a nicety, never a failure */
    }
  };

  return {
    resume: () => {
      try {
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      } catch {
        /* ignore */
      }
    },
    play,
    close: () => {
      try {
        void ctx.close().catch(() => {});
      } catch {
        /* ignore */
      }
    },
  };
}
