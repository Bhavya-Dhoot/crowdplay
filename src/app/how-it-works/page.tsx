// /how-it-works (UX_SPEC §3.7), a page of notes: the loop as numbered boxes joined by fat arrows, the architecture as a
// sketchnote, which Nexconn feature does what (a ruled table on paper), what is new as three numbered boxes, the safety
// layers an idea passes through, and an honest list of limits. Static server component: no client JavaScript on this page.
// The yellow stays on structure (numbered banners, fat arrows, the swash on the title) and on the thread: the numbers of
// "follow one idea" and the canon ribbon.
import { Bot, Eye, Gauge, Mail, ShieldCheck, TriangleAlert, Zap } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArchitectureDiagram } from "@/components/depth/ArchitectureDiagram";
import { LoopDiagram } from "@/components/depth/LoopDiagram";
import { SiteHeader } from "@/components/depth/SiteHeader";
import { TitleBanner } from "@/components/depth/TitleBanner";
import { NumberBanner } from "@/components/ui/Banner";
import { ButtonLink } from "@/components/ui/Button";
import { tiltOf } from "@/components/ui/doodle";
import { FatArrow } from "@/components/ui/FatArrow";
import { Footer } from "@/components/ui/Footer";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { LetterBadge } from "@/components/ui/LetterBadge";
import { PaperCard } from "@/components/ui/PaperCard";
import { Ribbon } from "@/components/ui/Ribbon";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { Swash } from "@/components/ui/Swash";
import { COPY } from "@/lib/copy";

const DESCRIPTION =
  "How a CrowdPlay show works: the six-step loop, the architecture on Nexconn Chat, what is new, how it stays safe, and its honest limits.";

export const metadata: Metadata = {
  title: "How it works",
  description: DESCRIPTION,
  openGraph: { title: "How CrowdPlay works", description: DESCRIPTION },
};

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded-inner bg-marker-1 px-1.5 py-0.5 text-[0.9em] break-words text-ink">{children}</code>
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

