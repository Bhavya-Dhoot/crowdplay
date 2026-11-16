import { and, eq, isNull } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { env, sessionSecret } from "../config";
import { getDb, schema } from "../db/client";
import { AppError } from "../errors";

export const SESSION_COOKIE = "cp_session";
export const SESSION_HEADER = "x-cp-session"; // fallback when cookies are blocked (token kept in localStorage)
const MAX_AGE_S = 60 * 60 * 24 * 30;

export type SessionUser = { id: string; displayName: string; isBot: boolean };

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(sessionSecret());
}

export function sessionCookie(token: string): string {
  const secure = env().APP_URL.startsWith("https://") ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** userId from cookie or x-cp-session header, or null. Never throws. */
export async function readSessionUserId(req: Request): Promise<string | null> {
  const token = readCookie(req, SESSION_COOKIE) ?? req.headers.get(SESSION_HEADER);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function optionalUser(req: Request): Promise<SessionUser | null> {
  const id = await readSessionUserId(req);
  if (!id) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName, isBot: schema.users.isBot })
    .from(schema.users)
    .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function requireUser(req: Request): Promise<SessionUser> {
  const u = await optionalUser(req);
  if (!u) throw new AppError("NO_SESSION", "Pick a name first.", 401);
  return u;
}
