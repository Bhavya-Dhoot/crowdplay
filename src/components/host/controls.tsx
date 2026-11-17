"use client";
// Small controls shared by the setup wizard and the console (design v2: paper pills on stage, one gold per view).
//   <Switch checked onChange label hint testId busy/>   a whole-row on/off button (role="switch")
//   <Segmented name label options value onChange/>      3-way choice built on native radios (arrow keys work)
//   <ActionButton variant size loading/>                compact pill for dense rows. secondary = paper pill on stage,
//                                                        accent = the gold one (Resume, when the phase key is parked),
//                                                        paper / ink / veto sit ON paper cards (Veto, Force win)
//   <IconButton label pressed tone surface/>            44 px round icon button with a required label
//   <CopyButton value label size tone/>                 copies to the clipboard, says "Copied!" and toasts
import { Check, Copy, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/Toast";

// ---------- Switch ----------

type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  busy?: boolean;
  testId?: string;
  className?: string;
};

export function Switch({ checked, onChange, label, hint, disabled, busy, testId, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={busy || undefined}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={cn(
        "press flex min-h-14 w-full items-center justify-between gap-4 rounded-card border border-stage-line bg-stage-2 px-4 py-2.5 text-left [--press-overlay:rgb(255_255_255/0.07)] hover:border-muted-on-stage/50 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-small leading-5 font-semibold text-on-stage">{label}</span>
        {hint ? <span className="mt-0.5 block text-fine leading-[18px] text-muted-on-stage">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill transition-colors duration-175 ease-arrive motion-reduce:transition-none",
          checked ? "bg-ok" : "bg-stage-line",
        )}
      >
        <span
          className={cn(
            "absolute left-1 grid size-5 place-items-center rounded-full shadow transition-transform duration-175 ease-arrive motion-reduce:transition-none",
            checked ? "translate-x-5 bg-ink text-ok" : "bg-on-stage",
          )}
        >
          {busy ? <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" /> : checked ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
      </span>
    </button>
  );
}

// ---------- Segmented ----------

type SegmentedProps<T extends number | string> = {
  name: string;
  label: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  format?: (v: T) => string;
  testIdPrefix?: string;
};

export function Segmented<T extends number | string>({ name, label, options, value, onChange, format, testIdPrefix }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-pill border border-stage-line bg-stage-2 p-1">
      {options.map((o) => (
        <label
          key={String(o)}
          data-testid={testIdPrefix ? `${testIdPrefix}-${o}` : undefined}
          className="relative flex min-h-11 cursor-pointer items-center justify-center"
        >
          <input type="radio" name={name} value={String(o)} checked={o === value} onChange={() => onChange(o)} className="peer sr-only" />
          <span className="grid h-full w-full place-items-center rounded-pill px-3 text-small font-semibold text-muted-on-stage tabular-nums transition-colors duration-175 ease-arrive peer-checked:bg-paper peer-checked:text-ink peer-checked:shadow-contact peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold hover:text-on-stage peer-checked:hover:text-ink motion-reduce:transition-none">
            {format ? format(o) : String(o)}
          </span>
        </label>
      ))}
    </div>
  );
}

// ---------- ActionButton / IconButton ----------

type Variant = "secondary" | "danger" | "ghost" | "accent" | "paper" | "ink" | "veto";

const DARK_OVERLAY = "[--press-overlay:rgb(255_255_255/0.12)]";
// A parked light button goes stage grey, like ui/Button, instead of a washed-out paper pill.
const OFF = "disabled:bg-stage-2 disabled:text-muted-on-stage disabled:shadow-none";
const FADE = "disabled:opacity-45";

const VARIANT: Record<Variant, string> = {
  secondary: `bg-paper text-ink shadow-[0_1px_0_var(--paper-edge)] ${OFF}`,
  accent: `bg-gold text-ink ${OFF}`,
  danger: `border border-danger/60 text-danger ${DARK_OVERLAY} ${FADE}`,
  ghost: `text-muted-on-stage hover:text-on-stage ${DARK_OVERLAY} ${FADE}`,
  // On paper cards: a paper pill would vanish, so these three are drawn for light ground.
  paper: `border border-paper-edge bg-paper-2 text-ink ${FADE}`,
  ink: `bg-ink text-paper ${DARK_OVERLAY} ${FADE}`,
  veto: `border border-danger-on-paper/60 text-danger-on-paper ${FADE}`,
};

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "md" | "lg";
  loading?: boolean;
  block?: boolean;
  children?: ReactNode;
};

