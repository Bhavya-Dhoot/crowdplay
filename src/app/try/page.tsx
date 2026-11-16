// /try: Judge Mode (UX_SPEC §3.6). A server shell around the client experience.
import type { Metadata } from "next";
import { TryExperience } from "@/components/try/TryExperience";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Try the demo",
  description: "Play a whole 3-round show alone against 30 simulated players. No host, nothing to set up.",
};

export default function TryPage() {
  return <TryExperience />;
}
