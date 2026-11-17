"use client";
// How people get in: the QR in a drawn box, the code written in Kalam, the join address and the copy buttons. One component, two
// sizes, so the test ids exist exactly once on the page:
//   hero     the LOBBY centrepiece (the host's first job is getting people in)
//   compact  the Room column once the show is running, for latecomers
//   data-testid: host-join-card, host-qr, host-code, host-join-url, host-links (+ copy-join / copy-screen / copy-obs / copy-host)
import { ExternalLink } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { paperCardClass } from "@/components/ui/PaperCard";
import { QrCode } from "@/components/ui/QrCode";
import { shortLink } from "./consoleLogic";
import { CopyButton } from "./controls";

type Props = {
  code: string;
  links: { join: string; screen: string; obs: string; host: string };
  variant: "hero" | "compact";
};

const SCREEN_LINK =
  "scribble inline-flex min-h-11 items-center gap-1.5 text-small text-ink-notes hover:text-ink sm:hidden";

export function JoinCard({ code, links, variant }: Props) {
  const hero = variant === "hero";
  const qr = hero ? 208 : 104;
  return (
    <section
      aria-label="Join this show"
      data-testid="host-join-card"
      className={cn("@container shrink-0", hero && paperCardClass({ tone: "paper-2", className: "p-4 @md:p-6" }))}
    >
      <div className={cn("grid gap-4", hero ? "@md:grid-cols-[auto_minmax(0,1fr)] @md:items-center @md:gap-8" : "grid-cols-[auto_minmax(0,1fr)] items-center")}>
        <div className={cn("shrink-0", hero ? "mx-auto size-[212px]" : "size-[108px]")} data-testid="host-qr">
          <QrCode value={links.join} size={qr} label={`QR code to join show ${code}`} className="size-full" />
        </div>
        <div className={cn("min-w-0", hero && "text-center @md:text-left")}>
          <p className="text-small leading-5 text-ink-notes">{hero ? "Players scan the QR or type this code" : "Join code"}</p>
          <p
            className={cn("font-display leading-[1.05] text-ink", hero ? "mt-2 text-[56px] tracking-[0.12em]" : "text-[32px] tracking-[0.1em]")}
            data-testid="host-code"
            aria-label={`Show code ${code.split("").join(" ")}`}
          >
            {hero ? <InkUnderline seed={`code-${code}`}>{code}</InkUnderline> : code}
          </p>
          <p className={cn("truncate text-small text-ink-notes", hero && "mt-3")} data-testid="host-join-url">
            {shortLink(links.join)}
          </p>
          {!hero ? (
            <a href={links.screen} target="_blank" rel="noopener noreferrer" className={SCREEN_LINK}>
              Open big screen
              <ExternalLink aria-hidden="true" className="size-3.5" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      </div>

      <div className={cn("mt-5 gap-3", hero ? "flex flex-wrap" : "grid grid-cols-1 @xs:grid-cols-2")} data-testid="host-links" role="group" aria-label="Copy links">
        <CopyButton
          value={links.join}
          label="Join link"
          text={hero ? "Copy join link" : undefined}
          testId="copy-join"
          size={hero ? "lg" : "md"}
          variant="key"
          className={hero ? "min-w-[190px] flex-[2_1_190px]" : "@xs:col-span-2"}
        />
        <CopyButton value={links.screen} label="Screen link" title="The big screen for the room" testId="copy-screen" className={hero ? "flex-[1_1_120px]" : undefined} />
        <CopyButton value={links.obs} label="OBS link" title="A transparent big screen to layer over a stream" testId="copy-obs" className={hero ? "flex-[1_1_100px]" : undefined} />
        <CopyButton value={links.host} label="Host link" title="Private: anyone with it can run this show" testId="copy-host" className={hero ? "flex-[1_1_110px]" : "@xs:col-span-2"} />
      </div>

      {hero ? (
        <a href={links.screen} target="_blank" rel="noopener noreferrer" className={cn(SCREEN_LINK, "mt-3")}>
          Open the big screen
          <ExternalLink aria-hidden="true" className="size-3.5" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}
    </section>
  );
}
