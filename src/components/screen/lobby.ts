// Pure helper for the lobby's join tickets (no React). The public state carries a head-count, not a roster,
// so each arrival is a numbered seat: "Admit one, seat 7".

/** Seats shown at once; older seats drop off the end. */
export const TICKET_CAP = 10;

/** Newest first: the last `cap` seat numbers up to the current head-count. */
export function ticketSeats(players: number, cap = TICKET_CAP): number[] {
  const top = Math.max(0, Math.floor(Number.isFinite(players) ? players : 0));
  const out: number[] = [];
  for (let n = top; n > 0 && out.length < Math.max(0, cap); n--) out.push(n);
  return out;
}
