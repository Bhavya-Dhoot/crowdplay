import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors";

export const HOST_KEY_HEADER = "x-host-key";

export function hashHostKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function hostKeyMatches(key: string | null | undefined, storedHash: string): boolean {
  if (!key) return false;
  const a = Buffer.from(hashHostKey(key), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Throws 403 unless the request carries the room's host key. */
export function requireHostKey(req: Request, room: { hostKeyHash: string }): void {
  if (!hostKeyMatches(req.headers.get(HOST_KEY_HEADER), room.hostKeyHash)) {
    throw new AppError("BAD_HOST_KEY", "This host link is not valid.", 403);
  }
}
