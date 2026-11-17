// GOAL E1: full-viewport screenshots of every screen and state, at 390x844 (phone) and 1440x900 (desktop), saved to
// docs/screens/<page>[-<phase>]-<w>x<h>.png. They come from a real show played by real (test-typed) ideas: nothing is
// stubbed, and every shot is only kept if the page was still in the phase it is named after when the shutter closed.
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { Phase } from "@/lib/realtime/types";
import { expect, expectPhase, hostAction, joinAs, phaseRoot, sendIdea, test } from "./fixtures";

const OUT = path.resolve("docs", "screens");
const SIZES = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;
type Size = (typeof SIZES)[number];
const tag = (s: Size) => `${s.width}x${s.height}`;
const [PHONE, DESKTOP] = SIZES;

const taken: string[] = [];

/** Screenshot of the viewport. With `phase`, the page must be in it before and still in it after the shot. */
async function snap(page: Page, name: string, size: Size, phase?: Phase): Promise<void> {
  const file = path.join(OUT, `${name}-${tag(size)}.png`);
  if (phase) await expectPhase(page, phase, 5000);
  await page.screenshot({ path: file });
  if (phase) await expect(phaseRoot(page), `${name} was captured in ${phase}`).toHaveAttribute("data-phase", phase, { timeout: 250 });
  taken.push(file);
}

const IDEAS = {
  ada: ["A mime pickpockets the security guard", "The mime pickpockets another guard"],
  bo: ["The getaway van is actually an ice cream truck", "Ice cream truck jingle gives away the getaway"],
  cy: ["A very polite pigeon steals the blueprint", "Lights out and someone starts a conga line"],
} as const;

