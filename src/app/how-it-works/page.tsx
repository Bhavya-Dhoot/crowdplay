// /how-it-works (UX_SPEC §3.7): the loop, the architecture, which Nexconn feature does what, what is new,
// the safety layers and an honest list of limits. Static server component: no client JavaScript on this page.
import { Bot, Eye, Gauge, Mail, ShieldCheck, TriangleAlert, Zap } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArchitectureDiagram } from "@/components/depth/ArchitectureDiagram";
import { LOOP_STEPS, LoopDiagram } from "@/components/depth/LoopDiagram";
import { SiteHeader } from "@/components/depth/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Footer } from "@/components/ui/Footer";
import { GelDisc } from "@/components/ui/GelDisc";
import { PaperCard } from "@/components/ui/PaperCard";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { Stamp } from "@/components/ui/Stamp";
import { COPY } from "@/lib/copy";

const DESCRIPTION =
  "How a CrowdPlay show works: the six-step loop, the architecture on Nexconn Chat, what is new, how it stays safe, and its honest limits.";

export const metadata: Metadata = {
  title: "How it works",
  description: DESCRIPTION,
  openGraph: { title: "How CrowdPlay works", description: DESCRIPTION },
};

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded-inner bg-paper-2 px-1.5 py-0.5 text-[0.9em] break-words text-ink">{children}</code>
);

// NEXCONN_INTEGRATION.md §7, same rows, same meaning.
const FEATURE_ROWS: { feature: string; capability: ReactNode }[] = [
  { feature: "Zero-signup join", capability: "Server API token issue + Web Chat SDK connect" },
  { feature: "The live room", capability: "Open Channel (unlimited participants, online-only)" },
  {
    feature: "Idea storm",
    capability: (
      <>
        Custom message <Code>CP:Idea</Code>, marked low priority
      </>
    ),
  },
  {
    feature: "Everyone sees the same phase and countdown",
    capability: (
      <>
        Open Channel metadata + priority <Code>CP:State</Code>
      </>
    ),
  },
  {
    feature: "Live vote bars",
    capability: (
      <>
        Open Channel metadata <Code>cp_tally</Code> + <Code>CP:Tally</Code>
      </>
    ),
  },
  { feature: "Narrator and bots", capability: "Server-sent Open Channel messages from registered bot users; priority sender list" },
  {
    feature: "“Your idea became canon”",
    capability: (
      <>
        Direct Channel message <Code>CP:Receipt</Code>
      </>
    ),
  },
  { feature: "Moderation", capability: "Open Channel mute/ban lists, profanity word list" },
  { feature: "Server learns about messages", capability: "Message webhook (signature-checked, deduplicated)" },
  { feature: "Reconnect banner", capability: "Connection status handler" },
];

const IDEA_TRAIL: ReactNode[] = [
  <>A phone sends the idea as a low-priority Nexconn message. A plain HTTP post goes along as a backup, and the server keeps only one copy.</>,
  <>Nexconn calls the server&apos;s signed webhook. The server checks the filter, the rate limits and the round, then stores the idea in Postgres.</>,
  <>When the storm ends, the engine asks the AI distiller for three options. If the AI times out, a backup model and then simple rules answer instead.</>,
  <>
    The server publishes the new state through Nexconn: channel metadata and a priority message. Every phone and the big screen show the same thing.
    Receipts go out as direct messages.
  </>,
];

// Each card carries the thing it is about: the crowd's options A and B, the wildcard C, the CANON stamp.
const NEW_THINGS: { title: string; body: string; mark: ReactNode; gel?: "a" | "c" }[] = [
  {
    title: "Options written by the crowd",
    body: "Nobody scripts the choices. The AI reads what the room typed, groups it and words three options from those ideas. Counts and credits come from the database, never from the model.",
    mark: (
      <span className="flex gap-2">
        <GelDisc letter="A" size={40} />
        <GelDisc letter="B" size={40} />
      </span>
    ),
    gel: "a",
  },
  {
    title: "A guaranteed minority slot",
    body: "One of the three options is always a wildcard, taken from the small clusters (15% of the ideas or less). A strange idea from a few people can still win the vote.",
    mark: <GelDisc letter="C" size={40} />,
    gel: "c",
  },
  {
    title: "Personal receipts",
    body: "If your idea reaches the ballot or wins, the narrator sends you a private message and the receipt stays on your page. You get the credit, by name.",
    mark: <Stamp kind="canon" size="md" animate={false} />,
  },
];

