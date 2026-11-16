import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GET as exportGet } from "@/app/api/admin/export/route";
import { resetConfig } from "@/lib/config";
import { useTestDb, type Db } from "@/lib/db/client";
import { ADMIN_COLUMNS, adminAccess } from "@/lib/metrics";
import { idea, playedRound, show, user, vote } from "./depth-fixtures";

let db: Db;
let close: () => Promise<void>;
const TOKEN = "correct-horse-battery-staple-token";

const call = (query = "") => exportGet(new Request(`http://localhost/api/admin/export${query}`));
type Err = { ok: false; code: string; message: string };

function setToken(value: string | undefined): void {
  if (value === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = value;
  resetConfig();
}

/** Minimal RFC 4180 reader: enough to prove the file round-trips through a real CSV parser. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

beforeAll(async () => {
  ({ db, close } = await useTestDb());
  const ann = await user(db, "Ann");
  const bot = await user(db, "Pixel Pancake", { bot: true });

  const weird = await show(db, { title: 'Say "hi", friend\nsecond line', status: "ended" });
  const p = await playedRound(db, weird, 1, { winnerUsers: [ann] });
  await vote(db, p.roundId, ann, p.winnerId);

  const formula = await show(db, { title: "=HYPERLINK(\"http://x\")", status: "ended" });
  await playedRound(db, formula, 1, { winnerUsers: [ann] });

  const demo = await show(db, { title: "Demo: Space", demo: true, status: "ended" });
  const pd = await playedRound(db, demo, 1, { winnerUsers: [bot] });
  await idea(db, pd.roundId, bot, "second bot idea");
});
afterAll(async () => {
  setToken(undefined);
  await close();
});
afterEach(() => setToken(undefined));

describe("adminAccess", () => {
  it("is disabled without ADMIN_TOKEN, whatever is supplied", () => {
    setToken(undefined);
    expect(adminAccess(TOKEN)).toBe("disabled");
    expect(adminAccess(null)).toBe("disabled");
  });
  it("needs the exact token", () => {
    setToken(TOKEN);
    expect(adminAccess(TOKEN)).toBe("ok");
    expect(adminAccess(null)).toBe("denied");
    expect(adminAccess("")).toBe("denied");
    expect(adminAccess(`${TOKEN}x`)).toBe("denied");
    expect(adminAccess(TOKEN.slice(0, -1))).toBe("denied");
    expect(adminAccess("a")).toBe("denied");
  });
});

describe("GET /api/admin/export", () => {
  it("says admin is off, in plain words, when ADMIN_TOKEN is unset", async () => {
    setToken(undefined);
    const res = await call(`?token=${TOKEN}`);
    expect(res.status).toBe(403);
    const body = (await res.json()) as Err;
    expect(body.code).toBe("ADMIN_DISABLED");
    expect(body.message).toMatch(/ADMIN_TOKEN/);
  });

  it("answers a friendly 403 for a missing or wrong token", async () => {
    setToken(TOKEN);
    for (const q of ["", "?token=", "?token=nope", `?token=${TOKEN}x`]) {
      const res = await call(q);
      expect(res.status).toBe(403);
      const body = (await res.json()) as Err;
      expect(body.code).toBe("ADMIN_FORBIDDEN");
      expect(body.message).toMatch(/token/i);
      expect(body.message).not.toContain(TOKEN);
    }
  });

  it("serves a CSV attachment for the right token and never caches it", async () => {
    setToken(TOKEN);
    const res = await call(`?token=${encodeURIComponent(TOKEN)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="crowdplay-sessions-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("escapes the file properly and labels demo rooms", async () => {
    setToken(TOKEN);
    const text = await (await call(`?token=${TOKEN}`)).text();
    expect(text.endsWith("\r\n")).toBe(true);
    const rows = parseCsv(text);
    expect(rows[0]).toEqual([...ADMIN_COLUMNS]);
    expect(rows).toHaveLength(4); // header + three shows: a quoted multi-line title does not add a row
    const col = (name: (typeof ADMIN_COLUMNS)[number]) => ADMIN_COLUMNS.indexOf(name);
    const byTitle = (title: string) => rows.find((r) => r[col("title")] === title);

    const weird = byTitle('Say "hi", friend\nsecond line');
    expect(weird).toBeDefined();
    expect(weird?.[col("kind")]).toBe("live");
    expect(weird?.[col("realPeople")]).toBe("1");
    expect(weird?.[col("realVotes")]).toBe("1");
    expect(weird?.[col("roundsRevealed")]).toBe("1");

    // A title that starts with "=" is defused so a spreadsheet will not run it.
    expect(byTitle(`'=HYPERLINK("http://x")`)).toBeDefined();

    const demo = byTitle("Demo: Space");
    expect(demo?.[col("kind")]).toBe("demo");
    expect(demo?.[col("realPeople")]).toBe("0");
    expect(demo?.[col("botPlayers")]).toBe("1");
    expect(demo?.[col("botIdeas")]).toBe("2");
    expect(demo?.[col("realIdeas")]).toBe("0");
  });
});
