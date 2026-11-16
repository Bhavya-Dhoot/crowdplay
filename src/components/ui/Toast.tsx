"use client";
// Toast system. <ToastProvider> is mounted once in the root layout; any client component can
//   const toast = useToast();
//   toast.show({ title: "Link copied", kind: "success" });            // info | success | error
//   toast.receipt({ title: "Your idea became canon", body: ideaText }); // gold, buzzes the phone
//   toast.dismiss(id)
// Bottom of the screen on phones, top-right on desktop. Auto-dismisses (pauses while hovered or
// focused), keeps at most 3 on screen. Pure CSS motion: slides on phones/desktop, fade only under
// reduced motion. Outside a provider the hook is a harmless no-op.
import { Check, Info, Sparkles, X, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

export type ToastKind = "info" | "success" | "error" | "receipt";
export type ToastOptions = { title: string; body?: string; kind?: ToastKind; durationMs?: number };
type ToastApi = {
  show(o: ToastOptions): string;
  receipt(o: Omit<ToastOptions, "kind">): string;
  dismiss(id: string): void;
};
type Item = ToastOptions & { id: string; kind: ToastKind };

const MAX_VISIBLE = 3;
const LEAVE_MS = 180;
const DEFAULT_MS: Record<ToastKind, number> = { info: 4000, success: 3500, error: 6000, receipt: 6500 };

const NOOP: ToastApi = { show: () => "", receipt: () => "", dismiss: () => {} };
const Ctx = createContext<ToastApi>(NOOP);

export const useToast = (): ToastApi => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback((o: ToastOptions): string => {
    const id = `t${(seq.current += 1)}`;
    const item: Item = { ...o, id, kind: o.kind ?? "info" };
    setItems((xs) => [...xs, item].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const receipt = useCallback(
    (o: Omit<ToastOptions, "kind">): string => {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(60);
      return show({ ...o, kind: "receipt" });
    },
    [show],
  );

  const api = useMemo<ToastApi>(() => ({ show, receipt, dismiss }), [show, receipt, dismiss]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(16px+var(--safe-bottom))] z-[60] flex flex-col gap-2 md:inset-x-auto md:top-4 md:right-4 md:bottom-auto md:w-96"
      >
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDone={dismiss} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

const ICON = { info: Info, success: Check, error: TriangleAlert, receipt: Sparkles } as const;
const ICON_TONE: Record<ToastKind, string> = {
  info: "text-muted",
  success: "text-ok",
  error: "text-danger",
  receipt: "text-accent",
};

function ToastView({ item, onDone }: { item: Item; onDone: (id: string) => void }) {
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);
  const Icon = ICON[item.kind];
  const duration = item.durationMs ?? DEFAULT_MS[item.kind];

  useEffect(() => {
    if (held || leaving) return;
    const t = setTimeout(() => setLeaving(true), duration);
    return () => clearTimeout(t);
  }, [held, leaving, duration]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => onDone(item.id), LEAVE_MS);
    return () => clearTimeout(t);
  }, [leaving, onDone, item.id]);

  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      data-leaving={leaving}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
      className={cn(
        "toast pointer-events-auto flex items-start gap-3 rounded-card border bg-surface-2 p-4 text-text shadow-lg shadow-black/40",
        item.kind === "receipt" ? "toast-receipt border-accent" : "border-line",
      )}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", ICON_TONE[item.kind])} />
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold leading-snug", item.kind === "receipt" && "font-display text-lg text-accent")}>
          {item.title}
        </p>
        {item.body ? <p className="mt-1 break-words text-sm text-muted">{item.body}</p> : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setLeaving(true)}
        className="-m-2 grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-text motion-reduce:transition-none"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
