// /me: my receipts, my numbers and "Delete my data".
import type { Metadata } from "next";
import { MeView } from "@/components/play/MeView";

export const metadata: Metadata = { title: "My receipts", robots: { index: false } };

export default function MePage() {
  return <MeView />;
}
