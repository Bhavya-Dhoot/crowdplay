// Architecture diagram as a sketchnote, hand-built as inline SVG so it stays crisp on a phone: ink-outlined boxes with a grey
// marker shadow (the poster's boxes), yellow-filled fat arrows for the realtime and server paths, a dashed ink line for the
// HTTP backup path. Browsers and the Next.js server are plain paper; Nexconn Chat, which carries the show, is the greyer sheet.
// The artwork is portrait (400 wide) on purpose: at 360 px wide the 15-16 px labels still render near 13-14 px.
// Accessible name + long description via <title>/<desc>; the page repeats the content as a numbered list.
// Pure geometry from the seeded path makers in ui/doodle: the server and the browser draw the same strokes.
import type { ReactNode } from "react";
import { arrowPath, roundLoopPath } from "@/components/ui/doodle";

const INK = "var(--ink)";
const NOTES = "var(--ink-notes)";
const DISPLAY = { fontFamily: "var(--f-display)" } as const;
const BODY = { fontFamily: "var(--f-body)" } as const;

// A box: the shape shifted down-right in grey marker, then the paper face with a hand-drawn ink outline.
function Box({ x, y, w, h, seed, sheet, stroke = 2.5 }: { x: number; y: number; w: number; h: number; seed: string; sheet?: boolean; stroke?: number }) {
  const d = roundLoopPath(w, h, seed, 3);
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={d} transform="translate(5 6)" fill="var(--marker-2)" />
      <path d={d} fill="var(--paper-raised)" />
      {sheet ? <path d={d} fill="var(--marker-1)" /> : null}
      <path d={d} fill="none" stroke={INK} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

// A yellow-filled, ink-outlined fat arrow with a grey shadow (the same drawing as <FatArrow>), pointing down or up.
function Arrow({ cx, from, len, dir, seed, thick = 26 }: { cx: number; from: number; len: number; dir: "down" | "up"; seed: string; thick?: number }) {
  const d = arrowPath(len, thick, seed);
  const transform = dir === "down" ? `translate(${cx + thick / 2} ${from}) rotate(90)` : `translate(${cx - thick / 2} ${from}) rotate(-90)`;
  return (
    <g transform={transform} strokeLinejoin="round" strokeLinecap="round">
      <path d={d} transform="translate(2.5 3)" fill="var(--marker-2)" />
      <path d={d} fill="var(--hl-solid)" stroke={INK} strokeWidth={2.4} />
    </g>
  );
}

function Title({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <text x={x} y={y} fontSize={22} fill={INK} style={DISPLAY}>
      {children}
    </text>
  );
}

function Note({ x, y, children, anchor = "start", size = 16, fill = NOTES, display }: { x: number; y: number; children: ReactNode; anchor?: "start" | "end" | "middle"; size?: number; fill?: string; display?: boolean }) {
  return (
    <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} style={display ? DISPLAY : BODY}>
      {children}
    </text>
  );
}

function Bullet({ y, children }: { y: number; children: ReactNode }) {
  return (
    <g>
      <circle cx={30} cy={y - 5} r={3.5} fill={INK} />
      <text x={42} y={y} fontSize={16} fill={INK} style={BODY}>
        {children}
      </text>
    </g>
  );
}

// A part inside the server: a small note.
function Module({ x, y, title, sub, seed }: { x: number; y: number; title: string; sub: string; seed: string }) {
  const d = roundLoopPath(168, 62, seed, 2);
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={d} transform="translate(3 4)" fill="var(--marker-2)" />
      <path d={d} fill="var(--paper-raised)" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <text x={14} y={26} fontSize={17} fill={INK} style={DISPLAY}>
        {title}
      </text>
      <text x={14} y={47} fontSize={15} fill={NOTES} style={BODY}>
        {sub}
      </text>
    </g>
  );
}

