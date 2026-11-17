// Button / ButtonLink: pill buttons, at least 44 px tall. Server-safe (no hooks).
//   <Button variant="primary|secondary|ghost|danger|wild" size="sm|md|lg" block loading onClick>..</Button>
//   <ButtonLink href="/host" variant="secondary">..</ButtonLink>     (next/link, same look)
//   buttonClass({ variant, size, block })                             class string for custom elements
// primary = the gold pill, ONE per view (the phase action, "Play a 60-second demo"). secondary = a paper pill on
// the stage. ghost = text on the stage. danger / wild are status fills. Text is --ink on every bright fill (AA).
// Press = 0 ms onset scale(.98) + overlay (the .press class in globals.css), never a layout change; the focus ring
// is the global 2 px gold at 3 px offset.
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "wild";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "press inline-flex items-center justify-center gap-2 rounded-pill font-semibold leading-none select-none " +
  "disabled:pointer-events-none aria-disabled:pointer-events-none";

// A disabled button goes quiet (stage grey, muted text) instead of a washed-out version of its colour.
const OFF = "disabled:bg-stage-2 disabled:text-muted-on-stage disabled:shadow-none aria-disabled:bg-stage-2 aria-disabled:text-muted-on-stage aria-disabled:shadow-none";

const VARIANT: Record<ButtonVariant, string> = {
  primary: `bg-gold text-ink ${OFF}`,
  secondary: `bg-paper text-ink shadow-[0_1px_0_var(--paper-edge)] ${OFF}`,
  ghost: "bg-transparent text-on-stage [--press-overlay:rgb(255_255_255/0.1)] disabled:text-muted-on-stage/60 aria-disabled:text-muted-on-stage/60",
  danger: `bg-danger text-ink ${OFF}`,
  wild: `bg-gel-c text-ink ${OFF}`,
};

const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-11 px-4 text-small",
  md: "min-h-12 px-6 text-body",
  lg: "min-h-14 px-8 text-lead",
};

export function buttonClass(o: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}): string {
  return cn(BASE, VARIANT[o.variant ?? "primary"], SIZE[o.size ?? "md"], o.block && "w-full", o.className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner, sets aria-busy and ignores clicks. */
  loading?: boolean;
  children?: ReactNode;
};

export function Button({ variant, size, block, loading, className, children, type = "button", onClick, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, block, className })}
      onClick={loading ? undefined : onClick}
      {...rest}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : null}
      {children}
    </button>
  );
}

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
};

export function ButtonLink({ variant, size, block, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClass({ variant, size, block, className })} {...rest} />;
}
