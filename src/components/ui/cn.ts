// cn(...): join class names, skipping falsy values. No tailwind-merge: primitives keep their
// variant classes non-overlapping, so pass extra classes for layout (margin, width), not to
// override colours or padding.
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
