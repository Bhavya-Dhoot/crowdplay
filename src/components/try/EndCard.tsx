// What a judge sees after FINALE: the demo is honest about being a demo and points at the real product.
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { TRY_COPY } from "./tryCopy";

export function EndCard({ className }: { className?: string }) {
  return (
    <section
      data-testid="try-endcard"
      aria-labelledby="try-end-title"
      className={cn("rounded-card border-2 border-accent bg-surface p-4 sm:p-5", className)}
    >
      <h2 id="try-end-title" className="font-display text-2xl leading-tight font-extrabold">
        {TRY_COPY.end.title}
      </h2>
      <p className="mt-1 text-text/90">{TRY_COPY.end.body}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-3">
        <ButtonLink href="/host" variant="primary" className="col-span-2 sm:col-span-1">
          {TRY_COPY.end.host}
        </ButtonLink>
        <ButtonLink href="/how-it-works" variant="secondary">
          {TRY_COPY.end.how}
        </ButtonLink>
        <ButtonLink href="/impact" variant="secondary">
          {TRY_COPY.end.impact}
        </ButtonLink>
      </div>
    </section>
  );
}
