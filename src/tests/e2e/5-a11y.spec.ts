// GOAL E2 and E3: at 360 px nothing scrolls sideways and every control is at least 44 x 44 px; aria-live regions
// announce the phases; with prefers-reduced-motion no confetti is drawn and everything still works.
import type { Page } from "@playwright/test";
import { expect, expectPhase, hostAction, joinAs, layoutAudit, liveRegions, phaseRoot, sendIdea, test } from "./fixtures";

const NARROW = { width: 360, height: 740 };

test("a11y: 360 px layout, 44 px targets and live regions on every page and phase", async ({ newContext, newApi }) => {
  const problems: string[] = [];
  const audit = async (page: Page, label: string): Promise<void> => {
    const a = await layoutAudit(page);
    if (a.overflowPx > 0) problems.push(`${label}: the page is ${a.overflowPx}px wider than the screen; widest: ${a.wide.join(" | ")}`);
    for (const o of a.outside) problems.push(`${label}: ${o} sticks out sideways`);
    for (const s of a.tooSmall) problems.push(`${label}: tap target under 44x44: ${s}`);
  };

  const hostApi = await newApi("Host Harriet");
  const extra = await newApi("Extra Typist");
  const show = await hostApi.createShow({ title: "Narrow Night", stormMs: 40_000, voteMs: 40_000, autoAdvance: false });

  const ctx = await newContext({ viewport: NARROW });
  const page = await ctx.newPage();

  // ---- pages that need no show ----
  for (const path of ["/", "/how-it-works", "/impact", "/try", "/host"]) {
    await page.goto(path);
    await expect(page.locator("main#main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await audit(page, path);
  }

  // ---- the ticket ----
  await page.goto(`/join/${show.code}`);
  await expect(page.getByTestId("join-submit")).toBeVisible();
  await audit(page, `/join/${show.code}`);
  await page.getByTestId("name-input").fill("Wolfeschlegelsteinha"); // 20 letters: the longest name there is
  await page.getByTestId("join-submit").click();
  await page.waitForURL(`**/play/${show.code}`);

  // ---- /play, phase by phase ----
  const big = new Set<string>();
  const live = async (label: string, includes: string): Promise<void> => {
    const regions = await liveRegions(page);
    expect(regions.some((t) => t.includes(includes)), `aria-live announces "${includes}" on ${label}; got ${JSON.stringify(regions)}`).toBe(true);
    big.add(label);
  };
  const play = async (phase: Parameters<typeof expectPhase>[1], announces: string): Promise<void> => {
    await expectPhase(page, phase);
    await audit(page, `/play ${phase}`);
    await live(`/play ${phase}`, announces);
  };

  await play("LOBBY", "Waiting for the host");
  // A second phone types the unbreakable word, so it reaches the first phone's feed like any real idea.
  const typist = await (await newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await joinAs(typist, show.code, "Long Typist");
  await hostAction(show, { action: "start" });
  await play("PROMPT", "A new scene is coming");
  await expectPhase(page, "STORM");
  await sendIdea(page, "Wolfeschlegelsteinhausenbergerdorff flies in from a very long way away");
  const long = "Antidisestablishmentarianismantidisestablishmentarianismantidisestablishmentarianism";
  await expectPhase(typist, "STORM");
  await sendIdea(typist, long);
  // A third voice (over HTTP, so it counts without a bubble) gives the AI three clusters: with two it answers instantly and DISTILL flashes by.
  await extra.join(show.code);
  expect((await extra.idea(show.code, 1, "Disco ball falls into the soup")).status).toBe(200);
  await expect(page.getByTestId("feed-item").filter({ hasText: long })).toBeVisible();
  await hostAction(show, { action: "extend", ms: 30_000 });
  await play("STORM", "Type your ideas now");
  await page.getByTestId("starter-chip").first().click(); // chips insert text and live in a sideways scroller
  await audit(page, "/play STORM with a chip typed");

  await hostAction(show, { action: "endStorm" });
  await play("DISTILL", "Turning the ideas into three choices");
  await play("VOTE", "Pick your favourite");
  await hostAction(show, { action: "extend", ms: 30_000 });
  await page.getByTestId("option-A").click();
  await expect(page.getByTestId("option-A")).toHaveAttribute("data-selected", "1");
  await audit(page, "/play VOTE with a vote cast");

  await hostAction(show, { action: "pause" });
  await expect(page.getByTestId("paused-overlay")).toBeVisible();
  await audit(page, "/play PAUSED");
  await live("/play PAUSED", "The host paused the show");
  await hostAction(show, { action: "resume" });
  await expect(page.getByTestId("paused-overlay")).toBeHidden();

  // The winner is the option that carries the long-named player's idea, so the canon moment shows too.
  const ballot = (await hostApi.state(show.code)).options ?? [];
  const mine = ballot.find((o) => o.credit.some((c) => c.name === "Wolfeschlegelsteinha"));
  expect(mine, "the player's idea is on the ballot").toBeDefined();
  await hostAction(show, { action: "forceWin", optionId: mine?.id ?? "" });
  await expectPhase(page, "REVEAL");
  await expect(page.getByTestId("receipt-moment")).toBeVisible();
  await audit(page, "/play canon moment");
  await expect(page.getByTestId("receipt-moment")).toBeHidden({ timeout: 6000 });
  await expect(page.getByTestId("narration")).toContainText(/\S{3,}/);
  await play("REVEAL", "The crowd has decided");

  await hostAction(show, { action: "endShow" });
  await play("FINALE", "That's the show");
  await expect(page.getByTestId("finale-title")).toBeVisible();

  // ---- the pages a finished show leaves behind ----
  for (const path of ["/me", `/story/${show.showId}`]) {
    await page.goto(path);
    await expect(page.locator("main#main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await audit(page, path);
  }
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

  // ---- /try, live ----
  await page.goto("/try");
  await page.getByTestId("try-start").click();
  await expectPhase(page, "STORM", 30_000);
  await audit(page, "/try STORM");
  await page.getByRole("button", { name: /big screen/i }).click(); // the mini screen opens under the banner on phones
  await expect(page.getByTestId("screen-stage")).toBeVisible();
  await audit(page, "/try STORM with the mini screen open");

  expect(big.size).toBeGreaterThanOrEqual(8);
  expect(problems, `layout and target problems at ${NARROW.width}px`).toEqual([]);
});

test("a11y: the big screen announces phases in an aria-live region", async ({ newContext, newApi }) => {
  const hostApi = await newApi("Host Harriet");
  const show = await hostApi.createShow({ title: "Loud Screen", stormMs: 40_000, voteMs: 40_000, autoAdvance: false });
  const screen = await (await newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await screen.goto(`/screen/${show.code}`);
  const announces = async (text: string): Promise<void> => {
    await expect.poll(async () => (await liveRegions(screen)).some((t) => t.includes(text)), { message: `aria-live says "${text}"` }).toBe(true);
  };
  await expectPhase(screen, "LOBBY");
  await announces("Waiting for the host");
  await hostAction(show, { action: "start" });
  await expectPhase(screen, "STORM");
  await announces("Idea storm");
  await hostAction(show, { action: "pause" });
  await announces("The host paused the show");
  await hostAction(show, { action: "resume" });
});

test("a11y: with prefers-reduced-motion no confetti is drawn and the show still works", async ({ newContext, newApi }) => {
  const hostApi = await newApi("Host Harriet");
  const show = await hostApi.createShow({ title: "Still Life", stormMs: 40_000, voteMs: 40_000, autoAdvance: false });

  const reducedCtx = await newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const normalCtx = await newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  const reducedScreenCtx = await newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  const normalScreenCtx = await newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "no-preference" });
  const [reduced, normal, reducedScreen, normalScreen] = await Promise.all([
    reducedCtx.newPage(),
    normalCtx.newPage(),
    reducedScreenCtx.newPage(),
    normalScreenCtx.newPage(),
  ]);
  expect(await reduced.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await normal.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(false);

  await joinAs(reduced, show.code, "Rae Reduced");
  await joinAs(normal, show.code, "Nico Normal");
  await reducedScreen.goto(`/screen/${show.code}`);
  await normalScreen.goto(`/screen/${show.code}`);

  await hostAction(show, { action: "start" });
  await Promise.all([reduced, normal, reducedScreen, normalScreen].map((p) => expectPhase(p, "STORM")));
  await sendIdea(reduced, "Moonlit heist on a rowing boat");
  await sendIdea(normal, "Vault door turns out to be a cat flap");
  await expect(reducedScreen.getByTestId("screen-rain-item")).toHaveCount(2);
  await hostAction(show, { action: "endStorm" });
  await Promise.all([reduced, normal].map((p) => expectPhase(p, "VOTE")));
  await hostAction(show, { action: "extend", ms: 30_000 });
  await reduced.getByTestId("option-A").click();
  await expect(reduced.getByTestId("option-A")).toHaveAttribute("data-selected", "1");

  // Crown the option that carries the reduced-motion player's idea, so that player gets the canon moment.
  const ballot = (await hostApi.state(show.code)).options ?? [];
  const winner = ballot.find((o) => o.credit.some((c) => c.name === "Rae Reduced"));
  expect(winner).toBeDefined();
  // The big screens sample their confetti canvas for 2 s from the moment REVEAL starts.
  const sample = (p: Page) =>
    p.evaluate(
      () =>
        new Promise<{ canvases: number; paintedMax: number }>((resolve) => {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="screen-confetti"]');
          // Read through a private copy that is allowed to be read often (reading the app's own canvas logs a warning).
          const copy = document.createElement("canvas");
          copy.width = canvas?.width ?? 1;
          copy.height = canvas?.height ?? 1;
          const mine = copy.getContext("2d", { willReadFrequently: true });
          const t0 = performance.now();
          let paintedMax = 0;
          const tick = () => {
            if (canvas && mine) {
              mine.clearRect(0, 0, copy.width, copy.height);
              mine.drawImage(canvas, 0, 0);
              const px = mine.getImageData(0, 0, copy.width, copy.height).data;
              let n = 0;
              for (let i = 3; i < px.length; i += 64) if (px[i] > 0) n += 1;
              paintedMax = Math.max(paintedMax, n);
            }
            if (performance.now() - t0 < 2000) setTimeout(tick, 80);
            else resolve({ canvases: document.querySelectorAll("canvas").length, paintedMax });
          };
          tick();
        }),
    );
  const sampling = Promise.all([sample(reducedScreen), sample(normalScreen)]);
  await hostAction(show, { action: "forceWin", optionId: winner?.id ?? "" });
  await Promise.all([reduced, normal].map((p) => expectPhase(p, "REVEAL")));

  // The reduced-motion phone still gets the gold canon moment (it is a message, not an animation) ...
  await expect(reduced.getByTestId("receipt-moment")).toBeVisible({ timeout: 6000 });
  await expect(reduced.getByTestId("winner")).toBeVisible();
  await expect(reduced.getByTestId("narration")).toContainText(/\S{3,}/);
  const [reducedPixels, normalPixels] = await sampling;
  // ... but nothing is drawn: no canvas on the phone, and the big screen's canvas stays blank.
  expect(await reduced.evaluate(() => ({ canvases: document.querySelectorAll("canvas").length, added: window.__cpCanvasAdded }))).toEqual({ canvases: 0, added: 0 });
  expect(reducedPixels.paintedMax, "reduced motion: confetti pixels on the big screen").toBe(0);
  // The same show for someone without the preference does draw confetti, so the check above can fail.
  expect(await normal.evaluate(() => window.__cpCanvasAdded ?? 0), "normal motion: the phone draws confetti").toBeGreaterThan(0);
  expect(normalPixels.paintedMax, "normal motion: confetti pixels on the big screen").toBeGreaterThan(0);

  // Everything else keeps working: the next round starts and the reduced-motion player can type again.
  await hostAction(show, { action: "next" });
  await expectPhase(reduced, "PROMPT");
  await expectPhase(reduced, "STORM");
  await sendIdea(reduced, "A second idea after the reveal");
  await expect(phaseRoot(reduced)).toHaveAttribute("data-round", "2");
});
