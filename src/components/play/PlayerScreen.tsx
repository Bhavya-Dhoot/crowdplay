"use client";
// PlayerScreen: /play's full-page frame. A fixed box that tracks the visual viewport, so the page
// itself can never scroll and the composer stays above the on-screen keyboard (iOS and Android).
import { PlayerView } from "./PlayerView";
import { useVisualViewport } from "./hooks";

export function PlayerScreen({ code }: { code: string }) {
  const vv = useVisualViewport();
  return (
    <div
      className="fixed inset-x-0 top-0 h-dvh overflow-hidden overscroll-none"
      style={vv ? { top: vv.top, height: vv.height } : undefined}
    >
      <PlayerView code={code} className="h-full" />
    </div>
  );
}
