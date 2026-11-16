"use client";
// Small controls shared by the setup wizard and the console.
//   <Switch checked onChange label hint testId busy/>   a whole-row on/off button (role="switch")
//   <Segmented name label options value onChange/>      3-way choice built on native radios (arrow keys work)
//   <ActionButton variant size loading/>                compact 44 px pill for dense rows
//   <IconButton label pressed tone/>                    44 px square icon button with a required label
//   <CopyButton value label/>                           copies to the clipboard and says "Copied!"
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
        "flex min-h-14 w-full items-center justify-between gap-4 rounded-card border border-line bg-surface-2 px-4 py-2.5 text-left transition-colors hover:border-muted disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-[15px] leading-5 font-semibold">{label}</span>
        {hint ? <span className="mt-0.5 block text-[13px] leading-[18px] text-muted">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill transition-colors motion-reduce:transition-none",
          checked ? "bg-accent" : "bg-line",
        )}
      >
        <span
          className={cn(
            "absolute left-1 grid size-5 place-items-center rounded-full bg-text shadow transition-transform motion-reduce:transition-none",
            checked && "translate-x-5 bg-ink",
          )}
        >
          {busy ? <LoaderCircle className="size-3 animate-spin text-accent motion-reduce:animate-none" /> : null}
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
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-pill border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <label
          key={String(o)}
          data-testid={testIdPrefix ? `${testIdPrefix}-${o}` : undefined}
          className="relative flex min-h-11 cursor-pointer items-center justify-center"
        >
          <input
            type="radio"
            name={name}
            value={String(o)}
            checked={o === value}
            onChange={() => onChange(o)}
            className="peer sr-only"
          />
          <span className="grid h-full w-full place-items-center rounded-pill px-3 text-[15px] font-semibold text-muted tabular-nums transition-colors peer-checked:bg-accent peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent hover:text-text peer-checked:hover:text-ink motion-reduce:transition-none">
            {format ? format(o) : String(o)}
          </span>
        </label>
      ))}
    </div>
  );
}

// ---------- ActionButton / IconButton ----------

type Variant = "secondary" | "danger" | "ghost" | "accent";

const VARIANT: Record<Variant, string> = {
  secondary: "border border-line bg-surface-2 text-text hover:border-muted",
  danger: "border border-danger/60 bg-danger/10 text-danger hover:bg-danger/20",
  ghost: "text-muted hover:bg-surface-2 hover:text-text",
  accent: "bg-accent text-ink hover:brightness-110",
};

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; block?: boolean; children?: ReactNode };

export function ActionButton({ variant = "secondary", loading, block, className, children, type = "button", onClick, ...rest }: ActionButtonProps) {
  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-pill px-4 text-sm font-semibold leading-none select-none transition-[background-color,border-color,opacity,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none motion-reduce:active:scale-100",
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
        "grid size-11 shrink-0 place-items-center rounded-full border transition-colors disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none",
        on && tone === "danger" && "border-danger bg-danger text-ink",
        on && tone === "warn" && "border-warn bg-warn text-ink",
        on && tone === "neutral" && "border-accent bg-accent text-ink",
        !on && "border-transparent text-muted hover:border-line hover:bg-surface-2 hover:text-text",
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
  /** Muted text shown beside the label (the link itself). */
  detail?: string;
  testId?: string;
  className?: string;
  title?: string;
};

export function CopyButton({ value, label, detail, testId, className, title }: CopyButtonProps) {
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
      className={cn(
        "group flex min-h-11 w-full items-center gap-1.5 rounded-pill border border-line bg-surface-2 px-3 text-left text-[13px] transition-colors hover:border-muted data-[copied]:border-ok motion-reduce:transition-none",
        className,
      )}
    >
      {copied ? <Check aria-hidden="true" className="size-4 shrink-0 text-ok" /> : <Copy aria-hidden="true" className="size-4 shrink-0 text-muted group-hover:text-text" />}
      <span className="min-w-0 truncate font-semibold">{copied ? "Copied!" : label}</span>
      {detail && !copied ? <span className="min-w-0 truncate text-[13px] text-muted">{detail}</span> : null}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `${label} copied` : ""}
      </span>
    </button>
  );
}
