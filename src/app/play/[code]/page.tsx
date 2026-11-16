// /play/[code]: the player screen. One column, the page never scrolls (see PlayerScreen).
import type { Metadata } from "next";
import { PlayerScreen } from "@/components/play/PlayerScreen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Play", robots: { index: false } };

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <main id="main">
      <PlayerScreen code={code} />
    </main>
  );
}
