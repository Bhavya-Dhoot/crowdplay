"use client";
// /try (UX_SPEC §3.6, design-v3 §4): a judge alone on one device plays a whole 3-round show against 30 labelled bots.
//
//   go     the landing button opens /try?go=1: a random name is picked and the demo starts at once
//   intro  /try without go=1 (or after a failed direct start): name note + "Start the demo"
//   live   desktop: your phone (drawn as an ink-outlined device) on the left, the mini big screen (a drawn 16:9 box)
//          on the right, a fat arrow between; phone: the phone fills the page, with the big screen one tap away behind
//          the banner's screen icon (it drops down over the phone, nothing pushes it down)
//   end    after FINALE the end card points at the real product (a bar under the finale on a phone)
// The demo room code lives in sessionStorage so a reload resumes the show instead of starting a second one.
import { ChevronDown, LogOut, Monitor } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useVisualViewport } from "@/components/play/hooks";
import { PlayerView, type CoachStep } from "@/components/play/PlayerView";
import { ScreenStage } from "@/components/screen/ScreenStage";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { FatArrow } from "@/components/ui/FatArrow";
import { Footer } from "@/components/ui/Footer";
import { MotionScope } from "@/components/ui/motion";
import { NexconnBadge } from "@/components/ui/NexconnBadge";
import { PaperCard } from "@/components/ui/PaperCard";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { getRoom, startTry } from "@/lib/client/api";
import { ensureSession, getSession, getStoredName } from "@/lib/client/session";
import { COPY, friendlyError, randomName } from "@/lib/copy";
import { CoachReporter, CoachStrip, useCoachMarks } from "./CoachSlot";
import { DemoBanner } from "./DemoBanner";
import { EndCard } from "./EndCard";
import { NameEdit } from "./NameEdit";
import { Seating } from "./Seating";
import { TryIntro } from "./TryIntro";
import { TRY_COPY } from "./tryCopy";

const CODE_KEY = "cp_try_code";

function readCode(): string | null {
  try {
    return window.sessionStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
}
function writeCode(code: string | null): void {
  try {
    if (code) window.sessionStorage.setItem(CODE_KEY, code);
    else window.sessionStorage.removeItem(CODE_KEY);
  } catch {
    /* private mode: a reload then starts a fresh demo, which is fine */
  }
}

/** "PHASE:ROUND" of the room as PlayerView renders it (its data-testid="phase" root), observed without another connection. */
function usePhaseKey(root: HTMLElement | null): string {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!root) return () => {};
      const mo = new MutationObserver(onChange);
      mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-phase", "data-round"] });
      return () => mo.disconnect();
    },
    [root],
  );
  return useSyncExternalStore(
    subscribe,
    () => {
      const el = root?.querySelector('[data-testid="phase"]');
      return el ? `${el.getAttribute("data-phase") ?? ""}:${el.getAttribute("data-round") ?? "0"}` : ":0";
    },
    () => ":0",
  );
}

function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
}

const iconButton = "press inline-flex size-11 shrink-0 items-center justify-center rounded-blob text-ink-notes hover:text-ink";

/** The bolt, drawn once by the pen (ink outline, grey marker fill): the wildcard's mark. */
function BoltDoodle() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0 overflow-visible" fill="var(--marker-1)" stroke="var(--ink)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 2.5 5 13.6h6.2l-1.4 7.9 8.6-11.6h-6.3z" pathLength="1" className="draw" data-play style={{ "--draw-ms": "420ms" } as CSSProperties} />
    </svg>
  );
}

