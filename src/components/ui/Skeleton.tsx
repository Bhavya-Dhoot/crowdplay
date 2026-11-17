// Skeleton: grey marker streaks standing in for content. Static (a design with no idle motion). Server-safe.
//   <Skeleton className="h-6 w-40" />   <SkeletonText lines={3} />
//   tone="stage|paper" is accepted for the old call sites; both look the same on the v3 paper.
// Keep the placeholder the size of the real content so nothing shifts when it loads.
// Decorative: pair it with a visually hidden "Loading..." where the wait matters.
import { cn } from "./cn";

export function Skeleton({ className }: { className?: string; tone?: "stage" | "paper" }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
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
