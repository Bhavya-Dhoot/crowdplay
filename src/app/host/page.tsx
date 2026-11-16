// /host: the setup wizard (UX §3.4). All the work happens in the client component.
import type { Metadata } from "next";
import { HostWizard } from "@/components/host/HostWizard";

export const metadata: Metadata = { title: "Host a show" };

export default function HostPage() {
  return <HostWizard />;
}
