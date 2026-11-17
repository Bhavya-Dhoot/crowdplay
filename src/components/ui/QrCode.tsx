// QrCode: the qrcode library's module matrix drawn as one inline SVG path (no innerHTML, works on
// server and client, scales crisply), sitting in a drawn box: ink outline, hand-drawn radius, grey marker shadow.
//   <QrCode value="https://…/join/ABCDE" size={160} label="Join ABCDE" />
// Defaults to ink modules on near-white paper with a 2-module quiet zone, which scanners need (15:1); pass
// light="transparent" only over a surface that is already light. The frame takes 2.5 px of the size (border-box).
import { create } from "qrcode";
import { cn } from "./cn";

type Props = { value: string; size?: number; label?: string; dark?: string; light?: string; quietZone?: number; className?: string };

export function QrCode({ value, size = 160, label = "QR code", dark = "#1E1E22", light = "#FFFEFA", quietZone = 2, className }: Props) {
  const { size: n, data } = create(value, { errorCorrectionLevel: "M" }).modules;
  let d = "";
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!data[y * n + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < n && data[y * n + x]) x++;
      d += `M${start + quietZone} ${y + quietZone}h${x - start}v1h-${x - start}z`;
    }
  }
  const total = n + quietZone * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn("rounded-element border-[2.5px] border-ink shadow-slip", className)}
    >
      <rect width={total} height={total} fill={light} />
      <path d={d} fill={dark} />
    </svg>
  );
}
