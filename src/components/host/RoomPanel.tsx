"use client";
// Console column 3: who is here. The compact join card (the big one lives in the LOBBY preview), the roster with
// search and mute / remove, and the numbers behind the show tucked into a collapsed "Diagnostics".
// One players count: "joined" and "online" both come from the roster below (headcount()), never from a second source.
import { ChevronDown, MessageSquareOff, Search, UserX } from "lucide-react";
import { memo, useCallback, useId, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BotBadge } from "@/components/ui/BotBadge";
import { cn } from "@/components/ui/cn";
import type { HostFeedPlayer, HostFeedRes, HostMetrics } from "@/lib/api/contracts";
import type { PublicState } from "@/lib/realtime/types";
import { aiProviderLabel, aiStatus, aiTime, filterPlayers, isOnline, type Headcount } from "./consoleLogic";
import { IconButton } from "./controls";
import { JoinCard } from "./JoinCard";
import type { HostDesk } from "./useHostDesk";

type Props = {
  code: string;
  state: PublicState;
  feed: HostFeedRes | null;
  metrics: HostMetrics | null;
  desk: HostDesk;
  links: { join: string; screen: string; obs: string; host: string };
  count: Headcount;
};

const ROSTER_CAP = 150;

function Counter({ label, value, sub, warn, testId }: { label: string; value: string; sub?: string; warn?: boolean; testId?: string }) {
  return (
    <div className="rounded-card border border-stage-line bg-stage-2 px-3 py-2.5" data-testid={testId}>
      <p className={cn("font-display text-lead leading-6 font-extrabold tabular-nums", warn && "text-warn")}>{value}</p>
      <p className="text-fine leading-4 text-muted-on-stage">{label}</p>
      {sub ? <p className="mt-0.5 text-fine leading-4 text-muted-on-stage">{sub}</p> : null}
    </div>
  );
}

const PlayerRow = memo(function PlayerRow({
  player,
  online,
  muted,
  banned,
  busyMute,
  busyBan,
  onMute,
  onBan,
}: {
  player: HostFeedPlayer;
  online: boolean;
  muted: boolean;
  banned: boolean;
  busyMute: boolean;
  busyBan: boolean;
  onMute: (userId: string, on: boolean) => void;
  onBan: (userId: string, on: boolean) => void;
}) {
  const status = banned ? "Removed" : muted ? "Muted" : online ? "Online" : "Away";
  return (
    <li
      data-testid="host-player"
      data-muted={muted || undefined}
      data-banned={banned || undefined}
      className={cn("flex items-center gap-2.5 rounded-card px-2 py-1 hover:bg-stage-2/60", banned && "opacity-60")}
    >
      <span className="relative shrink-0">
        <Avatar name={player.name} size={32} />
        <span aria-hidden="true" className={cn("absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-stage-1", online && !banned ? "bg-ok" : "bg-stage-line")} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-small leading-5 font-semibold">
          <span className={cn("truncate", banned && "line-through")}>{player.name}</span>
          {player.isBot ? <BotBadge /> : null}
        </p>
        <p className="text-fine leading-4 text-muted-on-stage">
          {status} · {player.ideas} {player.ideas === 1 ? "idea" : "ideas"}
        </p>
      </div>
      <IconButton
        label={muted ? `Unmute ${player.name}` : `Mute ${player.name}`}
        pressed={muted}
        tone="warn"
        data-testid={`mute-${player.userId}`}
        loading={busyMute}
        onClick={() => onMute(player.userId, !muted)}
      >
        <MessageSquareOff aria-hidden="true" className="size-4" />
      </IconButton>
      <IconButton
        label={banned ? `Let ${player.name} back in` : `Remove ${player.name} from the show`}
        pressed={banned}
        tone="danger"
        data-testid={`ban-${player.userId}`}
        loading={busyBan}
        onClick={() => onBan(player.userId, !banned)}
      >
        <UserX aria-hidden="true" className="size-4" />
      </IconButton>
    </li>
  );
});

