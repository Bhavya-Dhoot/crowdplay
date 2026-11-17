"use client";
// RoundMiniature: the landing page's live example round, built from the real primitives (PaperCard, GelDisc, Stamp,
// ScriptText, StageBackdrop). It loops: idea cards rain onto the desk -> three script cards with gels -> the winner
// lifts, a CANON stamp lands and the narration is typed. Each pass is the next round, so the page's stage light
// changes amber -> teal -> lilac like a real show. CSS animations do the motion; this component only steps the phase.
//   <RoundMiniature />           no props. Decoration is aria-hidden and labelled "Example round"; the 3-step list
//                                under it is real, readable content and lights up in step with the loop.
// Under prefers-reduced-motion it shows one still frame (the reveal, text complete, stamp static, no stage-light cycle).
// It pauses off screen and in a background tab. Server-rendered as the storm phase, so the rain is already falling
// when the page first paints.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { COPY, PHASE_LABEL, creditLine } from "@/lib/copy";
import { useReducedMotion } from "@/lib/client/useReducedMotion";
import { cn } from "./cn";
import { GelDisc, gelOf, type OptionLetter } from "./GelDisc";
import { SPRING, springToLinear } from "./motionTokens";
import { PaperCard } from "./PaperCard";
import { ScriptText } from "./ScriptText";
import { StageBackdrop } from "./StageBackdrop";
import { Stamp } from "./Stamp";

const STORM_MS = 4000;
const VOTE_MS = 3600;
const AFTER_TYPED_MS = 3200;
const LEAVE_MS = 175;
const ROUNDS = 3;

type Step = 0 | 1 | 2;

const LAND = springToLinear(SPRING.land.stiffness, SPRING.land.damping);
const LIFT = springToLinear(SPRING.lift.stiffness, SPRING.lift.damping);
const SPRING_VARS = {
  "--land-ease": LAND.easing,
  "--land-ms": `${LAND.durationMs}ms`,
  "--lift-ease": LIFT.easing,
  "--lift-ms": `${LIFT.durationMs}ms`,
} as CSSProperties;

// Where each idea card lands on the desk (px from the edge it names) and how it is tilted.
const RAIN: { pos: CSSProperties; tilt: number; mine?: boolean }[] = [
  { pos: { left: 0, top: 4 }, tilt: -3 },
  { pos: { right: 0, top: 40 }, tilt: 2.5 },
  { pos: { left: "9%", top: 84 }, tilt: -1.5, mine: true },
  { pos: { right: "2%", top: 128 }, tilt: 3 },
  { pos: { left: 0, top: 152 }, tilt: -2.5 },
  { pos: { right: "16%", top: 190 }, tilt: 1.5 },
];

const GEL_VAR: Record<OptionLetter, string> = { A: "var(--gel-a)", B: "var(--gel-b)", C: "var(--gel-c)" };

function Storm() {
  const { ideas } = COPY.landing.example;
  return (
    <>
      {RAIN.map((r, i) => (
        <PaperCard
          key={ideas[i]}
          tilt={r.tilt}
          edge={r.mine ? "gold" : undefined}
          className="mini-idea rounded-element px-3 py-2 text-small leading-tight font-medium whitespace-nowrap"
          style={{ ...r.pos, "--delay": `${i * 340}ms` } as CSSProperties}
        >
          {ideas[i]}
        </PaperCard>
      ))}
    </>
  );
}

function OptionRow({ letter, text, pct, filled }: { letter: OptionLetter; text: string; pct: number; filled?: boolean }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <GelDisc letter={letter} size={30} />
        <span className="min-w-0 flex-1 text-small leading-snug font-semibold">{text}</span>
        <span className="text-fine font-semibold text-ink-muted tabular-nums">{pct}%</span>
      </div>
      <span className="mini-bar" aria-hidden="true">
        <i style={{ "--w": filled ? 1 : pct / 100, "--g": GEL_VAR[letter] } as CSSProperties} />
      </span>
    </>
  );
}

function Vote() {
  const { options } = COPY.landing.example;
  return (
    <div className="flex flex-col gap-3">
      {options.map((o, i) => (
        <PaperCard
          key={o.letter}
          gel={gelOf(o.letter as OptionLetter)}
          className="mini-opt flex flex-col gap-1.5 px-3 pt-3.5 pb-2.5"
          style={{ "--delay": `${i * 130}ms` } as CSSProperties}
        >
          <OptionRow letter={o.letter as OptionLetter} text={o.text} pct={o.pct} />
          {o.letter === "C" ? <Stamp kind="wildcard" size="sm" delayMs={700} className="absolute -top-2.5 right-3" /> : null}
        </PaperCard>
      ))}
    </div>
  );
}

