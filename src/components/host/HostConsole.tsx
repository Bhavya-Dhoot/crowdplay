"use client";
// /host/CODE?k=KEY: the live console (UX §3.4, PRD H2-H7).
//   useRoom(code, "host")   live state over the realtime transport with HTTP polling as the fallback
//   useHostDesk             1 s host feed (ideas, players, metrics), 1 s heartbeat, and every action
// The screen shows the newest PublicState of the three sources. A missing or wrong key is a friendly
// 403 page, never a half-working console.
import { ExternalLink, KeyRound, SearchX } from "lucide-react";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ConnectionBanner } from "@/components/ui/ConnectionBanner";
import { FullScreenMessage } from "@/components/ui/FullScreenMessage";
import { NexconnBadge } from "@/components/ui/NexconnBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRoom } from "@/lib/client/useRoom";
import { COPY, friendlyError, PHASE_LABEL } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { newerState } from "./consoleLogic";
import { ControlPanel } from "./ControlPanel";
import { loadHostKey, saveHostKey } from "./hostKey";
import "./host.css";
import { LivePanel } from "./LivePanel";
import { RoomPanel } from "./RoomPanel";
import { useHostDesk } from "./useHostDesk";

const noopSubscribe = () => () => {};

function LogoMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="8" cy="9" r="5.5" fill="var(--opt-a)" />
      <circle cx="20" cy="9" r="5.5" fill="var(--opt-b)" />
      <circle cx="14" cy="20" r="5.5" fill="var(--opt-c)" />
    </svg>
  );
}

// ---------- pages for the unhappy paths ----------

function InvalidKeyPage() {
  return (
    <main id="main" data-testid="host-forbidden" className="min-h-dvh">
      <FullScreenMessage
        icon={<KeyRound className="size-10 text-accent" />}
        title="This host link is not valid"
        body="Host links are private and can't be re-issued. Open the link from the setup screen where you created the show, or start a new one."
        actions={
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <ButtonLink href="/host">Host a new show</ButtonLink>
            <ButtonLink href="/" variant="ghost">
              Back to the start
            </ButtonLink>
          </div>
        }
      />
    </main>
  );
}

function NotFoundPage() {
  return (
    <main id="main" data-testid="host-not-found" className="min-h-dvh">
      <FullScreenMessage
        icon={<SearchX className="size-10 text-accent" />}
        title="We can't find that show"
        body={friendlyError("NOT_FOUND")}
        actions={
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <ButtonLink href="/host">Host a new show</ButtonLink>
            <ButtonLink href="/" variant="ghost">
              Back to the start
            </ButtonLink>
          </div>
        }
      />
    </main>
  );
}

function ConsoleSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh" aria-busy="true">
      <span className="sr-only">Loading your show…</span>
      <div className="h-14 shrink-0 border-b border-line" />
      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_300px] xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        <Skeleton className="h-96 rounded-card lg:h-auto" />
        <Skeleton className="h-96 rounded-card lg:h-auto" />
        <Skeleton className="h-96 rounded-card lg:h-auto" />
      </div>
    </div>
  );
}

// ---------- the console ----------

function Console({ code, hostKey }: { code: string; hostKey: string }) {
  const room = useRoom(code, "host");
  const desk = useHostDesk(code, hostKey, room.state?.phase !== "ENDED");
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );

  const state: PublicState | null = newerState(newerState(room.state, desk.feed?.state), desk.pushed);
  const metrics = desk.feed?.metrics ?? null;

  // Keep the key for this room so /host/CODE works again in this browser without the ?k= part.
  useEffect(() => saveHostKey(code, hostKey), [code, hostKey]);

  if (desk.forbidden) return <InvalidKeyPage />;
  if (desk.notFound || room.error?.code === "NOT_FOUND") return <NotFoundPage />;
  if (!state) {
    if (room.unreachable || desk.failing) {
      return (
        <main id="main">
          <FullScreenMessage title={COPY.states.unreachable.title} body={COPY.states.unreachable.body} onRetry={room.refresh} />
        </main>
      );
    }
    return <ConsoleSkeleton />;
  }

  const live = state.phase !== "ENDED";
  return (
    <div data-testid="phase" data-phase={state.phase} data-paused={state.paused || undefined} className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <ConnectionBanner status={room.connection} />

      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label={`${COPY.brand} home`} className="grid size-11 shrink-0 place-items-center">
            <LogoMark />
          </Link>
          <h1 className="truncate font-display text-xl leading-7" data-testid="host-title">
            {state.title}
          </h1>
          <span className="shrink-0 rounded-pill border border-line bg-surface px-3 py-1 font-display text-sm font-extrabold tracking-[0.14em]">{code}</span>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <p className="hidden items-center gap-2 text-sm font-semibold text-muted sm:flex" data-testid="host-status">
            <span className="lamp" data-on={live && !state.paused} data-paused={state.paused || undefined} aria-hidden="true" />
            {state.paused ? "Paused" : live ? PHASE_LABEL[state.phase] : "Show ended"}
          </p>
          <a
            href={`/screen/${code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden min-h-11 items-center gap-1.5 rounded-pill border border-line bg-surface px-4 text-sm font-semibold transition-colors hover:border-accent sm:inline-flex motion-reduce:transition-none"
          >
            Big screen
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </header>

      {desk.failing ? (
        <p role="status" className="shrink-0 bg-warn px-4 py-2 text-center text-sm font-semibold text-ink">
          Can&apos;t reach the show right now. Retrying…
        </p>
      ) : null}

      <main id="main" className={cn("grid min-h-0 flex-1 gap-4 p-4", "lg:grid-cols-[280px_minmax(0,1fr)_300px] xl:grid-cols-[340px_minmax(0,1fr)_380px]")}>
        <ControlPanel state={state} offsetMs={room.offsetMs} metrics={metrics} features={room.features} desk={desk} />
        <LivePanel state={state} feed={desk.feed} metrics={metrics} desk={desk} />
        <RoomPanel code={code} state={state} feed={desk.feed} metrics={metrics} desk={desk} origin={origin} hostKey={hostKey} />
      </main>

      <footer className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-1.5">
        <p className="text-[13px] text-muted">Anyone with this page&apos;s link can run the show. Keep it to yourself.</p>
        <NexconnBadge />
      </footer>
    </div>
  );
}

export function HostConsole({ code, urlKey }: { code: string; urlKey: string | null }) {
  // undefined while hydrating, null when there is no key anywhere, otherwise the key.
  const key = useSyncExternalStore<string | null | undefined>(
    noopSubscribe,
    () => urlKey?.trim() || loadHostKey(code),
    () => undefined,
  );
  if (key === undefined) return <ConsoleSkeleton />;
  if (key === null) return <InvalidKeyPage />;
  return <Console code={code} hostKey={key} />;
}
