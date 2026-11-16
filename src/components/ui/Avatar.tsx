// Avatar: generated initials on a stable colour (same name, same colour). Server-safe and
// decorative (the name is always written next to it), so it is hidden from screen readers.
//   <Avatar name="Brave Otter" size={32} />      initials("Brave Otter") === "BO"
import type { CSSProperties } from "react";
import { cn } from "./cn";

const COLORS = ["var(--accent)", "var(--opt-a)", "var(--opt-b)", "var(--opt-c)", "var(--warn)"] as const;

export function initials(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? Array.from(words[0]).slice(0, 2) : [Array.from(words[0])[0], Array.from(words[1])[0]];
  return letters.join("").toUpperCase();
}

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const style: CSSProperties = { width: size, height: size, background: avatarColor(name), fontSize: Math.round(size * 0.4) };
  return (
    <span
      aria-hidden="true"
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-display font-extrabold leading-none text-ink", className)}
      style={style}
    >
      {initials(name)}
    </span>
  );
}
