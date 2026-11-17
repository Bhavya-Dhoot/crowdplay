// BotBadge: the 🤖 pill that must sit next to every simulated player's name (GOAL D3). An ink-outlined pill: honesty first.
//   <span>{name} <BotBadge /></span>
import { COPY } from "@/lib/copy";
import { cn } from "./cn";

export function BotBadge({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label={COPY.botTooltip}
      title={COPY.botTooltip}
      className={cn("inline-flex items-center rounded-pill border-2 border-ink bg-paper-raised px-1.5 text-fine leading-5", className)}
    >
      🤖
    </span>
  );
}
