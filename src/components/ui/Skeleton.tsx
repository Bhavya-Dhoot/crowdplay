// Skeleton: shimmering placeholder (static under reduced motion). Server-safe.
//   <Skeleton className="h-6 w-40" />   <SkeletonText lines={3} />
// Decorative: pair it with a visually hidden "Loading…" where the wait matters.
import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton rounded-[8px]", className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
