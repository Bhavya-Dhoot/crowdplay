// Pure sizing for hand-lettered banners (no React, no DOM). A banner never wraps (its tails and outline are drawn
// around one line), so a long title has to shrink to fit instead.

/**
 * Banner type size in canvas px: `want` for a short title, smaller as the title grows so the whole banner
 * (uppercase Kalam, letter-spaced, with the two tails) still fits in `maxW` canvas px. Never below `floor`.
 */
export function bannerPx(text: string, maxW: number, want: number, floor = 22): number {
  const chars = Array.from(text.trim()).length;
  // Width of one banner in em of its own type: about 0.74 em per capital plus the face padding and both tails.
  const em = chars * 0.74 + 4.4;
  return Math.max(floor, Math.min(want, Math.floor(maxW / em)));
}
