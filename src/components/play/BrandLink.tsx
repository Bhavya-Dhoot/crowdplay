// The small brand link in the header of /join and /me: three paper notes fanned out, the front one with a yellow tick,
// and the name. Same mark as the landing page's. Server-safe.
import Link from "next/link";
import { COPY } from "@/lib/copy";
import { LogoMark } from "@/components/ui/LogoMark";

export function BrandLink() {
  return (
    <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-lead">
      <LogoMark />
      {COPY.brand}
    </Link>
  );
}
