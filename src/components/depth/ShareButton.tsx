"use client";
// Share button: the phone's share sheet when there is one, otherwise copy the link and say so.
import { Share2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Props = { title: string; text: string; label?: string; variant?: ButtonVariant; block?: boolean };

function currentUrl(): string {
  const u = new URL(window.location.href);
  u.hash = "";
  return u.toString();
}

export function ShareButton({ title, text, label = "Share story", variant = "primary", block }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const share = useCallback(async () => {
    const url = currentUrl();
    setBusy(true);
    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title, text, url });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return; // the person closed the sheet
          // any other failure: fall through to copying the link
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.show({ title: "Link copied", body: "Paste it anywhere to share this story.", kind: "success" });
      } catch {
        toast.show({ title: "Copy this link to share", body: url, kind: "info", durationMs: 12000 });
      }
    } finally {
      setBusy(false);
    }
  }, [title, text, toast]);

  return (
    <Button variant={variant} block={block} onClick={share} loading={busy}>
      {busy ? null : <Share2 aria-hidden="true" className="size-5" />}
      {label}
    </Button>
  );
}
