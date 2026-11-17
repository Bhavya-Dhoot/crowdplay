// A small ink doodle for each story on the setup page (a gem, a castle, a rocket, a magnifier, a mortarboard, a pencil): fineliner
// outline, grey marker for volume, no yellow. Pure and server-safe; decorative (the story's name is always written next to it).
//   <PresetDoodle id="heist" className="size-12" />
import type { ReactNode } from "react";
import type { PresetId } from "@/lib/realtime/types";

const M1 = "var(--marker-1)";
const M2 = "var(--marker-2)";
const M3 = "var(--marker-3)";

const DOODLE: Record<PresetId, ReactNode> = {
  heist: (
    <>
      <path d="M13 18 L19 9 H29 L35 18 L24 38 Z" fill={M1} />
      <path d="M24 18 H35 L24 38 Z" fill={M2} stroke="none" />
      <path d="M13 18 L19 9 H29 L35 18 L24 38 Z M13 18 H35 M19 9 L22 18 L24 38 M29 9 L26 18 L24 38" />
      <path d="M39 6 v6 M36 9 h6 M8 30 v5 M5.5 32.5 h5" strokeWidth="1.8" />
    </>
  ),
  fantasy: (
    <>
      <path d="M9 40 V17 H15 V22 H20 V17 H28 V22 H33 V17 H39 V40 Z" fill={M1} />
      <path d="M20 40 V32 A4 4 0 0 1 28 32 V40" fill={M3} />
      <path d="M24 17 V6" />
      <path d="M24 6 L33 9.5 L24 13 Z" fill={M2} />
      <path d="M12.5 27 v3.5 M35.5 27 v3.5" strokeWidth="1.8" />
    </>
  ),
  space: (
    <>
      <path d="M17 26 L10 35 L17 33 Z M31 26 L38 35 L31 33 Z" fill={M2} />
      <path d="M24 5 C31 11 33 21 31 32 H17 C15 21 17 11 24 5 Z" fill={M1} />
      <circle cx="24" cy="18" r="4" fill="var(--paper-raised)" />
      <path d="M20 35 L24 43 L28 35" />
      <path d="M8 11 v5 M5.5 13.5 h5 M40 20 v4 M38 22 h4" strokeWidth="1.8" />
    </>
  ),
  mystery: (
    <>
      <circle cx="20" cy="20" r="11" fill={M1} />
      <path d="M13.5 18 A7.5 7.5 0 0 1 19 12.5" strokeWidth="1.8" />
      <path d="M28.5 28.5 L40 40" strokeWidth="4.6" />
    </>
  ),
  classroom: (
    <>
      <path d="M13 23 V31 C13 36 35 36 35 31 V23" fill={M2} />
      <path d="M24 10 L43 19 L24 28 L5 19 Z" fill={M1} />
      <path d="M40 21.5 V32" />
      <circle cx="40" cy="34" r="2.2" fill={M3} />
    </>
  ),
  custom: (
    <>
      <path d="M9 39 L11 31 L32 10 L38 16 L17 37 Z" fill={M1} />
      <path d="M9 39 L11 31 L17 37 Z" fill={M3} />
      <path d="M29 13 L35 19" />
      <path d="M40 4 v6 M37 7 h6" strokeWidth="1.8" />
    </>
  ),
};

export function PresetDoodle({ id, className }: { id: PresetId; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="var(--ink)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {DOODLE[id]}
    </svg>
  );
}