export function RoomPanel({ code, state, feed, metrics, desk, links, count }: Props) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const players = useMemo(() => feed?.players ?? [], [feed]);
  const matches = useMemo(() => filterPlayers(players, query), [players, query]);
  const shown = matches.slice(0, ROSTER_CAP);

  const run = desk.run;
  const onMute = useCallback((userId: string, on: boolean) => void run(`mute:${userId}`, { action: "mute", userId, on }, { key: `mute:${userId}`, value: on }), [run]);
  const onBan = useCallback((userId: string, on: boolean) => void run(`ban:${userId}`, { action: "ban", userId, on }, { key: `ban:${userId}`, value: on }), [run]);

  const ended = state.phase === "ENDED";
  const status = aiStatus(metrics);
  return (
    <section aria-labelledby="room-title" className="host-scroll flex min-h-0 flex-col gap-5 rounded-card border border-stage-line bg-stage-1 p-4 lg:overflow-y-auto">
      <h2 id="room-title" className="font-display text-h3 leading-8">
        Room
      </h2>

      {ended ? (
        <p className="shrink-0 rounded-card border border-stage-line bg-stage-2 p-4 text-small text-muted-on-stage" data-testid="host-room-closed">
          Show <span className="font-display font-extrabold tracking-[0.08em] text-on-stage">{code}</span> has ended, so the join code and QR are closed.
        </p>
      ) : state.phase === "LOBBY" ? null : (
        <JoinCard code={code} links={links} variant="compact" />
      )}

      <div className="flex min-h-[220px] flex-1 flex-col">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h3 className="font-display text-lead leading-6">Players</h3>
          <p className="text-small font-semibold tabular-nums" data-testid="host-player-count">
            {count.joined} joined
          </p>
        </div>
        <p className="mb-3 text-fine leading-4 text-muted-on-stage" data-testid="host-online-count">
          {!feed ? "Checking who is here…" : count.joined === 0 ? "Nobody yet." : `${count.online} online now. Online means their page is open.`}
        </p>
        <div className="relative mb-2 shrink-0">
          <label htmlFor={searchId} className="sr-only">
            Search players
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-on-stage" />
          <input
            id={searchId}
            type="search"
            data-testid="host-player-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players"
            autoComplete="off"
            className="min-h-11 w-full rounded-pill border border-stage-line bg-stage-2 pr-4 pl-10 text-small text-on-stage placeholder:text-muted-on-stage hover:border-muted-on-stage/50"
          />
        </div>
        <div className="host-scroll min-h-0 flex-1 overflow-y-auto">
          {players.length === 0 ? (
            <div className="grid min-h-32 place-items-center rounded-card border border-dashed border-stage-line px-5 py-6 text-center">
              <p className="text-small text-muted-on-stage">{ended ? "Nobody joined this show." : "Nobody here yet. Share the code or let people scan the QR."}</p>
            </div>
          ) : matches.length === 0 ? (
            <p className="px-2 py-6 text-center text-small text-muted-on-stage">No player matches “{query.trim()}”.</p>
          ) : (
            <ul className="space-y-0.5">
              {shown.map((p) => (
                <PlayerRow
                  key={p.userId}
                  player={p}
                  online={isOnline(p.lastSeenAt, desk.feedAt)}
                  muted={desk.pending[`mute:${p.userId}`] ?? p.muted}
                  banned={desk.pending[`ban:${p.userId}`] ?? p.banned}
                  busyMute={desk.busy.has(`mute:${p.userId}`)}
                  busyBan={desk.busy.has(`ban:${p.userId}`)}
                  onMute={onMute}
                  onBan={onBan}
                />
              ))}
            </ul>
          )}
          {matches.length > ROSTER_CAP ? (
            <p className="mt-2 text-center text-fine text-muted-on-stage">
              Showing {ROSTER_CAP} of {matches.length}. Search to narrow it down.
            </p>
          ) : null}
        </div>
      </div>

      <details className="group shrink-0 rounded-card border border-stage-line bg-stage-2" data-testid="host-diagnostics">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-card px-4 text-small font-semibold [&::-webkit-details-marker]:hidden">
          Diagnostics
          <ChevronDown aria-hidden="true" className="size-4 text-muted-on-stage transition-transform duration-175 ease-arrive group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="grid grid-cols-2 gap-2 px-3 pb-3" role="group" aria-label="Show diagnostics">
          <Counter label="Ideas this round" value={String(metrics?.ideasThisRound ?? state.stats.ideasThisRound)} testId="counter-ideas" />
          <Counter label="Pages connected" value={String(metrics?.connected ?? 0)} sub="phones, big screen and you" testId="counter-connected" />
          <Counter label="AI time" value={aiTime(metrics?.distillMs)} sub={aiProviderLabel(metrics?.distillProvider)} testId="counter-distill" />
          <Counter label="AI status" value={status.text} warn={status.warn} testId="counter-fallback" />
        </div>
      </details>
    </section>
  );
}
