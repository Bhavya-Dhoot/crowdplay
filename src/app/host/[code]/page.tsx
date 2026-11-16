// /host/CODE?k=KEY: the live console. The key is read here and handed to the client component,
// which falls back to the key this browser remembered for the room when the link has none.
import type { Metadata } from "next";
import { HostConsole } from "@/components/host/HostConsole";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Host console", robots: { index: false, follow: false } };

export default async function HostConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ k?: string | string[] }>;
}) {
  const { code } = await params;
  const { k } = await searchParams;
  const key = Array.isArray(k) ? k[0] : k;
  return <HostConsole code={code.toUpperCase()} urlKey={key ?? null} />;
}