const SAFETY_LAYERS = [
  {
    title: "Word filter",
    body: "A local blocklist checks every idea before it is stored. The same words are copied to Nexconn's profanity list as far as its quota allows (about 50), but the server's own filter is the one that decides.",
  },
  { title: "AI safety flags", body: "The distiller flags unsafe ideas. A flagged idea never becomes an option or part of the narration." },
  { title: "The host", body: "Veto any option, delete any idea, mute or ban any player. A ban also blocks them in the Nexconn channel." },
];

const LIMITS: { Icon: typeof Gauge; label: string; text: ReactNode }[] = [
  {
    Icon: Gauge,
    label: "Capacity",
    text: "Built for up to 500 connections at once, the Nexconn free-plan limit. A room stops letting new players in at 450 by default so the host and big screen can always get in.",
  },
  {
    Icon: Zap,
    label: "AI speed",
    text: "AI calls have hard timeouts and fall back to simple rules, and a round never waits more than 10 seconds for them. The target is 8 seconds for 95% of rounds. The measured median and slowest 5% are on the Impact page, from real rounds only.",
  },
  {
    Icon: TriangleAlert,
    label: "Mock transport",
    text: "An in-memory stand-in for Nexconn exists for automated tests and for running locally without credentials. The server refuses to start in production with it.",
  },
  {
    Icon: Bot,
    label: "Bots",
    text: "Simulated players appear only in demo rooms, including the demo you play alone. They are always marked with a robot badge and never counted on the Impact page.",
  },
  {
    Icon: Eye,
    label: "Not load-tested live",
    text: "In three live runs over Nexconn (two phones and the big screen, one round each) an idea reached the screen in 0.93 to 1.04 seconds in 13 of 14 samples and in 3.0 seconds in the other, and the options appeared 2.8 to 3.1 seconds after the storm ended. That is a small room. The 300-sender load test runs on the mock transport, so we have not measured live delivery with hundreds of real connections.",
  },
  {
    Icon: Mail,
    label: "No accounts",
    text: "Players pick a display name and nothing else: no email, no phone number. Anyone can delete their data from their own page.",
  },
];

const SECTION = "scroll-mt-6 mt-16 md:mt-24";
const H2 = "font-display text-h2 leading-tight font-extrabold md:text-[2.5rem]";
const LEAD = "mt-2 max-w-[56ch] text-muted-on-stage";
const NAV = [
  ["#loop", "The loop"],
  ["#architecture", "Architecture"],
  ["#nexconn", "On Nexconn"],
  ["#new", "What is new"],
  ["#safety", "Safety"],
  ["#limits", "Limits"],
] as const;

