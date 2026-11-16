// GOAL A2 (a host creates a show; the QR and the join / screen / OBS links work) and F4 (OBS overlay mode).
import { expect, expectPhase, test } from "./fixtures";

test("host wizard creates a show whose QR and three links work, incl. the OBS overlay", async ({ newContext }) => {
  const ctx = await newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const host = await ctx.newPage();
  await host.goto("/host");
  await host.getByTestId("wizard-title").fill("Links Night");
  await host.getByTestId("preset-heist").click();
  await host.getByTestId("wizard-create").click();
  await host.waitForURL(/\/host\/[A-Z]{5}\?k=/, { timeout: 20_000 });
  const code = new URL(host.url()).pathname.split("/").pop()!;
  await expectPhase(host, "LOBBY");

  // QR on the console encodes the join link.
  await expect(host.getByRole("img", { name: new RegExp(`QR code to join show ${code}`) })).toBeVisible();

  const copied: Record<string, string> = {};
  for (const which of ["join", "screen", "obs"] as const) {
    await host.getByTestId(`copy-${which}`).click();
    copied[which] = await host.evaluate(() => navigator.clipboard.readText());
  }
  expect(copied.join).toMatch(new RegExp(`/join/${code}$`));
  expect(copied.screen).toMatch(new RegExp(`/screen/${code}$`));
  expect(copied.obs).toMatch(new RegExp(`/screen/${code}\\?obs=1$`));

  // Join link: a phone lands on the ticket for this show.
  const phone = await (await newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await phone.goto(new URL(copied.join).pathname);
  await expect(phone.getByText("Links Night").first()).toBeVisible();
  await expect(phone.getByRole("button", { name: /i'm in/i })).toBeVisible();

  // Screen link: the big screen with its QR.
  const screen = await (await newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await screen.goto(new URL(copied.screen).pathname);
  await expectPhase(screen, "LOBBY");
  await expect(screen.getByTestId("screen-qr").first()).toBeVisible();

  // OBS link: transparent page, no QR unless &qr=1.
  const obs = await (await newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const u = new URL(copied.obs);
  await obs.goto(u.pathname + u.search);
  await expectPhase(obs, "LOBBY");
  const bg = await obs.evaluate(() => [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor]);
  expect(bg).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
  await expect(obs.getByTestId("screen-qr")).toHaveCount(0);
  await obs.screenshot({ path: "docs/screens/screen-obs-1920x1080.png", omitBackground: true });

  await obs.goto(`${u.pathname}?obs=1&qr=1`);
  await expectPhase(obs, "LOBBY");
  await expect(obs.getByTestId("screen-qr").first()).toBeVisible();
});
