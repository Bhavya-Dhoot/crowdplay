// BotBadge: the 🤖 pill that must sit next to every simulated player's name (GOAL D3).
//   <span>{name} <BotBadge /></span>
import { COPY } from "@/lib/copy";
import { cn } from "./cn";

export function BotBadge({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label={COPY.botTooltip}
      title={COPY.botTooltip}
      className={cn("inline-flex items-center rounded-pill border border-stage-line bg-stage-2 px-1.5 text-fine leading-5", className)}
    >
      🤖
    </span>
  );
}