function Reveal({ still, onDone, showCredit }: { still: boolean; onDone: () => void; showCredit: boolean }) {
  const { options, narration, credit } = COPY.landing.example;
  const win = options[0];
  return (
    <div className="flex flex-col gap-3">
      <PaperCard gel="a" edge="gold" className="mini-win flex flex-col gap-1.5 px-3 pt-3.5 pb-2.5">
        <OptionRow letter="A" text={win.text} pct={win.pct} filled />
        <Stamp kind="canon" size="md" animate={!still} delayMs={420} className="absolute -top-3.5 right-3" />
      </PaperCard>
      <PaperCard tone="paper-2" className="mini-page rounded-element px-3.5 py-3">
        <ScriptText text={narration} cps={36} delayMs={still ? 0 : 1100} className="text-body text-ink" onDone={onDone} />
        <p className="mini-credit mt-2 text-fine font-semibold text-ink-muted" data-show={showCredit}>
          Written by {creditLine([{ name: credit.name, bot: false }], credit.more)}
        </p>
      </PaperCard>
    </div>
  );
}

const STEP_PHASE = ["STORM", "VOTE", "REVEAL"] as const;

export function RoundMiniature() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState<Step>(0);
  const [leaving, setLeaving] = useState(false);
  const [round, setRound] = useState(0);
  const [typedDone, setTypedDone] = useState(false);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const active = inView && tabVisible && !reduced;
  const shown: Step = reduced ? 2 : step;

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Storm and vote hold for a fixed time; the reveal holds until the narration has been typed.
  useEffect(() => {
    if (!active) return;
    const hold = step === 0 ? STORM_MS : step === 1 ? VOTE_MS : typedDone ? AFTER_TYPED_MS : null;
    if (hold === null) return;
    const t1 = window.setTimeout(() => setLeaving(true), hold);
    const t2 = window.setTimeout(() => {
      setLeaving(false);
      if (step === 2) {
        setStep(0);
        setRound((r) => r + 1);
        setTypedDone(false);
      } else setStep((step + 1) as Step);
    }, hold + LEAVE_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active, step, typedDone]);

  const onTyped = useCallback(() => setTypedDone(true), []);
  const roundNo = (round % ROUNDS) + 1;
  const { label, description, prompt } = COPY.landing.example;

  return (
    <div ref={root} className="mini" style={SPRING_VARS}>
      <StageBackdrop roundNo={reduced ? 1 : roundNo} />
      <p className="sr-only">{description}</p>
      <div aria-hidden="true" className="mini-stage">
        <div className="mini-top">
          <div className="min-w-0">
            <p className="text-fine font-medium text-muted-on-stage tabular-nums">
              {label} · Round {reduced ? 1 : roundNo} / {ROUNDS}
            </p>
            <p key={shown} className="mini-phase font-display text-lead leading-7 font-extrabold text-on-stage">
              {PHASE_LABEL[STEP_PHASE[shown]]}
            </p>
          </div>
          <svg key={`${round}-${shown}`} width="32" height="32" viewBox="0 0 32 32" className="shrink-0 -rotate-90">
            <circle cx="16" cy="16" r="14" fill="none" stroke="var(--stage-2)" strokeWidth="3" />
            {shown < 2 ? (
              <circle
                className="mini-ring"
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="var(--light)"
                strokeWidth="3"
                strokeLinecap="round"
                pathLength="1"
                style={{ "--ring-ms": `${shown === 0 ? STORM_MS : VOTE_MS}ms` } as CSSProperties}
              />
            ) : null}
          </svg>
        </div>
        <p className="mini-prompt script text-on-stage">{prompt}</p>
        <div className={cn("mini-body")} data-leaving={leaving}>
          {shown === 0 ? <Storm key={round} /> : null}
          {shown === 1 ? <Vote key={round} /> : null}
          {shown === 2 ? <Reveal key={round} still={reduced} onDone={onTyped} showCredit={reduced || typedDone} /> : null}
        </div>
      </div>

      <ol className="mini-steps">
        {COPY.landing.steps.map((s, i) => (
          <li key={s.title} data-active={shown === i}>
            <span aria-hidden="true" className="mini-num">
              {i + 1}
            </span>
            <p className="text-small leading-snug text-muted-on-stage">
              <strong className="font-display text-body font-bold text-on-stage">{s.title}.</strong> {s.body}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
