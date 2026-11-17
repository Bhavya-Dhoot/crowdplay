"use client";
// /try (UX_SPEC §3.6): a judge alone on one device plays a whole 3-round show against 30 labelled bots.
//
//   go     the landing button opens /try?go=1: a random name is picked and the demo starts at once
//   intro  /try without go=1 (or after a failed direct start): name box + "Start the demo"
//   live   desktop: your phone on the left, the mini big screen on the right; phone: the phone, with the big screen
//          one tap away behind the banner's screen icon (it opens over the phone, nothing pushes it down)
//   end    after FINALE the end card points at the real product (a bar under the finale on a phone)
// The demo room code lives in sessionStorage so a reload resumes the show instead of starting a second one.
import { ChevronDown, LoaderCircle, LogOut, Monitor } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useVisualViewport } from "@/components/play/hooks";
import { PlayerView, type CoachStep } from "@/components/play/PlayerView";
import { ScreenStage } from "@/components/screen/ScreenStage";
import { cn } from "@/components/ui/cn";
import { Footer } from "@/components/ui/Footer";
import { MotionScope } from "@/components/ui/motion";
import { NexconnBadge } from "@/components/ui/NexconnBadge";
import { PaperCard } from "@/components/ui/PaperCard";
import { getRoom, startTry } from "@/lib/client/api";
import { ensureSession, getSession, getStoredName } from "@/lib/client/session";
import { COPY, friendlyError, randomName } from "@/lib/copy";
import { CoachReporter, CoachStrip, useCoachMarks } from "./CoachSlot";
import { DemoBanner } from "./DemoBanner";
import { EndCard } from "./EndCard";
import { NameEdit } from "./NameEdit";
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

const iconButton =
  "press inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-muted-on-stage [--press-overlay:rgb(255_255_255/0.1)] hover:text-on-stage";

function BoostNote({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="try-boost"
        onClick={onToggle}
        className="press inline-flex min-h-11 items-center gap-2 rounded-pill border border-stage-line bg-stage-1 px-4 text-small font-semibold text-on-stage [--press-overlay:rgb(255_255_255/0.08)]"
      >
        {TRY_COPY.boost.chip}
        <ChevronDown aria-hidden="true" className={cn("size-4 text-muted-on-stage transition-transform motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <p id="try-boost" hidden={!open} className="mt-2 max-w-[60ch] text-small text-muted-on-stage">
        {TRY_COPY.boost.body}
      </p>
    </div>
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
        className="fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden overscroll-none bg-stage-0 text-on-stage"
        style={vv ? { top: vv.top, height: vv.height } : undefined}
      >
        <DemoBanner>
          <button
            type="button"
            aria-expanded={screenOpen}
            aria-controls="try-screen"
            aria-label={screenOpen ? TRY_COPY.screen.hide : TRY_COPY.screen.show}
            title={screenOpen ? TRY_COPY.screen.hide : TRY_COPY.screen.show}
            onClick={() => setScreenOpen((v) => !v)}
            className={cn(iconButton, "lg:hidden", screenOpen && "bg-stage-2 text-on-stage")}
          >
            <Monitor aria-hidden="true" className="size-5" />
          </button>
          <Link href="/" aria-label={TRY_COPY.leave} title={TRY_COPY.leave} className={cn(iconButton, "gap-1.5 sm:w-auto sm:px-3 sm:text-small sm:font-semibold")}>
            <LogOut aria-hidden="true" className="size-5 sm:size-4" />
            <span className="hidden sm:inline">{TRY_COPY.leave}</span>
          </Link>
        </DemoBanner>

        <main
          id="main"
          className="relative flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-x-10 lg:px-10 lg:pt-3 lg:pb-3 xl:grid-cols-[420px_minmax(0,1fr)]"
        >
          <div className="flex min-h-0 flex-1 flex-col lg:col-start-1 lg:row-start-1">
            <section
              aria-label={TRY_COPY.phone}
              className="min-h-0 flex-1 overflow-hidden border-t border-stage-line lg:rounded-[32px] lg:border lg:bg-stage-0"
            >
              <PlayerView code={code} coach={renderCoach} className="h-full" />
            </section>
            <CoachStrip coach={coach} />
            {finished && !wide ? <EndCard compact showId={showId} className="mt-2 shrink-0" /> : null}
          </div>

          <aside
            id="try-screen"
            aria-label={TRY_COPY.screen.label}
            className={cn(
              "min-h-0 flex-col gap-3",
              screenOpen
                ? "absolute inset-x-0 top-0 z-30 flex max-h-full overflow-y-auto border-b border-stage-line bg-stage-0/95 p-4 shadow-2xl backdrop-blur-xl"
                : "hidden",
              "lg:static lg:z-auto lg:col-start-2 lg:row-start-1 lg:flex lg:max-h-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none",
            )}
          >
            {finished && wide ? <EndCard showId={showId} /> : null}
            <div className="mx-auto w-full max-w-[860px] lg:my-auto">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <div>
                  <h2 className="font-display text-lead font-bold">{TRY_COPY.screen.label}</h2>
                  <p className="text-small text-muted-on-stage">{TRY_COPY.screen.note}</p>
                </div>
                <NameEdit name={name} onSaved={setName} />
              </div>
              <div className="overflow-hidden rounded-card border border-stage-line">
                <ScreenStage code={code} compact />
              </div>
              <div className="mt-3">
                <BoostNote open={boostOpen} onToggle={() => setBoostPref(!boostOpen)} />
              </div>
              <button
                type="button"
                onClick={() => setScreenOpen(false)}
                className="press mt-3 inline-flex min-h-11 items-center rounded-pill bg-paper px-5 text-small font-semibold text-ink lg:hidden"
              >
                {TRY_COPY.screen.hide}
              </button>
            </div>
          </aside>
        </main>

        <div className="hidden shrink-0 items-center justify-end border-t border-stage-line/60 px-10 py-0.5 lg:flex">
          <NexconnBadge />
        </div>
      </div>
    </MotionScope>
  );
}

/** Between "the button was pressed" and "the room exists": a card, not a flash of the intro form. */
function Seating() {
  return (
    <section aria-live="polite" className="mx-auto w-full max-w-md px-4 pt-16">
      <PaperCard className="flex items-center gap-4 rounded-card p-5">
        <LoaderCircle aria-hidden="true" className="size-7 shrink-0 animate-spin text-ink motion-reduce:animate-none" />
        <div>
          <h1 className="font-display text-h3 leading-tight font-extrabold text-ink">{TRY_COPY.stageTitle}</h1>
          <p className="text-small text-ink-muted">{TRY_COPY.stageBody}</p>
        </div>
      </PaperCard>
    </section>
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
    <div className="flex min-h-dvh flex-col bg-stage-0 text-on-stage">
      <DemoBanner />
      <header className="mx-auto flex w-full max-w-md items-center px-4 pt-3">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-lead font-extrabold tracking-tight">
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
