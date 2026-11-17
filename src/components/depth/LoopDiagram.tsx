// The show loop as a sketchnote: six numbered boxes joined by yellow fat arrows, Prompt -> Storm -> Distill -> Vote -> Reveal
// -> Finale. A real ordered list, so it reads as a sequence to a screen reader (the numbered banner is the visible name,
// an sr-only heading carries it for assistive tech). On a phone the boxes stack with arrows pointing down; from md up they
// snake across the page: left to right on the first row, an arrow down, then right to left on the second.
import { Clapperboard, CloudLightning, Flag, Sparkles, Trophy, Vote } from "lucide-react";
import { NumberBanner } from "@/components/ui/Banner";
import { tiltOf } from "@/components/ui/doodle";
import { FatArrow } from "@/components/ui/FatArrow";
import { PaperCard } from "@/components/ui/PaperCard";

const LOOP_STEPS = [
  { name: "Prompt", time: "6 s", caption: "A scene and one question", detail: "A new scene appears with one question: what happens next? The next scene is written while the last round is still being revealed, so nobody waits.", Icon: Clapperboard },
  { name: "Storm", time: "30 s", caption: "Everyone types ideas", detail: "Everyone types ideas from their own phone, up to 140 characters. They land on the big screen as they arrive.", Icon: CloudLightning },
  { name: "Distill", time: "about 8 s", caption: "AI finds three choices", detail: "The AI groups similar ideas and writes up two crowd favourites and one wildcard. If it is slow or fails, a plain rules-based pick takes over, so the show never stalls.", Icon: Sparkles },
  { name: "Vote", time: "12 s", caption: "Everyone picks one", detail: "Three options, one vote each, changeable until the clock runs out. The bars move live.", Icon: Vote },
  { name: "Reveal", time: "12 s", caption: "Winner, story and credits", detail: "The winner is announced and the narrator carries the story on. The people behind the winning idea are named, and each of them gets a private receipt.", Icon: Trophy },
  { name: "Finale", time: "open-ended", caption: "Recap and a story page", detail: "A recap, the canon makers and a story page you can share.", Icon: Flag },
] as const;

// Where each box sits from md up (a 3-column snake), as literal classes so Tailwind can see them.
const MD_SLOT = [
  "md:col-start-1 md:row-start-1",
  "md:col-start-2 md:row-start-1",
  "md:col-start-3 md:row-start-1",
  "md:col-start-3 md:row-start-2",
  "md:col-start-2 md:row-start-2",
  "md:col-start-1 md:row-start-2",
] as const;

/** The arrow that leaves box i from md up: right, down at the end of the first row, left along the second. */
function MdArrow({ i }: { i: number }) {
  if (i === 0 || i === 1) return <FatArrow size={54} play={false} seed={`loop-arrow-${i}`} className="absolute top-1/2 -right-[63px] hidden -translate-y-1/2 md:grid" />;
  if (i === 2) return <FatArrow direction="down" size={46} play={false} seed="loop-arrow-2" className="absolute -bottom-[53px] left-1/2 hidden -translate-x-1/2 md:grid" />;
  if (i === 3 || i === 4) return <FatArrow direction="left" size={54} play={false} seed={`loop-arrow-${i}`} className="absolute top-1/2 -left-[63px] hidden -translate-y-1/2 md:grid" />;
  return null;
}

export function LoopDiagram() {
  return (
    <figure>
      <ol aria-label="The six steps of a show, in order" className="grid gap-y-14 md:grid-cols-3 md:gap-x-[72px] md:gap-y-20">
        {LOOP_STEPS.map(({ name, time, caption, detail, Icon }, i) => (
          <li key={name} className={`relative ${MD_SLOT[i]}`}>
            <PaperCard alt={i % 2 === 1} tilt={tiltOf(`loop-${i}`, 0.8)} className="flex h-full flex-col gap-3 px-5 pt-9 pb-5">
              <span aria-hidden="true" className="absolute -top-[19px] left-5">
                <NumberBanner n={i + 1} label={name} />
              </span>
              <h3 className="sr-only">{name}</h3>
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-blob border-2 border-ink bg-marker-1">
                  <Icon className="size-6" strokeWidth={2.2} />
                </span>
                <span className="text-small text-ink-notes tabular-nums">{time}</span>
              </div>
              <p className="font-display text-lead leading-snug">{caption}</p>
              <p className="text-small leading-relaxed text-ink-notes">{detail}</p>
            </PaperCard>
            {i < LOOP_STEPS.length - 1 ? (
              <FatArrow direction="down" size={40} play={false} seed={`loop-down-${i}`} className="absolute -bottom-[48px] left-1/2 -translate-x-1/2 md:hidden" />
            ) : null}
            <MdArrow i={i} />
          </li>
        ))}
      </ol>
      <div className="mt-10 flex justify-center">
        <p className="max-w-full rounded-pill border-2 border-dashed border-ink bg-paper-raised px-4 py-2 text-center text-small">Prompt to Reveal repeats once per round (3 to 10 rounds)</p>
      </div>
      <figcaption className="mt-5 max-w-[62ch] text-small text-ink-notes">
        Default timings. The host can pick 20, 30 or 45 seconds for the storm and 10, 12 or 20 for the vote.
      </figcaption>
    </figure>
  );
}
