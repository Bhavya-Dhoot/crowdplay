"use client";
// Framer Motion, the small way. Wrap animated UI in <MotionScope> and use `m.*` instead of
// `motion.*`: the animation features load once through LazyMotion (about 15 KB gzip instead of
// the full library), and MotionConfig reducedMotion="user" turns movement and scale into plain
// fades for visitors who asked for less motion. Pages that need springs can nest their own scope.
//   <MotionScope><AnimatePresence><m.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} /></AnimatePresence></MotionScope>
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "framer-motion";
import type { ReactNode } from "react";

export function MotionScope({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

export { AnimatePresence, m };

/** Phase changes slide/fade over 250 ms (UX_SPEC §1). */
export const PHASE_TRANSITION = { duration: 0.25, ease: [0.22, 1, 0.36, 1] } as const;