// Each box carries the thing it is about: the crowd's options A and B, the wildcard C, the CANON ribbon.
const NEW_THINGS: { tag: string; title: string; body: string; mark: ReactNode }[] = [
  {
    tag: "Options",
    title: "Options written by the crowd",
    body: "Nobody scripts the choices. The AI reads what the room typed, groups it and words three options from those ideas. Counts and credits come from the database, never from the model.",
    mark: (
      <span className="flex gap-2">
        <LetterBadge letter="A" size={44} />
        <LetterBadge letter="B" size={44} />
      </span>
    ),
  },
  {
    tag: "Wildcard",
    title: "A guaranteed minority slot",
    body: "One of the three options is always a wildcard, taken from the small clusters (15% of the ideas or less). A strange idea from a few people can still win the vote.",
    mark: <LetterBadge letter="C" size={44} />,
  },
  {
    tag: "Receipts",
    title: "Personal receipts",
    body: "If your idea reaches the ballot or wins, the narrator sends you a private message and the receipt stays on your page. You get the credit, by name.",
    mark: <Ribbon kind="canon" size="md" animate={false} />,
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

const SECTION = "scroll-mt-6 mt-20 md:mt-28";
const H2 = "font-display text-h2 leading-tight";
const LEAD = "mt-3 max-w-[56ch] text-ink-notes";
const NAV = [
  ["#loop", "The loop"],
  ["#architecture", "Architecture"],
  ["#nexconn", "On Nexconn"],
  ["#new", "What is new"],
  ["#safety", "Safety"],
  ["#limits", "Limits"],
] as const;

// A section head: Kalam with a hand underline, static (it sits below the fold, nobody would see it drawn).
function Head({ id, seed, children }: { id: string; seed: string; children: ReactNode }) {
  return (
    <h2 id={id} className={H2}>
      <InkUnderline play={false} seed={seed}>
        {children}
      </InkUnderline>
    </h2>
  );
}

export default function HowItWorks() {
  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop />
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 md:px-8">
        <header className="pt-6 text-center md:pt-12">
          <h1>
            <TitleBanner className="[--b-px:26] sm:[--b-px:40] md:[--b-px:52]">
              How CrowdPlay{" "}
              <Swash play delayMs={500}>
                works
              </Swash>
            </TitleBanner>
          </h1>
          <p className="mx-auto mt-8 max-w-[48ch] text-lead leading-relaxed text-ink-notes md:text-h3">
            A live show where the audience writes the story. This page covers the loop every round runs through, the plumbing underneath, and what
            the product cannot do yet.
          </p>
          <nav aria-label="On this page" className="mt-7 flex flex-wrap justify-center gap-3">
            {NAV.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="press inline-flex min-h-11 items-center rounded-pill border-2 border-ink bg-paper-raised px-4 text-small shadow-slip hover:text-ink"
              >
                {label}
              </a>
            ))}
          </nav>
        </header>

        <section id="loop" aria-labelledby="loop-h" className={SECTION}>
          <Head id="loop-h" seed="how-loop">
            The loop
          </Head>
          <p className={LEAD}>Every round is the same five steps. After the last round the show ends with a finale.</p>
          <div className="mt-12">
            <LoopDiagram />
          </div>
        </section>

        <section id="architecture" aria-labelledby="arch-h" className={SECTION}>
          <Head id="arch-h" seed="how-arch">
            Under the hood
          </Head>
          <p className={LEAD}>Nexconn Chat carries everything the room sees. The server decides what is true and keeps the record.</p>
          <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-16">
            <ArchitectureDiagram className="h-auto w-full max-w-[26rem]" />
            <div>
              <h3 className="font-display text-h3">Follow one idea</h3>
              <ol className="mt-5 space-y-5">
                {IDEA_TRAIL.map((text, i) => (
                  <li key={i} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4">
                    <span aria-hidden="true" className="pill-active grid size-10 place-items-center rounded-blob border-2 border-ink font-display text-lead leading-none">
                      {i + 1}
                    </span>
                    <p className="max-w-[52ch] pt-1">{text}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-7 max-w-[52ch] text-ink-notes">
                If Nexconn drops out, phones fall back to polling the server over HTTP every couple of seconds and a banner says so. If the AI
                fails, the round still finishes.
              </p>
            </div>
          </div>
        </section>

        <section id="nexconn" aria-labelledby="nex-h" className={SECTION}>
          <Head id="nex-h" seed="how-nexconn">
            What runs on Nexconn
          </Head>
          <p className={LEAD}>Each feature of the show, and the Nexconn capability behind it.</p>
          <PaperCard className="mt-8 overflow-hidden">
            <table className="dp-table table-fixed">
              <caption className="sr-only">Which Nexconn capability powers each CrowdPlay feature</caption>
              <thead className="text-small">
                <tr>
                  <th scope="col" className="w-[40%] px-3 py-3 text-left md:w-[36%] md:px-5">
                    Feature
                  </th>
                  <th scope="col" className="px-3 py-3 text-left md:px-5">
                    Nexconn capability
                  </th>
                </tr>
              </thead>
              <tbody className="text-small">
                {FEATURE_ROWS.map((r) => (
                  <tr key={r.feature}>
                    <th scope="row" className="px-3 py-3.5 text-left align-top font-normal md:px-5">
                      {r.feature}
                    </th>
                    <td className="px-3 py-3.5 align-top text-ink-notes md:px-5">{r.capability}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PaperCard>
        </section>

        <section id="new" aria-labelledby="new-h" className={SECTION}>
          <Head id="new-h" seed="how-new">
            What is new
          </Head>
          <ul className="mt-12 grid gap-x-6 gap-y-12 md:grid-cols-3">
            {NEW_THINGS.map((t, i) => (
              <PaperCard key={t.title} as="li" alt={i % 2 === 1} tilt={tiltOf(`new-${i}`, 0.8)} className="flex flex-col gap-4 p-5 pt-9">
                <NumberBanner n={i + 1} label={t.tag} className="absolute -top-[19px] left-5" />
                <div aria-hidden="true" className="flex min-h-11 items-center">
                  {t.mark}
                </div>
                <h3 className="font-display text-h3 leading-tight">{t.title}</h3>
                <p className="text-small leading-relaxed text-ink-notes">{t.body}</p>
              </PaperCard>
            ))}
          </ul>
        </section>

        <section id="safety" aria-labelledby="safe-h" className={SECTION}>
          <Head id="safe-h" seed="how-safety">
            Safety, in three layers
          </Head>
          <p className={LEAD}>An idea has to get past all of them before it can reach the big screen.</p>
          <ol className="mt-10 grid gap-y-14 md:grid-cols-3 md:gap-x-[72px]">
            {SAFETY_LAYERS.map((l, i) => (
              <li key={l.title} className="relative">
                <PaperCard alt={i % 2 === 1} tilt={tiltOf(`safe-${i}`, 0.8)} className="flex h-full flex-col gap-3 p-5">
                  <p className="flex items-center gap-3">
                    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-blob border-2 border-ink bg-marker-1 font-display text-lead leading-none">
                      {i + 1}
                    </span>
                    <span className="font-display text-lead">{l.title}</span>
                  </p>
                  <p className="text-small leading-relaxed text-ink-notes">{l.body}</p>
                </PaperCard>
                {i < SAFETY_LAYERS.length - 1 ? (
                  <>
                    <FatArrow direction="down" size={40} play={false} seed={`safe-down-${i}`} className="absolute -bottom-[48px] left-1/2 -translate-x-1/2 md:hidden" />
                    <FatArrow size={54} play={false} seed={`safe-right-${i}`} className="absolute top-1/2 -right-[63px] hidden -translate-y-1/2 md:grid" />
                  </>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="mt-9 flex max-w-[64ch] items-start gap-3 text-ink-notes">
            <ShieldCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-ink" />
            <span>
              Public rooms start with the strict filter on. Players can send one idea every two seconds and twelve per round. Ideas are always
              treated as text to read, never as instructions to the AI. Display names go through the same filter.
            </span>
          </p>
        </section>

        <section id="limits" aria-labelledby="limits-h" className={SECTION}>
          <Head id="limits-h" seed="how-limits">
            Limits and honesty
          </Head>
          <p className={LEAD}>What CrowdPlay does not do, or has not proven yet.</p>
          <PaperCard className="mt-8 p-2 md:p-4">
            <ul className="divide-y-[1.5px] divide-dashed divide-ink-faint">
              {LIMITS.map(({ Icon, label, text }) => (
                <li key={label} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-4 md:grid-cols-[1.75rem_11rem_minmax(0,1fr)] md:gap-x-5">
                  <Icon aria-hidden="true" className="mt-0.5 size-5 text-ink" />
                  <p className="font-display">{label}</p>
                  <p className="col-start-2 text-ink-notes md:col-start-3">{text}</p>
                </li>
              ))}
            </ul>
          </PaperCard>
        </section>

        <section aria-labelledby="go-h" className="mt-20 md:mt-28">
          <Head id="go-h" seed="how-go">
            See it work
          </Head>
          <p className="mt-3 max-w-[48ch] text-ink-notes">The quickest way to understand it is to play a round.</p>
          <div className="mt-6 flex flex-wrap gap-3">
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
