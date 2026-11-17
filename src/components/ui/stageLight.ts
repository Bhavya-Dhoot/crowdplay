// The stage light for a round: pure helpers, no React.
//   lightIndex(roundNo)  1 | 2 | 3   (round 1 amber, 2 teal, 3 lilac, then cycles; LOBBY/FINALE/odd input -> 1)
//   lightVar(roundNo)    "var(--light-2)"  for style={{ "--light": ... }}
//   ROUND_LIGHTS         the same three hex values, for canvas / SVG / confetti that cannot read CSS variables
// Keep in step with --light-1..3 in src/styles/tokens.css.
export const ROUND_LIGHTS = ["#FFB547", "#4FD1C5", "#B892FF"] as const;

export function lightIndex(roundNo: number | null | undefined): 1 | 2 | 3 {
  if (typeof roundNo !== "number" || !Number.isFinite(roundNo) || roundNo < 1) return 1;
  return ((((Math.floor(roundNo) - 1) % 3) + 3) % 3 + 1) as 1 | 2 | 3;
}

export const lightVar = (roundNo: number | null | undefined): string => `var(--light-${lightIndex(roundNo)})`;

export const lightHex = (roundNo: number | null | undefined): string => ROUND_LIGHTS[lightIndex(roundNo) - 1];
