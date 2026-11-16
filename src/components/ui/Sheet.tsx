"use client";
// Sheet: a modal built on the native <dialog>, so focus trapping, Esc, inert background and the
// top layer come from the browser. Slides up from the bottom on phones, pops in centred on desktop.
//   <Sheet open={open} onClose={() => setOpen(false)} title="Share the show">…</Sheet>
// `open` is controlled: Esc, the backdrop and the close button all call onClose and you flip it.
// Closing plays a short exit animation before the dialog is really closed.
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "./cn";

const EXIT_MS = 180;

type Props = { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string };

export function Sheet({ open, onClose, title, children, className }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      d.removeAttribute("data-closing");
      if (!d.open) d.showModal();
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = "";
      };
    }
    if (d.open) {
      d.setAttribute("data-closing", "true");
      const t = setTimeout(() => {
        d.close();
        d.removeAttribute("data-closing");
      }, EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="sheet"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={cn("flex max-h-[inherit] flex-col pb-[var(--safe-bottom)]", className)}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-3">
          <h2 id={titleId} className="font-display text-xl">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-3 grid size-11 place-items-center rounded-full text-muted transition-colors hover:text-text motion-reduce:transition-none"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-6 py-4">{children}</div>
      </div>
    </dialog>
  );
}
