// GelDisc: the lettered circle for an option, in its gel colour. Server-safe.
//   <GelDisc letter="A|B|C" size={40} />     C is the wildcard and shows a bolt (the letter stays in the accessible text)
// The letter is real text: A, B or "C" for screen readers, so colour is never the only signal. Letters are --ink (AA at
// any size); on discs 40 px and larger A and C switch to white, which is only 3.4 to 3.7:1 and so large bold only.
import { Zap } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "./cn";
import type { Gel } from "./PaperCard";

export type OptionLetter = "A" | "B" | "C";

const BG: Record<OptionLetter, string> = { A: "bg-gel-a", B: "bg-gel-b", C: "bg-gel-c" };

type Props = { letter: OptionLetter; size?: number; className?: string };

export function GelDisc({ letter, size = 40, className }: Props) {
  const white = size >= 40 && letter !== "B";
  const style: CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.46) };
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-display leading-none font-extrabold",
        BG[letter],
        white ? "text-white" : "text-ink",
        className,
      )}
      style={style}
    >
      {letter === "C" ? (
        <>
          <Zap aria-hidden="true" fill="currentColor" style={{ width: size * 0.5, height: size * 0.5 }} />
          <span className="sr-only">C</span>
        </>
      ) : (
        letter
      )}
    </span>
  );
}

/** "a" | "b" | "c" for PaperCard's gel prop from the letter. */
export const gelOf = (letter: OptionLetter): Gel => letter.toLowerCase() as Gel;
