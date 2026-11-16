// Small formatters shared by the depth pages (server-safe, no locale surprises: dates are UTC).
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false });
const NUMBER = new Intl.NumberFormat("en-US");

export const formatDate = (ms: number): string => DATE.format(new Date(ms));
export const formatTimeUtc = (ms: number): string => `${TIME.format(new Date(ms))} UTC`;
export const formatCount = (n: number): string => NUMBER.format(n);

/** 2400 -> "2.4 s", 640 -> "0.6 s". */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** 0.0833 -> "8%", 0.004 -> "<1%", 0 -> "0%". */
export function formatPercent(fraction: number): string {
  if (fraction <= 0) return "0%";
  const pct = fraction * 100;
  return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}
