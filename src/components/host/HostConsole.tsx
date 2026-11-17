"use client";
// /host/CODE?k=KEY: the live console (UX §3.4, PRD H2-H7), design v2: a calm stage-manager desk.
//   useRoom(code, "host")   live state over the realtime transport with HTTP polling as the fallback
//   useHostDesk             1 s host feed (ideas, players, metrics), 1 s heartbeat, and every action
// The screen shows the newest PublicState of the three sources. A missing or wrong key is a friendly
// 403 page, never a half-working console. Layout: glass top bar, then Control | On the big screen | Room.
import { ExternalLink, KeyRound, SearchX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { ConnectionBanner } from "@/components/ui/ConnectionBanner";
import { FullScreenMessage } from "@/components/ui/FullScreenMessage";
import { NexconnBadge } from "@/components/ui/NexconnBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { useRoom } from "@/lib/client/useRoom";
import { COPY, friendlyError, PHASE_LABEL } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { headcount, newerState, resolveLinks } from "./consoleLogic";
import { ControlPanel } from "./ControlPanel";
import { CopyButton } from "./controls";
import { loadHostKey, saveHostKey } from "./hostKey";
import "./host.css";
import { LivePanel } from "./LivePanel";
import { RoomPanel } from "./RoomPanel";
import { useHostDesk } from "./useHostDesk";

const noopSubscribe = () => () => {};

function LogoMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="8" cy="9" r="5.5" fill="var(--gel-a)" />
      <circle cx="20" cy="9" r="5.5" fill="var(--gel-b)" />
      <circle cx="14" cy="20" r="5.5" fill="var(--gel-c)" />
    </svg>
  );
}

// ---------- pages for the unhappy paths ----------

function InvalidKeyPage() {
  return (
    <main id="main" data-testid="host-forbidden" className="min-h-dvh">
      <StageBackdrop />
      <FullScreenMessage
        icon={<KeyRound className="size-10 text-gold" />}
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
      <StageBackdrop />
      <FullScreenMessage
        icon={<SearchX className="size-10 text-gold" />}
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
      <StageBackdrop />
      <span className="sr-only">Loading your show…</span>
      <div className="glass mx-3 mt-3 h-14 shrink-0 rounded-card" />
      <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[280px_minmax(0,1fr)_300px] xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="min-h-96 space-y-4 rounded-card border border-stage-line bg-stage-1 p-4 lg:min-h-0">
            <Skeleton className="h-16" />
            <Skeleton className="h-20 rounded-pill" />
            <Skeleton className="h-32" />
          </div>
        ))}
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
          <StageBackdrop />
          <FullScreenMessage title={COPY.states.unreachable.title} body={COPY.states.unreachable.body} onRetry={room.refresh} />
        </main>
      );
    }
    return <ConsoleSkeleton />;
  }

  const live = state.phase !== "ENDED";
  const links = resolveLinks(desk.feed, origin, code, hostKey);
  // The one players count of the page: the roster itself. Until the first feed arrives, the engine's own count.
  const count = desk.feed ? headcount(desk.feed.players, desk.feedAt) : { joined: state.stats.players, online: 0 };
  return (
    <div
      data-testid="phase"
      data-phase={state.phase}
      data-round={state.roundNo || undefined}
      data-paused={state.paused || undefined}
      className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden"
    >
      <StageBackdrop roundNo={state.roundNo} />
      <ConnectionBanner status={room.connection} />

      <header className="glass sticky top-3 z-30 mx-3 mt-3 flex min-h-14 shrink-0 items-center justify-between gap-3 rounded-card px-2 lg:static">
        <div className="flex min-w-0 items-center gap-1">
          <Link href="/" aria-label={`${COPY.brand} home`} className="grid size-11 shrink-0 place-items-center">
            <LogoMark />
          </Link>
          <h1 className="truncate font-display text-lead leading-7 tracking-tight" data-testid="host-title">
            {state.title}
          </h1>
          <span className="ml-2 shrink-0 rounded-pill bg-paper px-3 py-1 font-display text-small leading-5 font-extrabold tracking-[0.14em] text-ink">{code}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p className="hidden items-center gap-2 text-small font-semibold text-muted-on-stage sm:flex" data-testid="host-status">
            <span className="lamp" data-on={live && !state.paused} data-paused={state.paused || undefined} aria-hidden="true" />
            {state.paused ? "Paused" : live ? PHASE_LABEL[state.phase] : "Show ended"}
          </p>
          {live ? <CopyButton value={links.join} label="Join link" iconOnly tone="paper" testId="copy-join-quick" className="lg:hidden" /> : null}
          <a
            href={links.screen}
            target="_blank"
            rel="noopener noreferrer"
            className="press hidden min-h-11 items-center gap-1.5 rounded-pill bg-paper px-4 text-small font-semibold text-ink shadow-[0_1px_0_var(--paper-edge)] sm:inline-flex"
          >
            Big screen
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </header>

      {desk.failing ? (
        <p role="status" className="mx-3 mt-3 flex shrink-0 items-center justify-center gap-2 rounded-card bg-warn px-4 py-2 text-center text-small font-semibold text-ink">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          Can&apos;t reach the show right now. Retrying…
        </p>
      ) : null}

      <main id="main" className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[280px_minmax(0,1fr)_300px] xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        <ControlPanel state={state} offsetMs={room.offsetMs} metrics={metrics} features={room.features} desk={desk} joined={count.joined} />
        <LivePanel state={state} feed={desk.feed} metrics={metrics} desk={desk} code={code} links={links} joined={count.joined} />
        <RoomPanel code={code} state={state} feed={desk.feed} metrics={metrics} desk={desk} links={links} count={count} />
      </main>

      <footer className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 px-4 pb-3">
        <p className="text-fine text-muted-on-stage">Anyone with this page&apos;s link can run the show. Keep it to yourself.</p>
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
