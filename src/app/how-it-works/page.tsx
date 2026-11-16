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

const DESCRIPTION =
  "How a CrowdPlay show works: the six-step loop, the architecture on Nexconn Chat, what is new, how it stays safe, and its honest limits.";

export const metadata: Metadata = {
  title: "How it works",
  description: DESCRIPTION,
  openGraph: { title: "How CrowdPlay works", description: DESCRIPTION },
};

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[0.9em] break-words text-text">{children}</code>
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

const NEW_THINGS: { title: string; body: string }[] = [
  {
    title: "Options written by the crowd",
    body: "Nobody scripts the choices. The AI reads what the room typed, groups it and words three options from those ideas. Counts and credits come from the database, never from the model.",
  },
  {
    title: "A guaranteed minority slot",
    body: "One of the three options is always a wildcard, taken from the small clusters (15% of the ideas or less). A strange idea from a few people can still win the vote.",
  },
  {
    title: "Personal receipts",
    body: "If your idea reaches the ballot or wins, the narrator sends you a private message and the receipt stays on your page. You get the credit, by name.",
  },
];

const SAFETY_LAYERS = [
  { title: "Word filter", body: "A local blocklist plus Nexconn's profanity list checks every idea before it is stored." },
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
    text: "Simulated players appear only in demo rooms, including Try it alone. They are always marked with a robot badge and never counted on the Impact page.",
  },
  {
    Icon: Eye,
    label: "Not load-tested live",
    text: "The 300-sender load test runs on the mock transport. We have not measured live Nexconn delivery with hundreds of real connections, so the one-second idea-to-screen goal is a design target, not a measured result.",
  },
  {
    Icon: Mail,
    label: "No accounts",
    text: "Players pick a display name and nothing else: no email, no phone number. Anyone can delete their data from their own page.",
  },
];

const SECTION = "scroll-mt-6 mt-16 md:mt-24";
const H2 = "font-display text-3xl leading-tight md:text-4xl";
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
    <div className="stage-light flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 md:px-8">
        <header className="pt-6 md:pt-12">
          <h1 className="max-w-[14ch] font-display text-[clamp(2.75rem,10vw,5.25rem)] leading-[0.92] font-extrabold tracking-[-0.045em] text-balance">
            How CrowdPlay works
          </h1>
          <p className="mt-5 max-w-[54ch] text-lg text-muted md:text-xl">
            A live show where the audience writes the story. This page covers the loop every round runs through, the plumbing underneath, and
            what the product cannot do yet.
          </p>
          <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
            {NAV.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="inline-flex min-h-11 items-center rounded-pill border border-line bg-surface px-4 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-text motion-reduce:transition-none"
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
          <p className="mt-2 max-w-[56ch] text-muted">Every round is the same five steps. After the last round the show ends with a finale.</p>
          <div className="mt-8">
            <LoopDiagram />
          </div>
          <dl className="mt-10 hidden gap-x-10 gap-y-6 md:grid md:grid-cols-2">
            {LOOP_STEPS.map((s) => (
              <div key={s.name}>
                <dt className="font-display text-xl font-bold">{s.name}</dt>
                <dd className="mt-1 max-w-[52ch] text-muted">{s.detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="architecture" aria-labelledby="arch-h" className={SECTION}>
          <h2 id="arch-h" className={H2}>
            Under the hood
          </h2>
          <p className="mt-2 max-w-[56ch] text-muted">
            Nexconn Chat carries everything the room sees. The server decides what is true and keeps the record.
          </p>
          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:items-start lg:gap-14">
            <ArchitectureDiagram className="h-auto w-full max-w-[30rem]" />
            <div>
              <h3 className="font-display text-2xl">Follow one idea</h3>
              <ol className="mt-4 space-y-4">
                {IDEA_TRAIL.map((text, i) => (
                  <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-8 place-items-center rounded-full bg-accent font-display text-sm font-extrabold text-ink"
                    >
                      {i + 1}
                    </span>
                    <p className="max-w-[52ch]">{text}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-6 max-w-[52ch] text-muted">
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
          <p className="mt-2 max-w-[56ch] text-muted">Each feature of the show, and the Nexconn capability behind it.</p>
          <div className="mt-6 overflow-hidden rounded-card border border-line bg-surface">
            <table className="w-full table-fixed border-collapse text-left">
              <caption className="sr-only">Which Nexconn capability powers each CrowdPlay feature</caption>
              <thead className="bg-surface-2 text-sm text-muted">
                <tr>
                  <th scope="col" className="w-[40%] px-3 py-3 font-semibold md:w-[36%] md:px-5">
                    Feature
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold md:px-5">
                    Nexconn capability
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-[15px]">
                {FEATURE_ROWS.map((r) => (
                  <tr key={r.feature}>
                    <th scope="row" className="px-3 py-3.5 align-top font-semibold md:px-5">
                      {r.feature}
                    </th>
                    <td className="px-3 py-3.5 align-top text-muted md:px-5">{r.capability}</td>
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
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {NEW_THINGS.map((t) => (
              <li key={t.title} className="grid gap-2 py-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-10">
                <h3 className="font-display text-2xl leading-tight">{t.title}</h3>
                <p className="max-w-[56ch] text-muted">{t.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="safety" aria-labelledby="safe-h" className={SECTION}>
          <h2 id="safe-h" className={H2}>
            Safety, in three layers
          </h2>
          <p className="mt-2 max-w-[56ch] text-muted">An idea has to get past all of them before it can reach the big screen.</p>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {SAFETY_LAYERS.map((l, i) => (
              <li key={l.title}>
                <Card className="h-full space-y-2 p-5">
                  <p className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-8 place-items-center rounded-full border border-accent font-display text-sm font-extrabold text-accent"
                    >
                      {i + 1}
                    </span>
                    <span className="font-display text-xl font-bold">{l.title}</span>
                  </p>
                  <p className="text-muted">{l.body}</p>
                </Card>
              </li>
            ))}
          </ol>
          <p className="mt-5 flex max-w-[64ch] items-start gap-3 text-muted">
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
          <p className="mt-2 max-w-[56ch] text-muted">What CrowdPlay does not do, or has not proven yet.</p>
          <Card tone="raised" as="div" className="mt-6 p-2 md:p-4">
            <ul className="divide-y divide-line">
              {LIMITS.map(({ Icon, label, text }) => (
                <li key={label} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-4 md:grid-cols-[1.75rem_11rem_minmax(0,1fr)] md:gap-x-5">
                  <Icon aria-hidden="true" className="mt-0.5 size-5 text-accent" />
                  <p className="font-semibold">{label}</p>
                  <p className="col-start-2 text-muted md:col-start-3">{text}</p>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section aria-labelledby="go-h" className="mt-16 md:mt-24">
          <h2 id="go-h" className="font-display text-3xl leading-tight md:text-4xl">
            See it work
          </h2>
          <p className="mt-2 max-w-[48ch] text-muted">The quickest way to understand it is to play a round.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href="/try">Try it alone (60 s)</ButtonLink>
            <ButtonLink href="/host" variant="secondary">
              Host a show
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