export function ActionButton({ variant = "secondary", size = "md", loading, block, className, children, type = "button", onClick, ...rest }: ActionButtonProps) {
  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={cn(
        "press inline-flex items-center justify-center gap-2 rounded-pill px-4 leading-none font-semibold select-none disabled:pointer-events-none",
        size === "lg" ? "min-h-12 text-body" : "min-h-11 text-small",
        VARIANT[variant],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
      {children}
    </button>
  );
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "aria-pressed"> & {
  label: string;
  pressed?: boolean;
  tone?: "danger" | "warn" | "neutral";
  /** Where it sits: on the stage or on a paper card. */
  surface?: "stage" | "paper";
  loading?: boolean;
  children: ReactNode;
};

export function IconButton({ label, pressed, tone = "neutral", surface = "stage", loading, className, children, type = "button", ...rest }: IconButtonProps) {
  const on = pressed === true;
  const paper = surface === "paper";
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      title={label}
      className={cn(
        "press grid size-11 shrink-0 place-items-center rounded-full border disabled:pointer-events-none disabled:opacity-45",
        on && tone === "danger" && "border-danger bg-danger text-ink",
        on && tone === "warn" && "border-warn bg-warn text-ink",
        on && tone === "neutral" && "border-gold bg-gold text-ink",
        !on && !paper && `border-transparent text-muted-on-stage hover:border-stage-line hover:bg-stage-2 hover:text-on-stage ${DARK_OVERLAY}`,
        !on && paper && "border-transparent text-ink-muted hover:border-paper-edge hover:bg-paper-2 hover:text-ink",
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : children}
    </button>
  );
}

// ---------- CopyButton ----------

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and non-secure origins: fall back to a hidden textarea.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

type CopyButtonProps = {
  value: string;
  label: string;
  /** What the button says before it is pressed; defaults to the label. The toast always uses the label. */
  text?: string;
  /** Muted text shown beside the label (the link itself). */
  detail?: string;
  testId?: string;
  className?: string;
  title?: string;
  /** lg = the big one for the link people need most. */
  size?: "md" | "lg";
  /** paper = a paper pill (secondary action); stage = a quiet chip. */
  tone?: "stage" | "paper";
  /** A 44 px round icon button; the label stays as its accessible name. */
  iconOnly?: boolean;
};

export function CopyButton({ value, label, text, detail, testId, className, title, size = "md", tone = "stage", iconOnly }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onClick = async () => {
    const ok = await copyText(value);
    if (!ok) {
      toast.show({ title: "Couldn't copy that", body: "Select the text and copy it by hand.", kind: "error" });
      return;
    }
    setCopied(true);
    toast.show({ title: `${label} copied`, kind: "success", durationMs: 2000 });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      data-testid={testId}
      data-copied={copied || undefined}
      title={title}
      aria-label={iconOnly ? label : undefined}
      className={cn(
        "press group flex items-center gap-2 rounded-pill text-left font-semibold",
        iconOnly ? "size-11 shrink-0 justify-center px-0" : size === "lg" ? "min-h-12 px-5 text-small" : "min-h-11 px-3 text-fine",
        tone === "paper"
          ? "bg-paper text-ink shadow-[0_1px_0_var(--paper-edge)]"
          : `border border-stage-line bg-stage-2 text-on-stage hover:border-muted-on-stage/50 data-[copied]:border-ok ${DARK_OVERLAY}`,
        className,
      )}
    >
      {copied ? (
        <Check aria-hidden="true" className={cn("shrink-0", size === "lg" ? "size-5" : "size-4", tone === "paper" ? "text-ink" : "text-ok")} />
      ) : (
        <Copy aria-hidden="true" className={cn("shrink-0", size === "lg" ? "size-5" : "size-4", tone === "paper" ? "text-ink-muted" : "text-muted-on-stage group-hover:text-on-stage")} />
      )}
      {iconOnly ? null : <span className="min-w-0 truncate">{copied ? "Copied!" : (text ?? label)}</span>}
      {detail && !copied && !iconOnly ? <span className={cn("min-w-0 truncate text-fine font-normal", tone === "paper" ? "text-ink-muted" : "text-muted-on-stage")}>{detail}</span> : null}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `${label} copied` : ""}
      </span>
    </button>
  );
}
