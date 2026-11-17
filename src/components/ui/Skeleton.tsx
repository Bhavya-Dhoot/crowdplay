// Skeleton: shimmering placeholder (static under reduced motion). Server-safe.
//   <Skeleton className="h-6 w-40" />   <SkeletonText lines={3} />
//   <Skeleton tone="paper" />   a paper-coloured one for placeholders that sit on a paper card
// Keep the placeholder the size of the real content so nothing shifts when it loads.
// Decorative: pair it with a visually hidden "Loading…" where the wait matters.
import { cn } from "./cn";

export function Skeleton({ className, tone = "stage" }: { className?: string; tone?: "stage" | "paper" }) {
  return <div aria-hidden="true" className={cn(tone === "paper" ? "skeleton skeleton-paper" : "skeleton", "rounded-element", className)} />;
}

export function SkeletonText({ lines = 3, className, tone }: { lines?: number; className?: string; tone?: "stage" | "paper" }) {
  return (
    <div aria-hidden="true" className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} tone={tone} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
