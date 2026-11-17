"use client";
// Toast system. <ToastProvider> is mounted once in the root layout; any client component can
//   const toast = useToast();
//   toast.show({ title: "Link copied", kind: "success" });            // info | success | error
//   toast.receipt({ title: "Your idea became canon", body: ideaText }); // "yours": yellow swash on the keyword, buzzes the phone
//   toast.dismiss(id)    toast.clear()   (e.g. drop every toast on the first vote)
//   toast.show({ title, placement: "top" })                            // this toast only
//   useToastPlacement("top")                                           // while this component is mounted
// placement "bottom" (default) | "top" decides which screen edge the stack hugs on PHONES; from 768 px up toasts always
// sit top-right, as before. Phones put toasts at the top during VOTE so they never cover the vote cards. The stack
// follows the newest toast's placement.
// A toast is a paper slip with a strip of grey washi tape on its corner. The receipt ("yours") gets the yellow marker
// behind its keyword ("canon", else the last word of the title). Auto-dismisses (pauses while hovered or focused), keeps
// at most 3 on screen. Pure CSS motion: placed (opacity + a 6 px settle), never slid across; none under reduced motion.
// Outside a provider the hook is a harmless no-op.
import { Info, Sparkles, X, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { haptic } from "./motionTokens";
import { PenCheck } from "./PenCheck";
import { Swash } from "./Swash";

type ToastKind = "info" | "success" | "error" | "receipt";
type ToastPlacement = "bottom" | "top";
type ToastOptions = { title: string; body?: string; kind?: ToastKind; durationMs?: number; placement?: ToastPlacement };
type ToastApi = {
  show(o: ToastOptions): string;
  receipt(o: Omit<ToastOptions, "kind">): string;
  dismiss(id: string): void;
  /** Removes every toast at once. */
  clear(): void;
  /** Default placement for toasts without their own; null restores the default ("bottom"). */
  setPlacement(p: ToastPlacement | null): void;
};
type Item = ToastOptions & { id: string; kind: ToastKind; placement: ToastPlacement };

const MAX_VISIBLE = 3;
const LEAVE_MS = 175;
const DEFAULT_MS: Record<ToastKind, number> = { info: 4000, success: 3500, error: 6000, receipt: 6500 };
const DELAY_SWASH_MS = 250;

const NOOP: ToastApi = { show: () => "", receipt: () => "", dismiss: () => {}, clear: () => {}, setPlacement: () => {} };
const Ctx = createContext<ToastApi>(NOOP);

export const useToast = (): ToastApi => useContext(Ctx);

/** Pins the default placement while the calling component is mounted (e.g. "top" on the VOTE screen). */
export function useToastPlacement(p: ToastPlacement): void {
  const { setPlacement } = useToast();
  useEffect(() => {
    setPlacement(p);
    return () => setPlacement(null);
  }, [p, setPlacement]);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  const place = useRef<ToastPlacement>("bottom");

  const dismiss = useCallback((id: string) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);
  const setPlacement = useCallback((p: ToastPlacement | null) => {
    place.current = p ?? "bottom";
  }, []);

  const show = useCallback((o: ToastOptions): string => {
    const id = `t${(seq.current += 1)}`;
    const item: Item = { ...o, id, kind: o.kind ?? "info", placement: o.placement ?? place.current };
    setItems((xs) => [...xs, item].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const receipt = useCallback(
    (o: Omit<ToastOptions, "kind">): string => {
      haptic("canon");
      return show({ ...o, kind: "receipt" });
    },
    [show],
  );

  const api = useMemo<ToastApi>(() => ({ show, receipt, dismiss, clear, setPlacement }), [show, receipt, dismiss, clear, setPlacement]);
  const top = items.length > 0 && items[items.length - 1].placement === "top";

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        data-placement={top ? "top" : "bottom"}
        className={cn(
          "pointer-events-none fixed inset-x-4 z-[60] flex flex-col gap-4 md:inset-x-auto md:top-4 md:right-4 md:bottom-auto md:w-96",
          top ? "top-[calc(12px+var(--safe-top))]" : "bottom-[calc(16px+var(--safe-bottom))]",
        )}
      >
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDone={dismiss} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

const ICON = { info: Info, error: TriangleAlert, receipt: Sparkles } as const;
const ICON_TONE: Record<ToastKind, string> = {
  info: "text-ink-notes",
  success: "text-ink",
  error: "text-danger",
  receipt: "text-ink",
};

// The yellow marker goes behind the word that matters: "canon" if the title has it, else the last word.
function withKeyword(title: string): ReactNode {
  const hit = /canon/i.exec(title);
  const at = hit ? hit.index : Math.max(0, title.lastIndexOf(" ") + 1);
  const len = hit ? hit[0].length : title.length - at;
  return (
    <>
      {title.slice(0, at)}
      <Swash play delayMs={DELAY_SWASH_MS}>
        {title.slice(at, at + len)}
      </Swash>
      {title.slice(at + len)}
    </>
  );
}

function ToastView({ item, onDone }: { item: Item; onDone: (id: string) => void }) {
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);
  const duration = item.durationMs ?? DEFAULT_MS[item.kind];
  const yours = item.kind === "receipt";
  const Icon = item.kind === "success" ? null : ICON[item.kind];

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
      className={cn("toast slip pointer-events-auto flex items-start gap-3 rounded-card p-4 pt-5", item.kind === "error" && "border-danger")}
    >
      {Icon ? <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", ICON_TONE[item.kind])} /> : <PenCheck size={20} className="mt-0.5" />}
      <div className="min-w-0 flex-1">
        <p className="font-display leading-snug">{yours ? withKeyword(item.title) : item.title}</p>
        {item.body ? <p className="mt-1 text-small break-words text-ink-notes">{item.body}</p> : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setLeaving(true)}
        className="press -m-2 grid size-11 shrink-0 place-items-center rounded-blob text-ink-notes"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
