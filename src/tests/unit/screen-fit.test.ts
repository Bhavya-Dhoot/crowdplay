import { describe, expect, it } from "vitest";
import { bannerPx } from "@/components/screen/fit";

describe("bannerPx", () => {
  it("keeps the wanted size for a short title", () => {
    expect(bannerPx("Ideas", 1500, 60)).toBe(60);
  });

  it("shrinks a long title so the whole banner fits its box", () => {
    const small = bannerPx("The Heist Of The Very Boring Vault At Midnight", 900, 64);
    expect(small).toBeLessThan(64);
    // 44 capitals plus the tails and padding, in em of the chosen size, stay inside the box.
    expect((Array.from("The Heist Of The Very Boring Vault At Midnight").length * 0.74 + 4.4) * small).toBeLessThanOrEqual(900);
  });

  it("never goes below the floor, and counts emoji as one letter", () => {
    expect(bannerPx("x".repeat(200), 300, 60)).toBe(22);
    expect(bannerPx("🎭🎭", 1500, 60)).toBe(bannerPx("ab", 1500, 60));
  });
});
