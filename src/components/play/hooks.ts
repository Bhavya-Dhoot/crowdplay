"use client";
// Small browser hooks for the player screens.
import { useEffect, useState, useSyncExternalStore } from "react";
import { typedLength, typingDuration } from "./logic";

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

// ---------- typewriter ----------

/**
 * How many characters of `text` to show. Instant when `instant` (reduced motion) or when the text
 * was already there at mount. Restarts when the text changes.
 */
export function useTypewriter(text: string, instant: boolean): { shown: number; done: boolean } {
  const [state, setState] = useState<{ text: string; shown: number }>({ text: "", shown: 0 });

  useEffect(() => {
    if (!text) return;
    if (instant) return;
    const duration = typingDuration(text.length);
    const started = performance.now();
    const id = setInterval(() => {
      const shown = typedLength(text.length, performance.now() - started, duration);
      setState({ text, shown });
      if (shown >= text.length) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [text, instant]);

  if (!text) return { shown: 0, done: true };
  if (instant) return { shown: text.length, done: true };
  const shown = state.text === text ? state.shown : 0;
  return { shown, done: shown >= text.length };
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
