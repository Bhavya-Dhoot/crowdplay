"use client";
// While the narrator is still writing the recap, re-read the page every few seconds (for up to two minutes).
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const EVERY_MS = 4000;
const MAX_TRIES = 30;

export function StoryRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      router.refresh();
      if (tries >= MAX_TRIES) clearInterval(id);
    }, EVERY_MS);
    return () => clearInterval(id);
  }, [active, router]);
  return null;
}
