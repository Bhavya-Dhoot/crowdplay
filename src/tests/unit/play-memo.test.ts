// Perf audit #8: typing must not re-render the idea feed. The draft lives inside Composer (its own state) and the feed
// is memoized with stable props from PlayerView, so a keystroke re-renders Composer only. These guard the two memo
// boundaries that make that true.
import { describe, expect, it } from "vitest";
import { Composer } from "@/components/play/Composer";
import { IdeaFeed } from "@/components/play/IdeaFeed";

const MEMO = Symbol.for("react.memo");
const typeOf = (c: unknown) => (c as { $$typeof?: symbol }).$$typeof;

describe("render boundaries of the player", () => {
  it("memoizes the idea feed", () => {
    expect(typeOf(IdeaFeed)).toBe(MEMO);
  });
  it("memoizes the composer, which owns the draft", () => {
    expect(typeOf(Composer)).toBe(MEMO);
  });
});