test("screens: every page and phase at 390x844 and 1440x900", async ({ newContext, newApi }) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });

  const hostApi = await newApi("Host Harriet");
  const show = await hostApi.createShow({
    title: "The Midnight Diamond Job",
    stormMs: 40_000,
    voteMs: 40_000,
    autoAdvance: false,
    roundsTotal: 3,
  });
  const host = (action: Parameters<typeof hostAction>[1]) => hostAction(show, action);

  // ---- pages that need no show ----
  for (const size of SIZES) {
    const fresh = await (await newContext({ viewport: size })).newPage();
    await fresh.goto("/");
    await expect(fresh.getByRole("heading", { level: 1 })).toBeVisible();
    await snap(fresh, "landing", size);
    await fresh.goto("/how-it-works");
    await expect(fresh.getByRole("heading", { level: 1 })).toBeVisible();
    await fresh.waitForLoadState("networkidle");
    await snap(fresh, "how-it-works", size);
    await fresh.goto("/try");
    await expect(fresh.getByTestId("try-start")).toBeVisible();
    await snap(fresh, "try", size);
  }

  // ---- the cast ----
  const cy = await (await newContext({ viewport: PHONE })).newPage();
  await joinAs(cy, show.code, "Cy Heron");
  for (const size of SIZES) {
    const guest = await (await newContext({ viewport: size })).newPage();
    await guest.goto(`/join/${show.code}`);
    await expect(guest.getByTestId("join-submit")).toBeVisible();
    await expect(guest.getByTestId("join-players")).toContainText("1 player in");
    await snap(guest, "join", size);
  }
  const ada = await (await newContext({ viewport: PHONE })).newPage();
  const bo = await (await newContext({ viewport: DESKTOP })).newPage();
  await joinAs(ada, show.code, "Ada Otter");
  await joinAs(bo, show.code, "Bo Falcon");
  const players: Record<number, Page> = { [PHONE.width]: ada, [DESKTOP.width]: bo };
  const screens: Record<number, Page> = {};
  const hosts: Record<number, Page> = {};
  for (const size of SIZES) {
    screens[size.width] = await (await newContext({ viewport: size })).newPage();
    await screens[size.width].goto(`/screen/${show.code}`);
    hosts[size.width] = await (await newContext({ viewport: size })).newPage();
    await hosts[size.width].goto(`/host/${show.code}?k=${encodeURIComponent(show.hostKey)}`);
  }
  const everyone = [ada, bo, cy, ...Object.values(screens), ...Object.values(hosts)];
  const eachSize = async (fn: (size: Size) => Promise<void>) => void (await Promise.all(SIZES.map(fn)));

  // ---- LOBBY ----
  await Promise.all(everyone.map((p) => expectPhase(p, "LOBBY")));
  await expect(ada.getByTestId("player-count")).toContainText("3");
  for (const size of SIZES) await expect(hosts[size.width].getByTestId("host-qr")).toBeVisible();
  await expect(screens[PHONE.width].getByTestId("screen-qr").first()).toBeVisible();
  await eachSize(async (size) => {
    await snap(players[size.width], "play-lobby", size, "LOBBY");
    await snap(screens[size.width], "screen-lobby", size, "LOBBY");
    await snap(hosts[size.width], "host-lobby", size, "LOBBY");
  });

  // ---- PROMPT (1.8 s long: wait for the scene card to land, then shoot every page at once) ----
  await host({ action: "start" });
  await Promise.all(everyone.map((p) => expectPhase(p, "PROMPT")));
  // The question fades in last (about 0.8 s after the card); poll tightly so the shots still fit into the 1.8 s of PROMPT.
  await expect
    .poll(async () => Number(await ada.getByText("What happens next?").evaluate((el) => getComputedStyle(el).opacity)), { intervals: [40] })
    .toBe(1);
  await Promise.all(
    SIZES.flatMap((size) => [snap(players[size.width], "play-prompt", size, "PROMPT"), snap(screens[size.width], "screen-prompt", size, "PROMPT")]),
  );

  // ---- STORM ----
  await Promise.all(everyone.map((p) => expectPhase(p, "STORM")));
  await host({ action: "extend", ms: 30_000 });
  await Promise.all([sendIdea(ada, IDEAS.ada[0]), sendIdea(bo, IDEAS.bo[0]), sendIdea(cy, IDEAS.cy[0])]);
  await Promise.all([sendIdea(ada, IDEAS.ada[1]), sendIdea(bo, IDEAS.bo[1]), sendIdea(cy, IDEAS.cy[1])]);
  await expect(screens[DESKTOP.width].getByTestId("screen-rain-item")).toHaveCount(6);
  await expect(ada.getByTestId("feed-item")).toHaveCount(6);
  await expect(hosts[DESKTOP.width].getByTestId("host-idea")).toHaveCount(6);
  await eachSize(async (size) => {
    await snap(players[size.width], "play-storm", size, "STORM");
    await snap(screens[size.width], "screen-storm", size, "STORM");
    await snap(hosts[size.width], "host-storm", size, "STORM");
  });

  // ---- DISTILL (about 3 s: every page is shot at the same moment) ----
  await host({ action: "endStorm" });
  await Promise.all(everyone.map((p) => expectPhase(p, "DISTILL")));
  await Promise.all(
    SIZES.flatMap((size) => [snap(players[size.width], "play-distill", size, "DISTILL"), snap(screens[size.width], "screen-distill", size, "DISTILL")]),
  );

  // ---- VOTE ----
  await Promise.all(everyone.map((p) => expectPhase(p, "VOTE")));
  await host({ action: "extend", ms: 30_000 });
  const ballot = (await hostApi.state(show.code)).options ?? [];
  expect(ballot).toHaveLength(3);
  const adas = ballot.find((o) => o.credit.some((c) => c.name === "Ada Otter"));
  expect(adas, "Ada's two mime ideas make the biggest cluster, so they are on the ballot").toBeDefined();
  const other = ballot.find((o) => o.slot !== adas?.slot);
  await ada.getByTestId(`option-${adas?.slot}`).click();
  await cy.getByTestId(`option-${adas?.slot}`).click();
  await bo.getByTestId(`option-${other?.slot}`).click();
  await expect(ada.getByTestId("votes-total")).toContainText("3 votes");
  await expect(hosts[DESKTOP.width].getByTestId(`host-option-${adas?.slot}`)).toContainText("2 votes");
  await eachSize(async (size) => {
    await snap(players[size.width], "play-vote", size, "VOTE");
    await snap(screens[size.width], "screen-vote", size, "VOTE");
    await snap(hosts[size.width], "host-vote", size, "VOTE");
    await snap(hosts[size.width], "host", size, "VOTE"); // the console shot the write-up uses
  });

  // ---- REVEAL: Ada's idea wins 2 to 1, she gets the canon moment, then the gold toast ----
  await host({ action: "next" });
  await Promise.all(everyone.map((p) => expectPhase(p, "REVEAL")));
  await expect(ada.getByTestId("receipt-moment")).toBeVisible({ timeout: 6000 });
  await expect(ada.getByTestId("receipt-moment")).toBeHidden({ timeout: 6000 });
  for (const p of [ada, bo]) {
    const narration = p.getByTestId("winner").getByTestId("narration");
    await expect(narration).toContainText(/\S{3,}/);
    // The typewriter overlay has caught up with the full text (the first span holds all of it, invisibly).
    const full = ((await narration.locator("span").first().textContent()) ?? "").trim();
    await expect(narration.locator('[aria-hidden="true"]')).toHaveText(full);
  }
  const reveal = screens[DESKTOP.width];
  await expect(reveal.getByTestId("screen-outcome")).toBeVisible();
  // Narration lines fade in one by one on the big screen: shoot when the last one is fully in.
  for (const size of SIZES) {
    await expect(screens[size.width].getByTestId("screen-outcome").getByTestId("narration").locator("p").last()).toHaveCSS("opacity", "1");
  }
  await eachSize(async (size) => {
    await snap(players[size.width], "play-reveal", size, "REVEAL");
    await snap(screens[size.width], "screen-reveal", size, "REVEAL");
  });

  // ---- FINALE ----
  await host({ action: "endShow" });
  await Promise.all(everyone.map((p) => expectPhase(p, "FINALE")));
  await expect(ada.getByTestId("finale-recap")).toBeVisible({ timeout: 15_000 });
  await expect(screens[DESKTOP.width].getByTestId("screen-recap")).toBeVisible({ timeout: 15_000 });
  await eachSize(async (size) => {
    await snap(players[size.width], "play-finale", size, "FINALE");
    await snap(screens[size.width], "screen-finale", size, "FINALE");
  });

  // ---- what the show leaves behind ----
  const after: Record<number, Page> = {};
  for (const size of SIZES) after[size.width] = await players[size.width].context().newPage();
  await eachSize(async (size) => {
    const page = after[size.width];
    await page.setViewportSize(size);
    await page.goto("/me");
    await expect(page.getByTestId("receipt").first()).toBeVisible();
    await snap(page, "me", size);
    await page.goto(`/story/${show.showId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await snap(page, "story", size);
    await page.goto("/impact");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await snap(page, "impact", size);
  });

  // ---- /try live: a demo room a few seconds into its first storm ----
  for (const size of SIZES) {
    const demo = await (await newContext({ viewport: size })).newPage();
    await demo.goto("/try");
    await demo.getByTestId("name-input").fill("Judge Jules");
    await demo.getByTestId("try-start").click();
    await expectPhase(demo, "STORM", 30_000);
    await expect(demo.getByTestId("feed-item").first()).toBeVisible();
    await expect.poll(() => demo.getByTestId("feed-item").count()).toBeGreaterThanOrEqual(6);
    await snap(demo, "try-live", size, "STORM");
  }

  // ---- every expected file is there and is a real picture ----
  const expected = [
    ...["landing", "join", "how-it-works", "try", "try-live", "me", "story", "impact"],
    ...["play-lobby", "play-prompt", "play-storm", "play-distill", "play-vote", "play-reveal", "play-finale"],
    ...["screen-lobby", "screen-prompt", "screen-storm", "screen-distill", "screen-vote", "screen-reveal", "screen-finale"],
    ...["host", "host-lobby", "host-storm", "host-vote"],
  ].flatMap((n) => SIZES.map((s) => path.join(OUT, `${n}-${tag(s)}.png`)));
  for (const f of expected) {
    expect(existsSync(f), `${path.basename(f)} exists`).toBe(true);
    expect(statSync(f).size, `${path.basename(f)} is not blank`).toBeGreaterThan(8_000);
  }
  expect(new Set(taken).size).toBe(expected.length);
  console.log("SCREENSHOTS", expected.length);
});
