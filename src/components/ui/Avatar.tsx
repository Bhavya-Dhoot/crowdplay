// Avatar: generated initials in an ink-outlined blob with a grey-marker fill (no colours: same name, same blob).
// Server-safe and decorative (the name is always written next to it), so it is hidden from screen readers.
//   <Avatar name="Brave Otter" size={32} />      initials("Brave Otter") === "BO"
import type { CSSProperties } from "react";
import { cn } from "./cn";
import { hash32 } from "./doodle";

// Three slightly different hand-drawn blobs, picked by the name.
const BLOBS = ["52% 48% 55% 45% / 48% 55% 45% 52%", "48% 52% 45% 55% / 55% 46% 54% 45%", "55% 45% 50% 50% / 46% 54% 46% 54%"] as const;

function initials(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? Array.from(words[0]).slice(0, 2) : [Array.from(words[0])[0], Array.from(words[1])[0]];
  return letters.join("").toUpperCase();
}

export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const style: CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.4), borderRadius: BLOBS[hash32(name) % BLOBS.length] };
  return (
    <span
      aria-hidden="true"
      className={cn("inline-grid shrink-0 place-items-center border-2 border-ink bg-marker-1 font-display leading-none text-ink", className)}
      style={style}
    >
      {initials(name)}
    </span>
  );
}
