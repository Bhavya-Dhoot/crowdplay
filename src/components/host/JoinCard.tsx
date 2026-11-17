"use client";
// How people get in: the QR, the code, the join address and the copy buttons. One component, two sizes, so the
// test ids exist exactly once on the page:
//   hero     the LOBBY centrepiece (the host's first job is getting people in)
//   compact  the Room column once the show is running, for latecomers
//   data-testid: host-join-card, host-qr, host-code, host-join-url, host-links (+ copy-join / copy-screen / copy-obs / copy-host)
import { ExternalLink } from "lucide-react";
import { QrCode } from "@/components/ui/QrCode";
import { cn } from "@/components/ui/cn";
import { shortLink } from "./consoleLogic";
import { CopyButton } from "./controls";

type Props = {
  code: string;
  links: { join: string; screen: string; obs: string; host: string };
  variant: "hero" | "compact";
};

export function JoinCard({ code, links, variant }: Props) {
  const hero = variant === "hero";
  const qr = hero ? 208 : 112;
  return (
    <section
      aria-label="Join this show"
      data-testid="host-join-card"
      className={cn("@container shrink-0", hero ? "rounded-card border border-stage-line bg-stage-2 p-4 @md:p-5" : "")}
    >
      <div className={cn("grid gap-4", hero ? "@md:grid-cols-[auto_minmax(0,1fr)] @md:items-center @md:gap-6" : "grid-cols-[auto_minmax(0,1fr)] items-center")}>
        <div
          className={cn("shrink-0 rounded-element bg-[#FBF7EE] p-1.5", hero ? "mx-auto size-[220px] @md:size-[232px]" : "size-[124px]")}
          data-testid="host-qr"
        >
          <QrCode value={links.join} size={qr} label={`QR code to join show ${code}`} className="size-full" />
        </div>
        <div className={cn("min-w-0", hero && "text-center @md:text-left")}>
          <p className="text-small leading-5 text-muted-on-stage">{hero ? "Players scan the QR or type this code" : "Join code"}</p>
          <p
            className={cn("font-display leading-[1.05] font-extrabold text-on-stage", hero ? "mt-1 text-[56px] tracking-[0.12em]" : "text-[32px] tracking-[0.1em]")}
            data-testid="host-code"
            aria-label={`Show code ${code.split("").join(" ")}`}
          >
            {code}
          </p>
          <p className={cn("truncate text-fine text-muted-on-stage", hero && "mt-1")} data-testid="host-join-url">
            {shortLink(links.join)}
          </p>
          {!hero ? (
            <a
              href={links.screen}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-small font-semibold text-on-stage underline decoration-stage-line underline-offset-4 hover:decoration-on-stage sm:hidden"
            >
              Open big screen
              <ExternalLink aria-hidden="true" className="size-3.5" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      </div>

      <div className={cn("mt-4 gap-2", hero ? "flex flex-wrap" : "grid grid-cols-2")} data-testid="host-links" role="group" aria-label="Copy links">
        <CopyButton
          value={links.join}
          label="Join link"
          text={hero ? "Copy join link" : undefined}
          testId="copy-join"
          size={hero ? "lg" : "md"}
          tone="paper"
          className={hero ? "min-w-[190px] flex-[2_1_190px]" : "col-span-2"}
        />
        <CopyButton value={links.screen} label="Screen link" title="The big screen for the room" testId="copy-screen" className={hero ? "flex-[1_1_120px]" : undefined} />
        <CopyButton value={links.obs} label="OBS link" title="A transparent big screen to layer over a stream" testId="copy-obs" className={hero ? "flex-[1_1_100px]" : undefined} />
        <CopyButton value={links.host} label="Host link" title="Private: anyone with it can run this show" testId="copy-host" className={hero ? "flex-[1_1_110px]" : "col-span-2"} />
      </div>

      {hero ? (
        <a
          href={links.screen}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-small font-semibold text-on-stage underline decoration-stage-line underline-offset-4 hover:decoration-on-stage sm:hidden"
        >
          Open the big screen
          <ExternalLink aria-hidden="true" className="size-3.5" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}
    </section>
  );
}
