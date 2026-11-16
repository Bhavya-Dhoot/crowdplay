// /join/[code]: the ticket. Server shell; the interactive part is a client component.
import type { Metadata } from "next";
import { JoinView } from "@/components/play/JoinView";
import { features } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Join the show", robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinView code={code} multilingual={features().multilingual} />;
}
