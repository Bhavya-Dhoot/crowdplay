// The brand mark: three paper notes fanned out, the front one with a yellow tick. Decorative (aria-hidden); the
// brand name next to it carries the meaning.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <rect x="4" y="7" width="14" height="19" rx="3" transform="rotate(-14 11 20)" fill="var(--paper-raised)" />
      <rect x="9" y="4" width="14" height="19" rx="3" transform="rotate(-2 16 14)" fill="var(--paper-raised)" />
      <rect x="14" y="6" width="14" height="19" rx="3" transform="rotate(10 21 16)" fill="var(--paper-raised)" />
      <path d="M18 14.5h7M18.5 19h5" stroke="var(--hl-deep)" strokeWidth="3" />
    </svg>
  );
}
