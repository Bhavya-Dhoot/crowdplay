// Architecture diagram, hand-built as inline SVG so it stays crisp, themed and readable on a phone.
// The artwork is portrait (440 wide) on purpose: at 360 px wide the 13-14 px labels still render near 11-12 px.
// Accessible name + long description via <title>/<desc>; the page repeats the content as a numbered list.
import type { ReactNode } from "react";

const FONT_BODY = "var(--f-body)";
const FONT_DISPLAY = "var(--f-display)";

function Arrow({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M1 1 L9 5 L1 9 z" fill={color} />
    </marker>
  );
}

function Label({ x, y, children, bold, fill = "var(--muted)", anchor = "start" }: { x: number; y: number; children: ReactNode; bold?: boolean; fill?: string; anchor?: "start" | "end" | "middle" }) {
  return (
    <text x={x} y={y} fontSize={13} fontWeight={bold ? 600 : 400} fill={fill} textAnchor={anchor} fontFamily={FONT_BODY}>
      {children}
    </text>
  );
}

function Module({ x, y, title, sub }: { x: number; y: number; title: string; sub: string }) {
  return (
    <g>
      <rect x={x} y={y} width={196} height={62} rx={12} fill="var(--surface-2)" stroke="var(--line)" />
      <text x={x + 14} y={y + 26} fontSize={15} fontWeight={600} fill="var(--text)" fontFamily={FONT_BODY}>
        {title}
      </text>
      <text x={x + 14} y={y + 46} fontSize={13} fill="var(--muted)" fontFamily={FONT_BODY}>
        {sub}
      </text>
    </g>
  );
}

function Bullet({ y, children }: { y: number; children: ReactNode }) {
  return (
    <g>
      <circle cx={30} cy={y - 4} r={3.5} fill="var(--accent)" />
      <text x={42} y={y} fontSize={14} fill="var(--text)" fontFamily={FONT_BODY}>
        {children}
      </text>
    </g>
  );
}

