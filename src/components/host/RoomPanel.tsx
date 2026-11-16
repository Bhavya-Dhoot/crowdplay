"use client";
// Console column 3: how people get in (QR, code, copy join / screen / OBS links), the four counters
// (connected, ideas this round, distill ms, fallback), and the roster with search and mute / ban.
import { ExternalLink, MessageSquareOff, Search, UserX } from "lucide-react";
import { memo, useCallback, useId, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BotBadge } from "@/components/ui/BotBadge";
import { cn } from "@/components/ui/cn";
import { QrCode } from "@/components/ui/QrCode";
import type { HostFeedPlayer, HostFeedRes, HostMetrics, RoomLinks } from "@/lib/api/contracts";
import type { PublicState } from "@/lib/realtime/types";
import { filterPlayers, isOnline, originLinks, shortLink } from "./consoleLogic";
import { CopyButton, IconButton } from "./controls";
import type { HostDesk } from "./useHostDesk";

type Props = {
  code: string;
  state: PublicState;
  feed: HostFeedRes | null;
  metrics: HostMetrics | null;
  desk: HostDesk;
  origin: string;
  hostKey: string;
};

const ROSTER_CAP = 150;

function Counter({ label, value, sub, tone, testId }: { label: string; value: string; sub?: string; tone?: "warn"; testId?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface-2 px-3 py-2.5" data-testid={testId}>
      <p className={cn("font-display text-xl leading-7 font-extrabold tabular-nums xl:text-2xl", tone === "warn" && "text-warn")}>{value}</p>
      <p className="text-[13px] leading-4 text-muted">{label}</p>
      {sub ? <p className="truncate text-xs leading-4 text-muted/80">{sub}</p> : null}
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
  return (
    <li
      data-testid="host-player"
      data-muted={muted || undefined}
      data-banned={banned || undefined}
      className={cn("flex items-center gap-2.5 rounded-card px-2 py-1", banned && "opacity-60")}
    >
      <span className="relative shrink-0">
        <Avatar name={player.name} size={32} />
        <span
          aria-hidden="true"
          className={cn("absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface", online ? "bg-ok" : "bg-line")}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[15px] leading-5 font-semibold">
          <span className={cn("truncate", banned && "line-through")}>{player.name}</span>
          {player.isBot ? <BotBadge /> : null}
        </p>
        <p className="text-xs leading-4 text-muted">
          {banned ? "Removed" : muted ? "Muted" : online ? "Online" : "Away"} · {player.ideas} {player.ideas === 1 ? "idea" : "ideas"}
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

export function RoomPanel({ code, state, feed, metrics, desk, origin, hostKey }: Props) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const links: Pick<RoomLinks, "join" | "screen" | "obs"> = feed?.links ?? originLinks(origin, code);
  const hostLink = feed?.links.host ?? `${origin}/host/${code}?k=${encodeURIComponent(hostKey)}`;
  const players = useMemo(() => feed?.players ?? [], [feed]);
  const matches = useMemo(() => filterPlayers(players, query), [players, query]);
  const shown = matches.slice(0, ROSTER_CAP);

  const run = desk.run;
  const onMute = useCallback((userId: string, on: boolean) => void run(`mute:${userId}`, { action: "mute", userId, on }, { key: `mute:${userId}`, value: on }), [run]);
  const onBan = useCallback((userId: string, on: boolean) => void run(`ban:${userId}`, { action: "ban", userId, on }, { key: `ban:${userId}`, value: on }), [run]);

  const ended = state.phase === "ENDED";
  return (
    <section aria-labelledby="room-title" className="host-scroll flex min-h-0 flex-col gap-4 rounded-card border border-line bg-surface p-4 lg:overflow-y-auto">
      <h2 id="room-title" className="font-display text-xl leading-7">
        Room
      </h2>

      {ended ? (
        <p className="shrink-0 rounded-card border border-line bg-surface-2 p-4 text-sm text-muted" data-testid="host-room-closed">
          Show <span className="font-display font-extrabold tracking-[0.08em] text-text">{code}</span> has ended, so the join code and QR are closed.
        </p>
      ) : null}

      <div className={cn("flex shrink-0 items-center gap-4", ended && "hidden")} data-testid="host-join-card">
        <div className="size-[108px] shrink-0 rounded-[14px] bg-white p-1.5 xl:size-[124px]" data-testid="host-qr">
          <QrCode value={links.join} size={108} label={`QR code to join show ${code}`} className="size-full" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] text-muted">Join code</p>
          <p className="font-display text-[30px] leading-[1.05] font-extrabold tracking-[0.08em] xl:text-[40px] xl:tracking-[0.12em]" data-testid="host-code" aria-label={`Show code ${code.split("").join(" ")}`}>
            {code}
          </p>
          <p className="truncate text-xs text-muted" data-testid="host-join-url">
            {shortLink(links.join)}
          </p>
          <a
            href={links.screen}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            Open big screen
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>

      <div className={cn("grid shrink-0 grid-cols-2 gap-2", ended && "hidden")} data-testid="host-links" role="group" aria-label="Copy links">
        <CopyButton value={links.join} label="Join link" testId="copy-join" />
        <CopyButton value={links.screen} label="Screen link" testId="copy-screen" />
        <CopyButton value={links.obs} label="OBS link" testId="copy-obs" />
        <CopyButton value={hostLink} label="Host link" title="Private: anyone with it can run this show" testId="copy-host" />
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2" role="group" aria-label="Live counters">
        <Counter label="Connected" value={String(metrics?.connected ?? 0)} testId="counter-connected" />
        <Counter label="Ideas this round" value={String(metrics?.ideasThisRound ?? state.stats.ideasThisRound)} testId="counter-ideas" />
        <Counter
          label="Distill time"
          value={metrics?.distillMs != null ? `${metrics.distillMs} ms` : "—"}
          sub={metrics?.distillProvider ?? undefined}
          testId="counter-distill"
        />
        <Counter label="AI fallback" value={metrics?.fallbackUsed ? "⚠ Used" : "Not used"} tone={metrics?.fallbackUsed ? "warn" : undefined} testId="counter-fallback" />
      </div>

      <div className="flex min-h-[220px] flex-1 flex-col">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="font-display text-lg leading-6">Players</h3>
          <p className="text-sm tabular-nums text-muted" data-testid="host-player-count">
            {players.length} {players.length === 1 ? "player" : "players"}
          </p>
        </div>
        <div className="relative mb-2 shrink-0">
          <label htmlFor={searchId} className="sr-only">
            Search players
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <input
            id={searchId}
            type="search"
            data-testid="host-player-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players"
            autoComplete="off"
            className="min-h-11 w-full rounded-pill border border-line bg-surface-2 pr-4 pl-10 text-[15px] placeholder:text-muted/70 hover:border-muted focus-visible:border-accent"
          />
        </div>
        <div className="host-scroll min-h-0 flex-1 overflow-y-auto">
          {players.length === 0 ? (
            <div className="grid min-h-32 place-items-center rounded-card border border-dashed border-line px-5 py-6 text-center">
              <p className="text-sm text-muted">{ended ? "Nobody joined this show." : "Nobody here yet. Share the code or let people scan the QR."}</p>
            </div>
          ) : matches.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted">No player matches “{query.trim()}”.</p>
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
            <p className="mt-2 text-center text-[13px] text-muted">
              Showing {ROSTER_CAP} of {matches.length}. Search to narrow it down.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
