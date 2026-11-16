// GOAL B5: the realtime stream drops for 5 s. The player sees the banner, keeps the right state over HTTP while
// the stream is down, then "Back online" and live updates again.
import { expect, expectPhase, hostAction, joinAs, phaseLog, test } from "./fixtures";

test("reconnect: banner, HTTP poll keeps the phase right, back online, stream resumes", async ({ newContext, newApi }) => {
  const results: Record<string, unknown> = {};
  const hostApi = await newApi("Host Harriet");
  const show = await hostApi.createShow({ title: "Flaky Wi-Fi Night", stormMs: 40_000, voteMs: 40_000, autoAdvance: false });

  const page = await (await newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await joinAs(page, show.code, "Wren Tester");
  await hostAction(show, { action: "start" });
  await expectPhase(page, "STORM");
  await hostAction(show, { action: "extend", ms: 30_000 });
  const banner = page.getByTestId("connection-banner");
  await expect(banner).toHaveCount(0); // connected: nothing to show

  // ---- the stream drops ----
  const droppedAt = Date.now();
  await page.evaluate(() => window.__cpMock?.drop(5000));
  // The host moves the show along while this phone cannot hear it.
  await hostAction(show, { action: "endStorm" });

  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("data-status", "reconnecting");
  await expect(banner).toContainText("Reconnecting…");

  // HTTP polling (every 2 s) carries the new phase while the banner is still up.
  await expectPhase(page, "VOTE", 4500);
  results.pollCaughtUpMs = Date.now() - droppedAt;
  expect(results.pollCaughtUpMs, "the poll found VOTE before the 5 s outage ended").toBeLessThan(5000);
  await expect(banner).toHaveAttribute("data-status", "reconnecting");
  await expect(page.locator('[data-testid^="option-"]')).toHaveCount(3);

  // Votes travel over HTTP, so they work during the outage too.
  await page.getByTestId("option-A").click();
  await expect(page.getByTestId("option-A")).toHaveAttribute("data-selected", "1");
  await expect.poll(async () => (await hostApi.state(show.code)).votesTotal).toBe(1);

  // ---- the stream comes back ----
  await expect(banner).toHaveAttribute("data-status", "online", { timeout: 10_000 });
  await expect(banner).toContainText("Back online");
  results.backOnlineMs = Date.now() - droppedAt;
  await expect(banner).toBeHidden({ timeout: 5000 });

  // ... and live updates flow again: with the stream up there is no polling, so a fast phase change proves it.
  const before = Date.now();
  await hostAction(show, { action: "next" });
  await expectPhase(page, "REVEAL", 3000);
  const revealed = (await phaseLog(page)).find((e) => e.phase === "REVEAL");
  results.resumedUpdateMs = (revealed?.at ?? Infinity) - before;
  expect(results.resumedUpdateMs, "REVEAL reached the phone through the resumed stream").toBeLessThan(1500);
  await expect(page.getByTestId("winner")).toBeVisible();

  console.log("RECONNECT_RESULTS", JSON.stringify(results));
});

test("reconnect: the composer says 'Reconnecting…' while the stream is down", async ({ newContext, newApi }) => {
  const hostApi = await newApi("Host Harriet");
  const show = await hostApi.createShow({ title: "Flaky Wi-Fi Night 2", stormMs: 40_000, voteMs: 40_000, autoAdvance: false });
  const page = await (await newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await joinAs(page, show.code, "Wren Tester");
  await hostAction(show, { action: "start" });
  await expectPhase(page, "STORM");
  await expect(page.getByTestId("idea-input")).toBeEnabled();

  await page.evaluate(() => window.__cpMock?.drop(3000));
  await expect(page.getByTestId("idea-input")).toBeDisabled();
  await expect(page.getByTestId("idea-input")).toHaveAttribute("placeholder", "Reconnecting…");
  // The stream returns by itself and typing opens up again.
  await expect(page.getByTestId("idea-input")).toBeEnabled({ timeout: 10_000 });
});