export function ArchitectureDiagram({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-labelledby="arch-title arch-desc"
      viewBox="0 0 440 860"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="arch-title">CrowdPlay architecture</title>
      <desc id="arch-desc">
        Browsers (players, host console, big screen) talk to the Nexconn Open Channel in real time: ideas and cheers go up, show state, tallies and
        receipts come down. The channel carries metadata, priority messages, low-priority idea messages and direct messages. Nexconn sends the
        Next.js server a signed webhook for each message, and the server calls the Nexconn Server API to publish state, receipts and bot
        messages. Browsers also call the server over HTTP to join, vote and send ideas as a backup path. The server holds the round engine,
        ingest and webhook handling, the AI distiller with fallbacks, and receipts and bots, and stores everything in Postgres.
      </desc>
      <defs>
        <Arrow id="arch-head-accent" color="var(--accent)" />
        <Arrow id="arch-head-muted" color="var(--muted)" />
        <Arrow id="arch-head-blue" color="var(--opt-a)" />
      </defs>

      {/* Browsers */}
      <rect x={10} y={10} width={420} height={104} rx={16} fill="var(--surface)" stroke="var(--line)" />
      <text x={26} y={40} fontSize={19} fontWeight={800} fill="var(--text)" fontFamily={FONT_DISPLAY}>
        Browsers
      </text>
      <Label x={26} y={60}>Nexconn Web Chat SDK in every tab</Label>
      {[
        { x: 26, t: "Player" },
        { x: 156, t: "Host" },
        { x: 286, t: "Big screen" },
      ].map((c) => (
        <g key={c.t}>
          <rect x={c.x} y={74} width={118} height={30} rx={15} fill="var(--surface-2)" stroke="var(--line)" />
          <text x={c.x + 59} y={94} fontSize={14} fill="var(--text)" textAnchor="middle" fontFamily={FONT_BODY}>
            {c.t}
          </text>
        </g>
      ))}

      {/* Browsers <-> Nexconn: realtime */}
      <line x1={64} y1={116} x2={64} y2={188} stroke="var(--accent)" strokeWidth={2.5} markerStart="url(#arch-head-accent)" markerEnd="url(#arch-head-accent)" />
      <Label x={78} y={142} bold fill="var(--accent)">Realtime</Label>
      <Label x={78} y={160}>ideas and cheers up</Label>
      <Label x={78} y={177}>state and tally down</Label>

      {/* Browsers <-> server: HTTP */}
      <line x1={400} y1={116} x2={400} y2={468} stroke="var(--muted)" strokeWidth={2} strokeDasharray="6 6" markerStart="url(#arch-head-muted)" markerEnd="url(#arch-head-muted)" />
      <Label x={388} y={212} bold fill="var(--text)" anchor="end">HTTP</Label>
      <Label x={388} y={230} anchor="end">join and vote</Label>
      <Label x={388} y={247} anchor="end">idea backup</Label>
      <Label x={388} y={264} anchor="end">state polling</Label>

      {/* Nexconn */}
      <rect x={10} y={190} width={270} height={214} rx={16} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
      <text x={26} y={222} fontSize={19} fontWeight={800} fill="var(--accent)" fontFamily={FONT_DISPLAY}>
        Nexconn Chat
      </text>
      <Label x={26} y={242}>One Open Channel per show</Label>
      <Bullet y={274}>Metadata: phase, prompt, tally</Bullet>
      <Bullet y={300}>Priority messages: state</Bullet>
      <Bullet y={326}>Low priority: ideas</Bullet>
      <Bullet y={352}>Direct messages: receipts</Bullet>
      <Bullet y={378}>Bots and narrator as senders</Bullet>

      {/* Nexconn -> server: webhook; server -> Nexconn: Server API */}
      <line x1={60} y1={406} x2={60} y2={468} stroke="var(--opt-a)" strokeWidth={2.5} markerEnd="url(#arch-head-blue)" />
      <Label x={74} y={434} bold fill="var(--opt-a)">Signed webhook</Label>
      <Label x={74} y={452}>deduplicated</Label>
      <line x1={240} y1={406} x2={240} y2={468} stroke="var(--accent)" strokeWidth={2.5} markerStart="url(#arch-head-accent)" />
      <Label x={254} y={434} bold fill="var(--accent)">Server API</Label>
      <Label x={254} y={452}>state, receipts</Label>

      {/* Server */}
      <rect x={10} y={470} width={420} height={236} rx={16} fill="var(--surface)" stroke="var(--line)" />
      <text x={26} y={500} fontSize={19} fontWeight={800} fill="var(--text)" fontFamily={FONT_DISPLAY}>
        Next.js server
      </text>
      <Label x={26} y={520}>Route handlers and a 250 ms ticker</Label>
      <Module x={26} y={536} title="Round engine" sub="state machine, ticker" />
      <Module x={230} y={536} title="Ingest + webhook" sub="filter, dedupe, limits" />
      <Module x={26} y={612} title="AI distiller" sub="LLM, backup LLM, rules" />
      <Module x={230} y={612} title="Receipts + bots" sub="canon, demo rooms" />

      {/* Server <-> Postgres */}
      <line x1={220} y1={708} x2={220} y2={752} stroke="var(--muted)" strokeWidth={2.5} markerStart="url(#arch-head-muted)" markerEnd="url(#arch-head-muted)" />
      <path d="M160 770 v54 a60 14 0 0 0 120 0 v-54" fill="var(--surface-2)" stroke="var(--line)" strokeWidth={2} />
      <ellipse cx={220} cy={770} rx={60} ry={14} fill="var(--surface-2)" stroke="var(--line)" strokeWidth={2} />
      <text x={220} y={806} fontSize={16} fontWeight={700} fill="var(--text)" textAnchor="middle" fontFamily={FONT_BODY}>
        Postgres
      </text>
      <Label x={220} y={850} anchor="middle">PGlite when running locally</Label>
    </svg>
  );
}
