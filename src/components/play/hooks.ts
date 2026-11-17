"use client";
// Small browser hooks for the player screens.
import { useSyncExternalStore } from "react";

// ---------- visual viewport (keyboard-safe layout) ----------

function subscribeViewport(cb: () => void): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener("resize", cb);
  vv.addEventListener("scroll", cb);
  return () => {
    vv.removeEventListener("resize", cb);
    vv.removeEventListener("scroll", cb);
  };
}

/** "top:height" of the visual viewport in px, "" when unsupported (and on the server). */
function viewportKey(): string {
  const vv = window.visualViewport;
  return vv ? `${Math.round(vv.offsetTop)}:${Math.round(vv.height)}` : "";
}

export type ViewportBox = { top: number; height: number; keyboard: boolean };

/** The visible part of the page. `keyboard` is true when something (the soft keyboard) ate a big slice of it. */
export function useVisualViewport(): ViewportBox | null {
  const key = useSyncExternalStore(subscribeViewport, viewportKey, () => "");
  if (!key) return null;
  const [top, height] = key.split(":").map(Number);
  return { top, height, keyboard: typeof window !== "undefined" && window.innerHeight - height > 120 };
}

// ---------- language ----------

const LANG_KEY = "cp_lang";

/** The language this player chose on /join (or their browser's), as a short code. */
export function getStoredLang(): string {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    if (v) return v;
  } catch {
    /* storage blocked */
  }
  const m = /^[a-zA-Z]{2,3}/.exec(typeof navigator !== "undefined" ? navigator.language : "");
  return m ? m[0].toLowerCase() : "en";
}

export function storeLang(lang: string): void {
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* storage blocked */
  }
}
