// Root layout: fonts (next/font, self-hosted: Kalam 700 for titles, banners and keywords; Patrick Hand 400 for everything
// else), global styles, theme/viewport, skip link and the toast provider. Pages render their own <main id="main"> so the
// skip link has a target. The three ink-boil filters are defined here once; elements opt in with the `ink-boil` class
// (nothing animates unless an element uses it, so the filters cost nothing on pages that do not).
import type { Metadata, Viewport } from "next";
import { Kalam, Patrick_Hand } from "next/font/google";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";
// Route-specific stylesheets live in the root bundle on purpose: a <Link> prefetch (landing -> /host, /how-it-works)
// preloads a route's own CSS chunk, and Chrome warns about every preloaded stylesheet that is not used within a few
// seconds. These are tiny, so one shared bundle beats a console warning on the landing page.
import "@/components/depth/depth.css";
import "@/components/host/host.css";

// Display hand: titles, banners, keywords, room codes, big numbers, buttons.
const display = Kalam({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-kalam",
  display: "swap",
});

// Note hand: body, notes, inputs, narration, host UI.
const body = Patrick_Hand({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-patrick",
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
  themeColor: "#FBFAF6",
  colorScheme: "light",
};

// One shared set of turbulence filters: the fineliner's wobble "boils" by cycling three seeds (see .ink-boil in globals.css).
function InkBoilDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        {[1, 2, 3].map((seed) => (
          <filter key={seed} id={`ink-boil-${seed}`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed={seed} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${display.variable} ${body.variable}`}>
      <body>
        <InkBoilDefs />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
