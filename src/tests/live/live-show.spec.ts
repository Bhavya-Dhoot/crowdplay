// Live check for the submission (`pnpm live:check`): one full round over the real Nexconn transport with two
// headless phones and the big screen, against a production build that uses the developer's .env (Nexconn + AI).
// It records what it measured in docs/live-results/ instead of asserting on provider-dependent numbers.
// LIVE_DRY_RUN=1 runs the same spec against the mock server to check the spec itself without credentials.
import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

const DRY = process.env.LIVE_DRY_RUN === "1";
// Against a deployed app (E2E_BASE_URL) the show is paused after the reveal instead of ended, and every test user
// deletes their data afterwards (afterEach), so the public /impact numbers stay real (a finished show counts as completed).
const REMOTE = !!process.env.E2E_BASE_URL;
const testUsers: APIRequestContext[] = [];

// Runs even when an assertion failed; retries because a dropped connection must not leave test users behind.
test.afterEach(async () => {
  if (!REMOTE) return;
  for (const r of testUsers.splice(0)) {
    for (let i = 0; i < 4; i++) {
      const res = await r.delete("/api/session").catch(() => null);
      if (res && (res.ok() || res.status() === 401)) break; // 401: already gone
      await new Promise((done) => setTimeout(done, 2_000));
    }
  }
});

async function phone(browser: Browser, name: string, code: string, problems: string[]): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`${name}: ${e.message}`));
  await page.goto(`/join/${code}`);
  await page.getByTestId("name-input").fill(name);
  await page.getByTestId("join-submit").click();
  await page.waitForURL(`**/play/${code}`);
  testUsers.push(ctx.request);
  return page;
}

const phaseOf = (page: Page) => page.getByTestId("phase").first();
const waitPhase = (page: Page, phase: string, timeout = 30_000) => expect(phaseOf(page)).toHaveAttribute("data-phase", phase, { timeout });

/** ms from now until `text` is visible on `page` (null if it never shows within the timeout). */
async function msUntilVisible(page: Page, text: string, started: number, timeout = 10_000): Promise<number | null> {
  try {
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible({ timeout });
    return Date.now() - started;
  } catch {
    return null;
  }
}

