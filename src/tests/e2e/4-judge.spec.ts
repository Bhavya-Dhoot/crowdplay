// GOAL D1-D3: /try from a fresh browser plays three rounds against 30 labelled bots with no host action, the
// judge's idea reaches the ballot boosted and earns a receipt, and neither bots nor the demo room reach /impact.
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, expectPhase, inOrder, phaseLog, phaseRoot, sendIdea, test } from "./fixtures";

const JUDGE = "Judge Jules";
const BOT_BADGE = "Simulated player (demo room)";
// Words no bot says, so each idea is a cluster of its own (and may be boosted into the wildcard slot).
const IDEAS = ["A trombone quartet storms the ceiling vents", "Giant origami crane lands on the roof", "Pickled onion sommelier demands a tasting"];

type Impact = {
  totals: { realPeople: number; showsCompleted: number; ideas: number; canonMakers: number };
  sessions: { showId: string; title: string }[];
  generatedAt: number;
};

/** RFC 4180-ish parser, enough for the admin export. */
function parseCsv(text: string): Record<string, string>[] {
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
    } else if (c === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

test("judge: /try plays three rounds alone, boosts the judge's idea, labels every bot, stays out of /impact", async ({ newContext, newApi }) => {
  const results: Record<string, unknown> = {};
  const ctx = await newContext({ viewport: { width: 1440, height: 900 } });
  const page: Page = await ctx.newPage();

  await page.goto("/try");
  await expect(page.getByTestId("try-banner")).toContainText("30 🤖 simulated players");
  await page.getByTestId("name-input").fill(JUDGE);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/try") && r.request().method() === "POST");
  await page.getByTestId("try-start").click();
  const tryRes = await (await created).json();
  // D1: the judge gets a room code and nothing else: no host key, so nobody can steer the show.
  expect(Object.keys(tryRes).sort()).toEqual(["code", "ok", "showId"]);
  const { code, showId } = tryRes as { code: string; showId: string };
  await expect(page.getByTestId("try-banner")).toContainText("30 🤖 simulated players"); // still there in the live view

  // ---- three rounds, the judge only types and votes ----
  for (const [i, idea] of IDEAS.entries()) {
    const round = i + 1;
    await expectPhase(page, "STORM", 30_000);
    await expect(phaseRoot(page)).toHaveAttribute("data-round", String(round));
    await sendIdea(page, idea);
    await expect(page.getByTestId("feed-item").filter({ hasText: idea })).toHaveAttribute("data-mine", "1");

    if (round === 1) {
      // D3: the other players are bots and every one of them wears the badge: in the phone feed and on the big screen.
      await expect(page.getByTestId("feed-item").filter({ hasNot: page.locator('[data-mine="1"]') }).first()).toBeVisible();
      const others = page.locator('[data-testid="feed-item"]:not([data-mine="1"])');
      await expect.poll(() => others.count()).toBeGreaterThanOrEqual(3);
      // Counted in one synchronous pass: ideas keep arriving while the test runs.
      const counts = await page.evaluate((label) => {
        const items = [...document.querySelectorAll('[data-testid="feed-item"]:not([data-mine="1"])')];
        return { total: items.length, badged: items.filter((i) => i.querySelector(`[role="img"][aria-label="${label}"]`)).length };
      }, BOT_BADGE);
      expect(counts.total).toBeGreaterThanOrEqual(3);
      expect(counts.badged, "every non-judge feed item carries the bot badge").toBe(counts.total);
      await expect(page.getByTestId("screen-rain-item").first().getByRole("img", { name: BOT_BADGE })).toBeVisible();
    }

    await expectPhase(page, "VOTE", 30_000);
    // D2: the judge's idea made the ballot as the boosted wildcard, with the "yours" mark and a receipt.
    await expect(page.locator('[data-testid^="option-"]')).toHaveCount(3);
    const wild = page.getByTestId("option-C");
    await expect(wild).toContainText("Wildcard");
    await expect(wild).toContainText("boosted in demo");
    await expect(wild).toHaveAttribute("data-mine", "1");
    await expect(page.locator(".toast-receipt").filter({ hasText: "Your idea is on the ballot" }).filter({ hasText: idea })).toBeVisible();
    await wild.click();
    await expect(wild).toHaveAttribute("data-selected", "1");

    await expectPhase(page, "REVEAL", 30_000);
    await expect(page.getByTestId("winner")).toBeVisible();
    await expect(page.getByTestId("winner").getByTestId("narration")).toContainText(/\S{3,}/);
    const credit = (await page.getByTestId("credits").textContent()) ?? "";
    expect(credit, `credit line of round ${round}`).toContain("@");
  }

  // ---- the end card, after FINALE ----
  await expectPhase(page, "FINALE", 30_000);
  await expect(page.getByTestId("try-endcard")).toBeVisible();
  await expect(page.getByTestId("try-endcard").getByRole("link", { name: "Host a show" })).toHaveAttribute("href", "/host");
  mkdirSync(path.resolve("docs", "screens"), { recursive: true });
  await page.screenshot({ path: path.resolve("docs", "screens", "try-end-1440x900.png") }); // the end card, E1
  const doneAt = Date.now();

  // D1: all three rounds ran off the clock alone.
  const sequence = (await phaseLog(page)).map((e) => `${e.phase}${e.round}`);
  const round = ["PROMPT", "STORM", "DISTILL", "VOTE", "REVEAL"];
  expect(inOrder(sequence, [1, 2, 3].flatMap((r) => round.map((p) => `${p}${r}`)).concat(["FINALE3"])), sequence.join(" ")).toBe(true);

  // D2: three ballot receipts (and any canon) are listed on /me.
  const me = await ctx.newPage();
  await me.goto("/me");
  await expect(me.getByTestId("receipt").and(me.locator('[data-type="BALLOT"]'))).toHaveCount(3);
  for (const idea of IDEAS) await expect(me.getByTestId("receipt").filter({ hasText: idea }).first()).toBeVisible();
  await me.close();

  // D3: the demo's story names bots with the badge.
  const info = await page.request.get(`/api/rooms/${code}`);
  expect((await info.json()).room).toMatchObject({ isDemo: true, showId });
  const story = await ctx.newPage();
  await story.goto(`/story/${showId}`);
  await expect(story.getByRole("img", { name: BOT_BADGE }).first()).toBeVisible();
  await story.close();

  // ---- D3: /api/impact counts neither the bots nor the demo room ----
  // /api/impact is cached for 60 s: wait for a computation that happened after the demo ended.
  const impactApi = await newApi("Impact Ivy");
  let impact: Impact = (await impactApi.get<Impact>("/api/impact")).body;
  await expect
    .poll(
      async () => {
        impact = (await impactApi.get<Impact>("/api/impact")).body;
        return impact.generatedAt >= doneAt;
      },
      { timeout: 70_000, intervals: [1000] },
    )
    .toBe(true);
  const res = await impactApi.req.get("/api/admin/export?token=e2e-admin-token");
  expect(res.status()).toBe(200);
  const rows = parseCsv(await res.text());
  const demo = rows.find((r) => r.showId === showId);
  expect(demo, "the demo show is in the admin export").toBeDefined();
  expect(demo).toMatchObject({ kind: "demo", realPeople: "1", roundsRevealed: "3" });
  expect(Number(demo?.botPlayers), "bots that played").toBeGreaterThanOrEqual(20);
  expect(Number(demo?.botIdeas), "bot ideas").toBeGreaterThanOrEqual(60);

  const live = rows.filter((r) => r.kind === "live");
  const liveIdeas = live.reduce((n, r) => n + Number(r.realIdeas), 0);
  const liveCompleted = live.filter((r) => ["finale", "ended"].includes(r.status) && Number(r.roundsRevealed) >= 1 && Number(r.realPeople) >= 1).length;
  // The numbers on /impact tie out to the live shows alone: not one bot idea and not the judge's.
  expect(impact.totals.ideas, "ideas on /impact = ideas of live shows").toBe(liveIdeas);
  expect(impact.totals.showsCompleted, "completed shows on /impact = completed live shows").toBe(liveCompleted);
  expect(impact.sessions.map((s) => s.showId)).not.toContain(showId);
  expect(impact.sessions.map((s) => s.showId).sort()).toEqual(live.filter((r) => Number(r.realPeople) >= 1).map((r) => r.showId).sort());
  expect(impact.totals.ideas).toBeLessThan(Number(demo?.botIdeas) + liveIdeas); // with the bots it would be larger

  results.demo = { botPlayers: demo?.botPlayers, botIdeas: demo?.botIdeas };
  results.impact = impact.totals;
  console.log("JUDGE_RESULTS", JSON.stringify(results));
});
