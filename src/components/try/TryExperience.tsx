"use client";
// /try (UX_SPEC §3.6): a judge alone on one device plays a whole 3-round show against 30 labelled bots.
//
//   intro  name box + "Start the demo" -> ensureSession -> POST /api/try
//   live   desktop: your phone (PlayerView) on the left, the mini big screen (ScreenStage compact) on the right
//          phone:   the same two, the screen collapsible on top
//   end    after FINALE the end card points at the real product
// The demo room code lives in sessionStorage so a reload resumes the show instead of starting a second one.
import { ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useVisualViewport } from "@/components/play/hooks";
import { PlayerView } from "@/components/play/PlayerView";
import { ScreenStage } from "@/components/screen/ScreenStage";
import { cn } from "@/components/ui/cn";
import { Footer } from "@/components/ui/Footer";
import { NexconnBadge } from "@/components/ui/NexconnBadge";
import { getRoom, startTry } from "@/lib/client/api";
import { ensureSession } from "@/lib/client/session";
import { friendlyError } from "@/lib/copy";
import { CoachSlot } from "./CoachSlot";
import { DemoBanner } from "./DemoBanner";
import { EndCard } from "./EndCard";
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

/** The room's phase as PlayerView renders it (its data-testid="phase" root), observed without another connection. */
function usePhase(root: HTMLElement | null): string {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!root) return () => {};
      const mo = new MutationObserver(onChange);
      mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-phase"] });
      return () => mo.disconnect();
    },
    [root],
  );
  return useSyncExternalStore(
    subscribe,
    () => root?.querySelector('[data-testid="phase"]')?.getAttribute("data-phase") ?? "",
    () => "",
  );
}

const coach = (step: Parameters<typeof CoachSlot>[0]["step"]) => <CoachSlot step={step} />;

function LiveDemo({ code }: { code: string }) {
  const vv = useVisualViewport();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [screenOpen, setScreenOpen] = useState(false);
  const phase = usePhase(root);
  const finished = phase === "FINALE" || phase === "ENDED";

  return (
    <div
      ref={setRoot}
      className="stage-light fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden overscroll-none"
      style={vv ? { top: vv.top, height: vv.height } : undefined}
    >
      <DemoBanner>
        <Link
          href="/"
          aria-label={TRY_COPY.leave}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-pill px-2 text-[13px] font-semibold text-muted transition-colors hover:text-text motion-reduce:transition-none md:text-sm"
        >
          <LogOut aria-hidden="true" className="size-5 sm:size-4" />
          <span className="hidden sm:inline">{TRY_COPY.leave}</span>
        </Link>
      </DemoBanner>

      <main
        id="main"
        className="flex min-h-0 flex-1 flex-col gap-2 pt-2 lg:grid lg:grid-cols-[minmax(380px,480px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-x-8 lg:px-8 lg:pt-5 lg:pb-3"
      >
        <aside aria-label={TRY_COPY.screen.label} className="flex shrink-0 flex-col gap-3 px-4 lg:col-start-2 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto lg:px-0">
          {finished ? <EndCard className="lg:order-first" /> : null}

          <button
            type="button"
            aria-expanded={screenOpen}
            aria-controls="try-screen"
            onClick={() => setScreenOpen((v) => !v)}
            className="inline-flex min-h-11 items-center justify-between gap-2 rounded-card border border-line bg-surface px-4 text-sm font-semibold lg:hidden"
          >
            {screenOpen ? TRY_COPY.screen.hide : TRY_COPY.screen.show}
            <ChevronDown aria-hidden="true" className={cn("size-5 text-muted transition-transform motion-reduce:transition-none", screenOpen && "rotate-180")} />
          </button>

          <div id="try-screen" className={cn(screenOpen ? "block" : "hidden", "lg:block")}>
            <div className="mx-auto w-full max-w-[760px]">
              <div className="mb-2 hidden items-baseline justify-between gap-3 lg:flex">
                <h2 className="font-display text-lg font-bold">{TRY_COPY.screen.label}</h2>
                <p className="text-sm text-muted">{TRY_COPY.screen.note}</p>
              </div>
              <div className="overflow-hidden rounded-card border border-line">
                <ScreenStage code={code} compact />
              </div>
              <div className="mt-4 hidden rounded-card border border-line bg-surface p-4 lg:block">
                <p className="font-display text-base font-bold text-wild">{TRY_COPY.boost.title}</p>
                <p className="mt-1 text-sm text-muted">{TRY_COPY.boost.body}</p>
              </div>
            </div>
          </div>
        </aside>

        <section
          aria-label={TRY_COPY.phone}
          className="min-h-0 flex-1 overflow-hidden border-t border-line lg:col-start-1 lg:row-start-1 lg:rounded-[28px] lg:border lg:bg-bg/60"
        >
          <PlayerView code={code} coach={coach} className="h-full" />
        </section>
      </main>

      <div className="flex shrink-0 items-center justify-center border-t border-line/60 px-4 py-0.5 lg:justify-end lg:px-8">
        <NexconnBadge />
      </div>
    </div>
  );
}

export function TryExperience() {
  const [code, setCode] = useState<string | null>(null);

  // A reload mid-show goes back to the same demo room, as long as it is still running.
  useEffect(() => {
    const stored = readCode();
    if (!stored) return;
    let cancelled = false;
    void getRoom(stored).then((r) => {
      if (cancelled) return;
      if (r.ok && r.room.isDemo && r.room.phase !== "FINALE" && r.room.phase !== "ENDED") setCode(stored);
      else writeCode(null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Resolves null on success, or the sentence to show under the name box. */
  const start = useCallback(async (name: string): Promise<string | null> => {
    const s = await ensureSession(name);
    if (!s.ok) return friendlyError(s.code, s.message);
    const t = await startTry();
    if (!t.ok) return t.message;
    writeCode(t.code);
    setCode(t.code);
    return null;
  }, []);

  if (code) return <LiveDemo code={code} />;
  return (
    <div className="stage-light flex min-h-dvh flex-col">
      <DemoBanner />
      <header className="mx-auto flex w-full max-w-md items-center px-4 pt-3">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-xl font-extrabold tracking-tight">
          <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="8" cy="9" r="5.5" fill="var(--opt-a)" />
            <circle cx="20" cy="9" r="5.5" fill="var(--opt-b)" />
            <circle cx="14" cy="20" r="5.5" fill="var(--opt-c)" />
          </svg>
          CrowdPlay
        </Link>
      </header>
      <main id="main" className="flex-1">
        <TryIntro onStart={start} />
      </main>
      <Footer />
    </div>
  );
}
