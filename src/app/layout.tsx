// Root layout: fonts (next/font, self-hosted), global styles, theme/viewport, skip link and the
// toast provider. Pages render their own <main id="main"> so the skip link has a target.
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

function siteUrl(): URL {
  try {
    return new URL(process.env.APP_URL ?? "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

const DESCRIPTION =
  "Everyone types. AI turns the chaos into three choices. The room decides. You get the credit.";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "CrowdPlay: the audience writes the show", template: "%s | CrowdPlay" },
  description: DESCRIPTION,
  applicationName: "CrowdPlay",
  openGraph: {
    type: "website",
    siteName: "CrowdPlay",
    title: "CrowdPlay: the audience writes the show",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "CrowdPlay: the audience writes the show", description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0B12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${display.variable} ${body.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