export default function HowItWorks() {
  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop roundNo={1} />
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 md:px-8">
        <header className="pt-6 md:pt-12">
          <h1 className="max-w-[14ch] font-display text-[clamp(2.75rem,10vw,5.25rem)] leading-[0.92] font-extrabold tracking-[-0.045em] text-balance">
            How CrowdPlay works
          </h1>
          <p className="script mt-5 max-w-[48ch] text-lead leading-relaxed text-muted-on-stage md:text-[1.375rem]">
            A live show where the audience writes the story. This page covers the loop every round runs through, the plumbing underneath, and
            what the product cannot do yet.
          </p>
          <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
            {NAV.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="press inline-flex min-h-11 items-center rounded-pill border border-stage-line bg-stage-1 px-4 text-small font-medium text-muted-on-stage [--press-overlay:rgb(255_255_255/0.08)] hover:text-on-stage"
              >
                {label}
              </a>
            ))}
          </nav>
        </header>

        <section id="loop" aria-labelledby="loop-h" className={SECTION}>
          <h2 id="loop-h" className={H2}>
            The loop
          </h2>
          <p className={LEAD}>Every round is the same five steps. After the last round the show ends with a finale.</p>
          <div className="mt-8">
            <LoopDiagram />
          </div>
          <dl className="mt-10 hidden gap-x-10 gap-y-6 md:grid md:grid-cols-2">
            {LOOP_STEPS.map((s) => (
              <div key={s.name}>
                <dt className="font-display text-lead font-bold">{s.name}</dt>
                <dd className="mt-1 max-w-[52ch] text-muted-on-stage">{s.detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="architecture" aria-labelledby="arch-h" className={SECTION}>
          <h2 id="arch-h" className={H2}>
            Under the hood
          </h2>
          <p className={LEAD}>Nexconn Chat carries everything the room sees. The server decides what is true and keeps the record.</p>
          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:items-start lg:gap-14">
            <ArchitectureDiagram className="h-auto w-full max-w-[30rem]" />
            <div>
              <h3 className="font-display text-h3 font-extrabold">Follow one idea</h3>
              <ol className="mt-4 space-y-4">
                {IDEA_TRAIL.map((text, i) => (
                  <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                    <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-paper font-display text-small font-extrabold text-ink">
                      {i + 1}
                    </span>
                    <p className="max-w-[52ch]">{text}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-6 max-w-[52ch] text-muted-on-stage">
                If Nexconn drops out, phones fall back to polling the server over HTTP every couple of seconds and a banner says so. If the AI
                fails, the round still finishes.
              </p>
            </div>
          </div>
        </section>

        <section id="nexconn" aria-labelledby="nex-h" className={SECTION}>
          <h2 id="nex-h" className={H2}>
            What runs on Nexconn
          </h2>
          <p className={LEAD}>Each feature of the show, and the Nexconn capability behind it.</p>
          <div className="paper mt-6 overflow-hidden">
            <table className="w-full table-fixed border-collapse text-left">
              <caption className="sr-only">Which Nexconn capability powers each CrowdPlay feature</caption>
              <thead className="bg-paper-2 text-small text-ink-muted">
                <tr>
                  <th scope="col" className="w-[40%] px-3 py-3 font-semibold md:w-[36%] md:px-5">
                    Feature
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold md:px-5">
                    Nexconn capability
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-edge text-small text-ink">
                {FEATURE_ROWS.map((r) => (
                  <tr key={r.feature}>
                    <th scope="row" className="px-3 py-3.5 align-top font-semibold md:px-5">
                      {r.feature}
                    </th>
                    <td className="px-3 py-3.5 align-top text-ink-muted md:px-5">{r.capability}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="new" aria-labelledby="new-h" className={SECTION}>
          <h2 id="new-h" className={H2}>
            What is new
          </h2>
          <ul className="mt-6 grid gap-3 md:grid-cols-3">
            {NEW_THINGS.map((t) => (
              <PaperCard key={t.title} as="li" gel={t.gel} className="flex flex-col gap-4 p-5 pt-7">
                <div aria-hidden="true" className="flex min-h-10 items-center">
                  {t.mark}
                </div>
                <h3 className="font-display text-h3 leading-tight font-extrabold text-ink">{t.title}</h3>
                <p className="text-small leading-relaxed text-ink-muted">{t.body}</p>
              </PaperCard>
            ))}
          </ul>
        </section>

        <section id="safety" aria-labelledby="safe-h" className={SECTION}>
          <h2 id="safe-h" className={H2}>
            Safety, in three layers
          </h2>
          <p className={LEAD}>An idea has to get past all of them before it can reach the big screen.</p>
          <ol className="mt-6 grid gap-3 md:grid-cols-3">
            {SAFETY_LAYERS.map((l, i) => (
              <li key={l.title}>
                <Card className="h-full space-y-3 p-5">
                  <p className="flex items-center gap-3">
                    <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-paper font-display text-small font-extrabold text-ink">
                      {i + 1}
                    </span>
                    <span className="font-display text-lead font-bold">{l.title}</span>
                  </p>
                  <p className="text-small leading-relaxed text-muted-on-stage">{l.body}</p>
                </Card>
              </li>
            ))}
          </ol>
          <p className="mt-5 flex max-w-[64ch] items-start gap-3 text-muted-on-stage">
            <ShieldCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-ok" />
            <span>
              Public rooms start with the strict filter on. Players can send one idea every two seconds and twelve per round. Ideas are always
              treated as text to read, never as instructions to the AI. Display names go through the same filter.
            </span>
          </p>
        </section>

        <section id="limits" aria-labelledby="limits-h" className={SECTION}>
          <h2 id="limits-h" className={H2}>
            Limits and honesty
          </h2>
          <p className={LEAD}>What CrowdPlay does not do, or has not proven yet.</p>
          <Card tone="raised" as="div" className="mt-6 p-2 md:p-4">
            <ul className="divide-y divide-stage-line">
              {LIMITS.map(({ Icon, label, text }) => (
                <li key={label} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-4 md:grid-cols-[1.75rem_11rem_minmax(0,1fr)] md:gap-x-5">
                  <Icon aria-hidden="true" className="mt-0.5 size-5 text-light" />
                  <p className="font-semibold">{label}</p>
                  <p className="col-start-2 text-muted-on-stage md:col-start-3">{text}</p>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section aria-labelledby="go-h" className="mt-16 md:mt-24">
          <h2 id="go-h" className={H2}>
            See it work
          </h2>
          <p className="mt-2 max-w-[48ch] text-muted-on-stage">The quickest way to understand it is to play a round.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href="/try">{COPY.landing.try.label}</ButtonLink>
            <ButtonLink href="/host" variant="secondary">
              {COPY.landing.host.label}
            </ButtonLink>
            <ButtonLink href="/impact" variant="ghost">
              See the Impact page
            </ButtonLink>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
