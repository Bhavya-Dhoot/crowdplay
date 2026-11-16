import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { readSessionUserId, signSession } from "@/lib/auth/session";
import { hashHostKey, hostKeyMatches } from "@/lib/auth/hostKey";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await useTestDb());
});
afterAll(() => close());

describe("db + auth", () => {
  it("migrates and round-trips a user", async () => {
    await db.insert(schema.users).values({ id: "u_test", displayName: "Brave Otter" });
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, "u_test"));
    expect(u?.displayName).toBe("Brave Otter");
  });

  it("session JWT round-trips via cookie and header", async () => {
    const token = await signSession("u_test");
    const viaCookie = new Request("http://x", { headers: { cookie: `a=b; cp_session=${token}` } });
    const viaHeader = new Request("http://x", { headers: { "x-cp-session": token } });
    expect(await readSessionUserId(viaCookie)).toBe("u_test");
    expect(await readSessionUserId(viaHeader)).toBe("u_test");
    expect(await readSessionUserId(new Request("http://x", { headers: { "x-cp-session": token + "x" } }))).toBeNull();
  });

  it("host key hash compares in constant time", () => {
    const h = hashHostKey("k".repeat(32));
    expect(hostKeyMatches("k".repeat(32), h)).toBe(true);
    expect(hostKeyMatches("j".repeat(32), h)).toBe(false);
    expect(hostKeyMatches(null, h)).toBe(false);
  });
});
