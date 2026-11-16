// Button / ButtonLink: pill buttons, at least 44 px tall. Server-safe (no hooks).
//   <Button variant="primary|secondary|ghost|danger|wild" size="md|lg" block loading onClick>..</Button>
//   <ButtonLink href="/host" variant="secondary">..</ButtonLink>     (next/link, same look)
//   buttonClass({ variant, size, block })                             class string for custom elements
// Text sits on --ink over bright fills for AA contrast. The focus ring comes from globals.css.
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "wild";
export type ButtonSize = "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-pill font-semibold leading-none select-none " +
  "transition-[transform,background-color,border-color,filter,opacity] duration-150 " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 " +
  "motion-reduce:transition-none motion-reduce:active:scale-100";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-ink hover:brightness-110",
  secondary: "border border-line bg-surface-2 text-text hover:border-muted",
  ghost: "bg-transparent text-text hover:bg-surface",
  danger: "bg-danger text-ink hover:brightness-110",
  wild: "bg-wild text-ink hover:brightness-110",
};

const SIZE: Record<ButtonSize, string> = {
  md: "min-h-12 px-6 text-base",
  lg: "min-h-14 px-8 text-lg",
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
