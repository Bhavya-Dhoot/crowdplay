// /screen/[code]: the big screen for a projector, and with ?obs=1 a transparent overlay for OBS
// (&qr=1 brings the QR back). The page is a thin shell; everything lives in <ScreenStage>.
import type { Metadata } from "next";
import { ScreenStage } from "@/components/screen/ScreenStage";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return { title: `Big screen ${code.toUpperCase()}`, robots: { index: false, follow: false } };
}

// The root layout paints --bg on <html> and <body>. In OBS both must be see-through, and
// color-scheme must not repaint the canvas dark. Unlayered CSS beats the layered base styles.
const OBS_CSS = "html,body{background:transparent !important;color-scheme:normal !important}";

export default async function ScreenPage({ params, searchParams }: Props) {
  const { code } = await params;
  const sp = await searchParams;
  const obs = sp.obs === "1";
  const qr = sp.qr === "1";
  return (
    <>
      {obs ? <style>{OBS_CSS}</style> : null}
      <main id="main" className="fixed inset-0 overflow-hidden">
        <ScreenStage code={code} obs={obs} qr={qr} />
      </main>
    </>
  );
}