export function ArchitectureDiagram({ className }: { className?: string }) {
  return (
    <svg role="img" aria-labelledby="arch-title arch-desc" viewBox="0 0 400 982" className={className} xmlns="http://www.w3.org/2000/svg">
      <title id="arch-title">CrowdPlay architecture</title>
      <desc id="arch-desc">
        Browsers (players, host console, big screen) talk to the Nexconn Open Channel in real time: ideas and cheers go up, show state, tallies and
        receipts come down. The channel carries metadata, priority messages, low-priority idea messages and direct messages. Nexconn sends the
        Next.js server a signed webhook for each message, and the server calls the Nexconn Server API to publish state, receipts and bot
        messages. Browsers also call the server over HTTP to join, vote and send ideas as a backup path. The server holds the round engine,
        ingest and webhook handling, the AI distiller with fallbacks, and receipts and bots, and stores everything in Postgres.
      </desc>
      <defs>
        <marker id="arch-head-ink" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M1 1 L9 5 L1 9" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {/* Browsers */}
      <Box x={10} y={14} w={380} h={124} seed="arch-browsers" />
      <Title x={28} y={48}>Browsers</Title>
      <Note x={28} y={70}>Nexconn Web Chat SDK in every tab</Note>
      {[
        { x: 28, t: "Player" },
        { x: 146, t: "Host" },
        { x: 264, t: "Big screen" },
      ].map((c) => (
        <g key={c.t}>
          <path d={roundLoopPath(108, 32, `arch-chip-${c.t}`, 2)} transform={`translate(${c.x} 84)`} fill="var(--paper-raised)" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <text x={c.x + 54} y={106} fontSize={16} fill={INK} textAnchor="middle" style={DISPLAY}>
            {c.t}
          </text>
        </g>
      ))}

      {/* Browsers <-> Nexconn: realtime */}
      <Arrow cx={42} from={152} len={80} dir="down" seed="arch-rt-down" />
      <Arrow cx={84} from={232} len={80} dir="up" seed="arch-rt-up" />
      <Note x={118} y={170} size={18} fill={INK} display>Realtime</Note>
      <Note x={118} y={192}>ideas and cheers up</Note>
      <Note x={118} y={212}>state and tally down</Note>

      {/* Browsers <-> server: HTTP, the backup path */}
      <path d="M376 140 V545" fill="none" stroke={INK} strokeWidth={2.5} strokeDasharray="7 6" strokeLinecap="round" markerStart="url(#arch-head-ink)" markerEnd="url(#arch-head-ink)" />
      <Note x={362} y={170} anchor="end" size={18} fill={INK} display>HTTP</Note>
      <Note x={362} y={192} anchor="end">join and vote</Note>
      <Note x={362} y={212} anchor="end">idea backup</Note>
      <Note x={362} y={232} anchor="end">state polling</Note>

      {/* Nexconn Chat: the sheet that carries the show */}
      <Box x={10} y={252} w={290} h={210} seed="arch-nexconn" sheet stroke={3} />
      <Title x={28} y={286}>Nexconn Chat</Title>
      <Note x={28} y={308} fill={NOTES}>One Open Channel per show</Note>
      <Bullet y={340}>Metadata: phase, prompt, tally</Bullet>
      <Bullet y={366}>Priority messages: state</Bullet>
      <Bullet y={392}>Low priority: ideas</Bullet>
      <Bullet y={418}>Direct messages: receipts</Bullet>
      <Bullet y={444}>Bots and narrator as senders</Bullet>

      {/* Nexconn -> server: signed webhook; server -> Nexconn: Server API */}
      <Arrow cx={50} from={474} len={64} dir="down" seed="arch-webhook" />
      <Note x={78} y={498} size={17} fill={INK} display>Signed webhook</Note>
      <Note x={78} y={518}>deduplicated</Note>
      <Arrow cx={216} from={538} len={64} dir="up" seed="arch-serverapi" />
      <Note x={244} y={498} size={17} fill={INK} display>Server API</Note>
      <Note x={244} y={518}>state, receipts</Note>

      {/* Server */}
      <Box x={10} y={546} w={380} h={224} seed="arch-server" />
      <Title x={28} y={580}>Next.js server</Title>
      <Note x={28} y={602}>Route handlers and a 250 ms ticker</Note>
      <Module x={26} y={618} title="Round engine" sub="state machine, ticker" seed="arch-mod-engine" />
      <Module x={206} y={618} title="Ingest + webhook" sub="filter, dedupe, limits" seed="arch-mod-ingest" />
      <Module x={26} y={692} title="AI distiller" sub="LLM, backup LLM, rules" seed="arch-mod-ai" />
      <Module x={206} y={692} title="Receipts + bots" sub="canon, demo rooms" seed="arch-mod-bots" />

      {/* Server <-> Postgres */}
      <Arrow cx={176} from={782} len={46} dir="down" seed="arch-pg-down" thick={24} />
      <Arrow cx={224} from={828} len={46} dir="up" seed="arch-pg-up" thick={24} />
      <g>
        <path d="M130 872 v54 a70 15 0 0 0 140 0 v-54 z" fill="var(--marker-2)" transform="translate(5 6)" />
        <path d="M130 872 v54 a70 15 0 0 0 140 0 v-54" fill="var(--paper-raised)" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
        <ellipse cx={200} cy={872} rx={70} ry={15} fill="var(--marker-1)" stroke={INK} strokeWidth={2.5} />
        <text x={200} y={912} fontSize={20} fill={INK} textAnchor="middle" style={DISPLAY}>
          Postgres
        </text>
      </g>
      <Note x={200} y={970} anchor="middle">PGlite when running locally</Note>
    </svg>
  );
}