test("live: one full round over Nexconn with two phones and the big screen", async ({ browser, request }) => {
  test.setTimeout(300_000);
  const problems: string[] = [];
  const health = await (await request.get("/api/health")).json();
  if (!DRY) expect(health.realtimeMode, "the server must run REALTIME_MODE=nexconn").toBe("nexconn");

  // Host through the API (the console itself is covered by the mock e2e suite).
  const host = (await browser.newContext()).request;
  expect((await host.post("/api/session", { data: { displayName: "Live Host" } })).ok()).toBe(true);
  testUsers.push(host);
  const created = await (
    await host.post("/api/rooms", {
      data: {
        title: "Live check",
        preset: "heist",
        premise: "A crew of misfits robs the moon bank at midnight, and everything goes wrong at once.",
        roundsTotal: 3,
        stormMs: 40_000,
        voteMs: 15_000,
        autoAdvance: true,
        strictFilter: true,
      },
    })
  ).json();
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const { code, hostKey, showId } = created as { code: string; hostKey: string; showId: string };
  // QR codes and share links are built from APP_URL (RENDER_EXTERNAL_URL on Render): they must name the public host.
  if (REMOTE) expect(created.links?.join, "join link uses the deployed URL").toContain(new URL(process.env.E2E_BASE_URL as string).host);
  const act = (action: string) => host.post(`/api/rooms/${code}/host`, { headers: { "x-host-key": hostKey }, data: { action } });

  const screen = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  screen.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(`screen: ${m.text()}`));
  await screen.goto(`/screen/${code}`);
  const ada = await phone(browser, "Ada Live", code, problems);
  const bo = await phone(browser, "Bo Live", code, problems);
  await waitPhase(ada, "LOBBY");
  await waitPhase(bo, "LOBBY");

  expect((await act("start")).ok()).toBe(true);
  await waitPhase(ada, "STORM", 30_000);
  await waitPhase(bo, "STORM", 30_000);

  // Ideas typed on one phone must reach the other phone and the screen through the transport.
  const ideas = [
    { from: ada, to: bo, text: "The vault door opens onto a glittering ballroom" },
    { from: bo, to: ada, text: "A security guard starts singing opera at full volume" },
    { from: ada, to: bo, text: "The getaway driver is secretly a talking parrot" },
    { from: bo, to: ada, text: "Every alarm in the bank starts playing jazz" },
    { from: ada, to: bo, text: "A tunnel collapses and floods the vault with marbles" },
    { from: bo, to: ada, text: "The bank manager turns out to be the crew's grandmother" },
  ];
  const storm = (await (await host.get(`/api/rooms/${code}/state`)).json()).state as { phaseEndsAt: number };
  const latency: { toPhone: number | null; toScreen: number | null }[] = [];
  for (const i of ideas) {
    await i.from.getByTestId("idea-input").fill(i.text);
    const t0 = Date.now();
    await i.from.getByTestId("idea-send").click();
    const [toPhone, toScreen] = await Promise.all([msUntilVisible(i.to, i.text, t0), msUntilVisible(screen, i.text, t0)]);
    latency.push({ toPhone, toScreen });
    await ada.waitForTimeout(2_200); // per-player rate limit is 1 idea / 2 s
  }

  // DISTILL runs the live AI chain; VOTE must follow on its own.
  await waitPhase(ada, "VOTE", 60_000);
  const optionsVisibleMs = Date.now() - storm.phaseEndsAt; // server and browsers share this machine's clock
  for (const slot of ["A", "B", "C"]) await expect(ada.getByTestId(`option-${slot}`)).toBeVisible();
  const ballotToast = (await msUntilVisible(ada, "on the ballot", Date.now(), 8_000)) !== null || (await msUntilVisible(bo, "on the ballot", Date.now(), 2_000)) !== null;
  await ada.getByTestId("option-A").click();
  await bo.getByTestId("option-B").click();

  await waitPhase(ada, "REVEAL", 60_000);
  const revealAt = Date.now();
  await expect(ada.getByTestId("narration")).toBeVisible({ timeout: 20_000 });
  const narrationVisibleMs = Date.now() - revealAt;

  const feed = await (await host.get(`/api/rooms/${code}/host/feed`, { headers: { "x-host-key": hostKey } })).json();
  const meA = await (await ada.context().request.get("/api/me")).json();
  const meB = await (await bo.context().request.get("/api/me")).json();

  type StoryBody = { show?: { storyTitle: string | null; recap: string | null; tagline: string | null } };
  let story: StoryBody = {};
  if (REMOTE) {
    expect((await act("pause")).ok()).toBe(true);
  } else {
    expect((await act("endShow")).ok()).toBe(true);
    await waitPhase(ada, "FINALE", 30_000);
  }
  // The finale recap is written in the background; give it the narrator's time budget.
  for (let i = 0; !REMOTE && i < 30 && !story.show?.recap; i++) {
    story = (await (await request.get(`/api/story/${showId}`)).json()) as StoryBody;
    if (!story.show?.recap) await ada.waitForTimeout(500);
  }

  const results = {
    at: new Date().toISOString(),
    dryRun: DRY,
    server: health,
    target: REMOTE ? process.env.E2E_BASE_URL : "local build",
    roomCode: code,
    ideaLatencyMs: latency,
    stormEndToOptionsMs: optionsVisibleMs,
    distill: { ms: feed.metrics?.distillMs ?? null, provider: feed.metrics?.distillProvider ?? null, fallbackUsed: feed.metrics?.fallbackUsed ?? null },
    narrationVisibleAfterRevealMs: narrationVisibleMs,
    ballotToastSeenOnAPhone: ballotToast,
    receiptsOnMe: { ada: meA.receipts?.length ?? 0, bo: meB.receipts?.length ?? 0 },
    finale: { storyTitle: story.show?.storyTitle ?? null, recapChars: story.show?.recap?.length ?? 0, tagline: story.show?.tagline ?? null },
    consoleProblems: problems,
  };
  console.log("LIVE_RESULTS " + JSON.stringify(results));
  const dir = path.join(process.cwd(), "docs", "live-results");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${DRY ? "dry-run" : "live"}-${results.at.replace(/[:.]/g, "-")}.json`), JSON.stringify(results, null, 2));

  // Hard requirements: ideas crossed the transport and every phase was reached.
  for (const l of latency) expect(l.toPhone, "idea reached the other phone").not.toBeNull();
  expect(meA.receipts.length + meB.receipts.length, "BALLOT receipts were issued").toBeGreaterThan(0);
});