/** The honest boost explainer: a small note with the bolt doodle; the chip text and the sentence say what the bots do. */
function BoostNote({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <PaperCard as="div" tilt={-0.5} className="w-fit max-w-[60ch] rounded-element px-3 shadow-slip">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="try-boost"
        onClick={onToggle}
        className="press flex min-h-11 w-full items-center gap-2 rounded-element text-left font-display text-small text-ink"
      >
        <BoltDoodle />
        {TRY_COPY.boost.chip}
        <ChevronDown aria-hidden="true" className={cn("ml-auto size-4 text-ink-notes transition-transform motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <p id="try-boost" hidden={!open} className="pb-3 text-small text-ink-notes">
        {TRY_COPY.boost.body}
      </p>
    </PaperCard>
  );
}

function LiveDemo({ code }: { code: string }) {
  const vv = useVisualViewport();
  const wide = useWide();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [screenOpen, setScreenOpen] = useState(false);
  const [boostPref, setBoostPref] = useState<boolean | null>(null);
  const [rawStep, setRawStep] = useState<CoachStep | null>(null);
  const [name, setName] = useState(() => getSession()?.displayName ?? getStoredName() ?? "");
  const [showId, setShowId] = useState<string | null>(null);

  const [phase, roundText] = usePhaseKey(root).split(":");
  const round = Number(roundText) || 0;
  const finished = phase === "FINALE" || phase === "ENDED";
  const coach = useCoachMarks(rawStep, phase, round);
  const boostOpen = boostPref ?? round <= 1;

  useEffect(() => {
    if (!finished) return;
    let alive = true;
    void getRoom(code).then((r) => {
      if (alive && r.ok) setShowId(r.room.showId);
    });
    return () => {
      alive = false;
    };
  }, [finished, code]);

  const renderCoach = useCallback((step: CoachStep | null) => <CoachReporter step={step} onStep={setRawStep} />, []);

  return (
    <MotionScope>
      <div
        ref={setRoot}
        className="fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden overscroll-none text-ink"
        style={vv ? { top: vv.top, height: vv.height } : undefined}
      >
        <StageBackdrop />
        <DemoBanner>
          <button
            type="button"
            aria-expanded={screenOpen}
            aria-controls="try-screen"
            aria-label={screenOpen ? TRY_COPY.screen.hide : TRY_COPY.screen.show}
            title={screenOpen ? TRY_COPY.screen.hide : TRY_COPY.screen.show}
            onClick={() => setScreenOpen((v) => !v)}
            className={cn(iconButton, "lg:hidden", screenOpen && "bg-marker-1 text-ink")}
          >
            <Monitor aria-hidden="true" className="size-5" />
          </button>
          <Link href="/" aria-label={TRY_COPY.leave} title={TRY_COPY.leave} className={cn(iconButton, "gap-1.5 sm:w-auto sm:px-3 sm:text-small")}>
            <LogOut aria-hidden="true" className="size-5 sm:size-4" />
            <span className="hidden sm:inline">{TRY_COPY.leave}</span>
          </Link>
        </DemoBanner>

        <main
          id="main"
          className="relative mx-auto flex min-h-0 w-full max-w-[1380px] flex-1 flex-col lg:grid lg:grid-cols-[400px_72px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:px-8 lg:pt-4 lg:pb-3"
        >
          <div className="flex min-h-0 flex-1 flex-col lg:col-start-1 lg:row-start-1">
            <div className="relative flex min-h-0 flex-1 flex-col">
              {/* the fineliner's second pass: a thinner, lighter line a hair off the first */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-[6px] hidden rotate-[0.4deg] rounded-[38px_34px_40px_32px/34px_40px_32px_38px] border-[1.5px] border-ink/30 lg:block"
              />
              <section
                aria-label={TRY_COPY.phone}
                className="dot-grid relative min-h-0 flex-1 overflow-hidden lg:rounded-[34px_38px_32px_36px/36px_32px_38px_34px] lg:border-[3px] lg:border-ink lg:pt-5 lg:shadow-poster"
              >
                <span aria-hidden="true" className="pointer-events-none absolute top-2 left-1/2 hidden h-[7px] w-16 -translate-x-1/2 rounded-pill bg-ink lg:block" />
                <PlayerView code={code} coach={renderCoach} backdrop={false} className="h-full" />
              </section>
            </div>
            <CoachStrip coach={coach} className="lg:pt-4" />
            {finished && !wide ? (
              <div className="mx-auto w-full max-w-[480px] shrink-0 px-1.5">
                <EndCard compact showId={showId} />
              </div>
            ) : null}
          </div>

          <div aria-hidden="true" className="hidden items-center justify-center lg:col-start-2 lg:row-start-1 lg:flex">
            <FatArrow size={44} delayMs={700} seed="try-arrow" />
          </div>

          <aside
            id="try-screen"
            aria-label={TRY_COPY.screen.label}
            className={cn(
              "min-h-0 flex-col gap-3",
              screenOpen
                ? "absolute inset-x-2 top-0 z-30 flex max-h-[calc(100%-8px)] overflow-y-auto rounded-card border-[2.5px] border-ink bg-paper-raised p-4 shadow-marker"
                : "hidden",
              "lg:static lg:z-auto lg:col-start-3 lg:row-start-1 lg:flex lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
            )}
          >
            {/* The mini screen keeps its 16:9 and shrinks with the window height, so the end card and the boost note always fit. */}
            <div
              className="mx-auto w-full max-w-[860px] lg:my-auto lg:max-w-[var(--screen-w)]"
              style={{ "--screen-w": `max(360px, min(860px, calc((100dvh - ${finished ? 500 : 310}px) * 16 / 9)))` } as CSSProperties}
            >
              {finished && wide ? <EndCard showId={showId} className="mt-5 mb-6" /> : null}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <div>
                  <h2 className="text-lead">{TRY_COPY.screen.label}</h2>
                  <p className="text-small text-ink-notes">{TRY_COPY.screen.note}</p>
                </div>
                <NameEdit name={name} onSaved={setName} />
              </div>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-[5px] hidden -rotate-[0.35deg] rounded-[26px_20px_28px_22px/20px_28px_22px_26px] border-[1.5px] border-ink/30 lg:block"
                />
                <div className="dot-grid relative overflow-hidden rounded-card border-[2.5px] border-ink shadow-marker lg:shadow-poster">
                  <ScreenStage code={code} compact />
                </div>
              </div>
              <div className="mt-5">
                <BoostNote open={boostOpen} onToggle={() => setBoostPref(!boostOpen)} />
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setScreenOpen(false)} className="mt-4 lg:hidden">
                {TRY_COPY.screen.hide}
              </Button>
            </div>
          </aside>
        </main>

        <div className="mx-auto hidden w-full max-w-[1380px] shrink-0 items-center justify-end px-8 pb-2 lg:flex">
          <NexconnBadge />
        </div>
      </div>
    </MotionScope>
  );
}

export function TryExperience({ autoStart = false }: { autoStart?: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [view, setView] = useState<"seating" | "intro">(autoStart ? "seating" : "intro");
  const [retry, setRetry] = useState<{ name: string; error: string } | null>(null);
  const startedOnce = useRef(false);

  /** Resolves null on success, or the sentence to show under the name box. */
  const start = useCallback(async (name: string): Promise<string | null> => {
    const s = await ensureSession(name);
    if (!s.ok) return friendlyError(s.code, s.message);
    const t = await startTry();
    if (!t.ok) return t.message;
    writeCode(t.code);
    try {
      window.history.replaceState(null, "", "/try"); // a reload resumes this demo; it never starts a second one
    } catch {
      /* the address bar keeps ?go=1, which is harmless */
    }
    setCode(t.code);
    return null;
  }, []);

  // A reload mid-show goes back to the same demo room, as long as it is still running; otherwise ?go=1 starts one.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = readCode();
      if (stored) {
        const r = await getRoom(stored);
        if (cancelled) return;
        if (r.ok && r.room.isDemo && r.room.phase !== "FINALE" && r.room.phase !== "ENDED") return setCode(stored);
        writeCode(null);
      }
      if (!autoStart || startedOnce.current) return;
      startedOnce.current = true;
      const name = getStoredName() ?? randomName();
      const failure = await start(name);
      if (failure) {
        setRetry({ name, error: failure });
        setView("intro");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoStart, start]);

  if (code) return <LiveDemo code={code} />;
  return (
    <div className="flex min-h-dvh flex-col text-ink">
      <StageBackdrop />
      <DemoBanner />
      <header className="mx-auto flex w-full max-w-xl items-center px-4 pt-3">
        <Link href="/" className="inline-flex min-h-11 items-center font-display text-lead">
          {COPY.brand}
        </Link>
      </header>
      <main id="main" className="flex-1">
        {view === "seating" ? <Seating /> : <TryIntro onStart={start} initialName={retry?.name} initialError={retry?.error} />}
      </main>
      <Footer />
    </div>
  );
}
