import { customAlphabet } from "nanoid";

// Room codes: 5 uppercase letters, no ambiguous O/I (FR-3). Letters only, so no 0/1 either.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;

const alnum = "0123456789abcdefghijklmnopqrstuvwxyz";
const code = customAlphabet(ROOM_CODE_ALPHABET, 5);
const id16 = customAlphabet(alnum, 16);
const key32 = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 32);

export const newRoomCode = (): string => code();
export const newUserId = (): string => `u_${id16()}`;
export const newId = (prefix: string): string => `${prefix}_${id16()}`;
export const newHostKey = (): string => key32();

/** Normalise user input ("abc de" -> "ABCDE"); returns null if not a valid code. */
export function normalizeRoomCode(input: string): string | null {
  const c = input.replace(/[^a-z]/gi, "").toUpperCase();
  return ROOM_CODE_RE.test(c) ? c : null;
}
