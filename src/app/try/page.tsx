// /try: Judge Mode (UX_SPEC §3.6). A server shell around the client experience.
// /try?go=1 (the landing button) starts the demo straight away with a random name; plain /try shows the name box.
import type { Metadata } from "next";
import { TryExperience } from "@/components/try/TryExperience";
import { DEMO_MINUTES } from "@/lib/copy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Try the demo",
  description: `Play a whole 3-round show alone against 30 simulated players in about ${DEMO_MINUTES} minutes. No host, nothing to set up.`,
};

export default async function TryPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const go = (await searchParams).go;
  return <TryExperience autoStart={go === "1"} />;
}
