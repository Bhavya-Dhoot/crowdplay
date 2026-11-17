"use client";
// StageBackdrop: sets this round's stage light and draws the backdrop (one fixed radial spotlight in --light at about
// 14 percent from the top centre, plus a faint vignette). CSS only, no canvas.
//   <StageBackdrop roundNo={state.roundNo} />                 render once per page, anywhere in the tree
//   <StageBackdrop roundNo={state.roundNo} breathe />          the big screen: the light breathes 12 to 18 percent, 6 s
// --light (round 1 amber, 2 teal, 3 lilac, then cycle; LOBBY/FINALE use round 1) is written on the document root so
// everything inherits it (Countdown ring, bg-light, text-light). It cross-fades over 975 ms when the round changes
// (an @property transition) and snaps back to the default when the page unmounts. Content must sit above it: the
// spotlight is fixed at z-index -1 and <body> is transparent, so normal page content already does.
import { useEffect, type CSSProperties } from "react";
import { lightIndex } from "./stageLight";

type Props = { roundNo?: number | null; breathe?: boolean };

export function StageBackdrop({ roundNo, breathe = false }: Props) {
  const idx = lightIndex(roundNo);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--light", `var(--light-${idx})`);
    return () => {
      root.style.removeProperty("--light");
    };
  }, [idx]);
  // The inline value gives the server-rendered first paint the right hue before hydration.
  return <div aria-hidden="true" className="spotlight" data-breathe={breathe} style={{ "--light": `var(--light-${idx})` } as CSSProperties} />;
}
