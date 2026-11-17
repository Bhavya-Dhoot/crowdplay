// A strip of grey washi tape (the notched ends of the style's subtitle slip). Decoration only: position and tilt it
// from the outside, e.g. <Tape className="-top-2.5 left-8 -rotate-[5deg]" /> on a `relative` note.
import { cn } from "@/components/ui/cn";

const NOTCHED = "polygon(0 0, 100% 0, 97% 25%, 100% 50%, 97% 75%, 100% 100%, 0 100%, 3% 75%, 0 50%, 3% 25%)";

export function Tape({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("pointer-events-none absolute h-[18px] w-14 bg-marker-2", className)} style={{ clipPath: NOTCHED }} />;
}
