"use client";
// Small controls shared by the setup wizard and the console (design v3: ink outlines on paper, grey marker for state, the
// yellow stays on the one primary key, which is a ui/Button).
//   <LogoMark/>                                         three paper notes with a yellow tick: the brand mark, shared by both pages
//   FIELD                                               class string of a hand-drawn text field (input, textarea, search)
//   <Switch checked onChange label hint testId busy/>   a whole-row to-do box (role="switch"): a drawn ink check when it is on
//   <Segmented name label options value onChange/>      3-way choice built on native radios (arrow keys work); grey marker = chosen
//   <IconButton label pressed tone loading/>            44 px blob icon button with a required label (mute, remove, delete)
//   <CopyButton value label size variant/>              copies to the clipboard, says "Copied!" with a drawn check and toasts
import { Copy, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PenCheck } from "@/components/ui/PenCheck";
import { useToast } from "@/components/ui/Toast";

// ---------- brand mark and field ----------

/** Three paper notes fanned out, the front one with a yellow tick (the landing page's mark, drawn small). */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <rect x="4" y="7" width="14" height="19" rx="3" transform="rotate(-14 11 20)" fill="var(--paper-raised)" />
      <rect x="9" y="4" width="14" height="19" rx="3" transform="rotate(-2 16 14)" fill="var(--paper-raised)" />
      <rect x="14" y="6" width="14" height="19" rx="3" transform="rotate(10 21 16)" fill="var(--paper-raised)" />
      <path d="M18 14.5h7M18.5 19h5" stroke="var(--hl-deep)" strokeWidth="3" />
    </svg>
  );
}

export const FIELD =
  "min-h-12 w-full rounded-element border-2 border-ink bg-paper-raised px-4 text-body text-ink placeholder:text-ink-notes aria-[invalid=true]:border-danger disabled:opacity-60";

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
      className={cn("press flex min-h-14 w-full items-center gap-3 rounded-element px-2 py-2 text-left hover:bg-marker-1 disabled:pointer-events-none disabled:opacity-50", className)}
    >
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-element border-2 border-ink bg-paper-raised">
        {busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : checked ? <PenCheck size={22} seed={testId ?? label} /> : null}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-small leading-5">{label}</span>
        {hint ? <span className="mt-0.5 block text-small leading-5 text-ink-notes">{hint}</span> : null}
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
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-pill border-2 border-ink bg-paper-raised p-1">
      {options.map((o) => (
        <label
          key={String(o)}
          data-testid={testIdPrefix ? `${testIdPrefix}-${o}` : undefined}
          className="relative flex min-h-11 cursor-pointer items-center justify-center"
        >
          <input type="radio" name={name} value={String(o)} checked={o === value} onChange={() => onChange(o)} className="peer sr-only" />
          <span className="grid h-full w-full place-items-center rounded-pill border-2 border-transparent px-3 font-display text-small text-ink-notes tabular-nums transition-colors duration-175 ease-arrive peer-checked:border-ink peer-checked:bg-marker-2 peer-checked:text-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ink hover:text-ink motion-reduce:transition-none">
            {format ? format(o) : String(o)}
          </span>
        </label>
      ))}
    </div>
  );
}

// ---------- IconButton ----------

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "aria-pressed"> & {
  label: string;
  pressed?: boolean;
  /** danger = destructive (remove, delete): its pressed state is drawn in --danger. */
  tone?: "danger" | "neutral";
  loading?: boolean;
  children: ReactNode;
};

export function IconButton({ label, pressed, tone = "neutral", loading, className, children, type = "button", ...rest }: IconButtonProps) {
  const on = pressed === true;
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      title={label}
      className={cn(
        "press grid size-11 shrink-0 place-items-center rounded-blob border-2 disabled:pointer-events-none disabled:opacity-45",
        on && tone === "danger" && "border-danger bg-paper-raised text-danger",
        on && tone === "neutral" && "border-ink bg-marker-2 text-ink",
        !on && "border-transparent text-ink-notes hover:border-ink hover:text-ink",
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
  testId?: string;
  className?: string;
  title?: string;
  /** lg = the big one for the link people need most. */
  size?: "md" | "lg";
  /** key = a paper key like ui/Button secondary; chip = a quiet outlined chip. */
  variant?: "key" | "chip";
  /** A 44 px round icon button; the label stays as its accessible name. */
  iconOnly?: boolean;
};

export function CopyButton({ value, label, text, testId, className, title, size = "md", variant = "chip", iconOnly }: CopyButtonProps) {
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

  const look = iconOnly
    ? "press size-11 shrink-0 justify-center rounded-blob border-2 border-ink bg-paper-raised px-0 text-ink shadow-slip"
    : variant === "key"
      ? buttonClass({ variant: "secondary", size: size === "lg" ? "md" : "sm", className: "justify-start" })
      : "press min-h-11 rounded-pill border-2 border-ink bg-paper-raised px-3 text-small text-ink shadow-[2px_3px_0_var(--marker-2)]";

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      data-testid={testId}
      data-copied={copied || undefined}
      title={title}
      aria-label={iconOnly ? label : undefined}
      className={cn("group flex items-center gap-2 text-left", look, className)}
    >
      {copied ? <PenCheck size={20} className="shrink-0" /> : <Copy aria-hidden="true" className="size-4 shrink-0" />}
      {iconOnly ? null : <span className="min-w-0 truncate font-display">{copied ? "Copied!" : (text ?? label)}</span>}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `${label} copied` : ""}
      </span>
    </button>
  );
}
