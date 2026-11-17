// Button / ButtonLink: sketchnote keys, at least 44 px tall. Server-safe (no hooks).
//   <Button variant="primary|secondary|ghost|danger|wild" size="sm|md|lg" block loading onClick>..</Button>
//   <ButtonLink href="/host" variant="secondary">..</ButtonLink>     (next/link, same look)
//   buttonClass({ variant, size, block })                             class string for custom elements
// primary = the yellow key (--hl-solid face, 3 px ink outline, hand-drawn pill, ink shadow): ONE per view (the phase
// action, "Play a 2-minute demo"). secondary = the same key on paper. ghost = ink text with a hand-drawn underline on
// hover / focus. danger = paper key with --danger text and icon. wild = secondary with a dashed outline.
// Every key presses INTO its shadow (translate 4px 4px, shadow 0): tactile on every tap, instant onset. Disabled goes
// grey with no shadow. Focus ring: the global 3 px ink at 3 px offset. Labels are Kalam 700; icons take the text colour.
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "wild";
type ButtonSize = "sm" | "md" | "lg";

const BASE = "btn select-none disabled:pointer-events-none aria-disabled:pointer-events-none";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "",
  ghost: "btn-ghost scribble",
  danger: "btn-danger",
  wild: "btn-wild",
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
