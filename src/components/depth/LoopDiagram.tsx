// The show loop as a diagram: Prompt -> Storm -> Distill -> Vote -> Reveal -> (repeat) -> Finale.
// A real ordered list, so it reads as a sequence to a screen reader. Each step is a paper disc on the stage; one ring
// in the stage light walks the steps to show the direction (opacity only); reduced motion gets the still picture.
import { Clapperboard, CloudLightning, Flag, Sparkles, Trophy, Vote } from "lucide-react";
import type { CSSProperties } from "react";
import "./depth.css";

export const LOOP_STEPS = [
  { name: "Prompt", time: "6 s", caption: "A scene and one question", detail: "A new scene appears with one question: what happens next? The next scene is written while the last round is still being revealed, so nobody waits.", Icon: Clapperboard },
  { name: "Storm", time: "30 s", caption: "Everyone types ideas", detail: "Everyone types ideas from their own phone, up to 140 characters. They land on the big screen as they arrive.", Icon: CloudLightning },
  { name: "Distill", time: "about 8 s", caption: "AI finds three choices", detail: "The AI groups similar ideas and writes up two crowd favourites and one wildcard. If it is slow or fails, a plain rules-based pick takes over, so the show never stalls.", Icon: Sparkles },
  { name: "Vote", time: "12 s", caption: "Everyone picks one", detail: "Three options, one vote each, changeable until the clock runs out. The bars move live.", Icon: Vote },
  { name: "Reveal", time: "12 s", caption: "Winner, story and credits", detail: "The winner is announced and the narrator carries the story on. The people behind the winning idea are named, and each of them gets a private receipt.", Icon: Trophy },
  { name: "Finale", time: "open-ended", caption: "Recap and a story page", detail: "A recap, the canon makers and a story page you can share.", Icon: Flag },
] as const;

export function LoopDiagram() {
  return (
    <figure>
      <ol className="dp-loop" aria-label="The six steps of a show, in order">
        {LOOP_STEPS.map(({ name, time, caption, detail, Icon }, i) => (
          <li key={name} className="dp-step" style={{ "--i": i } as CSSProperties}>
            <span className="dp-node" aria-hidden="true">
              <Icon className="size-6" />
            </span>
            <span className="dp-text">
              <span className="font-display text-lead leading-tight font-extrabold text-on-stage">{name}</span>
              <span className="text-small text-muted-on-stage tabular-nums">{time}</span>
              <span className="text-small leading-snug text-on-stage">{caption}</span>
              <span className="mt-2 text-small leading-relaxed text-muted-on-stage md:hidden">{detail}</span>
            </span>
            {i === 4 ? (
              <span className="col-start-2 mt-3 inline-flex w-fit items-center rounded-pill border border-stage-line bg-stage-1 px-3 py-1 text-fine text-muted-on-stage md:hidden">
                Repeats for every round, then the finale
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="dp-repeat" aria-hidden="true">
        Prompt to Reveal repeats once per round (3 to 10 rounds)
      </div>
      <figcaption className="mt-6 max-w-[62ch] text-small text-muted-on-stage">
        Default timings. The host can pick 20, 30 or 45 seconds for the storm and 10, 12 or 20 for the vote.
      </figcaption>
    </figure>
  );
}
