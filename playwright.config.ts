import { spawnSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// `pnpm e2e` tests the production build (`pnpm build` first; `pnpm verify` does). scripts/e2e-server.mjs starts it
// in mock modes on a fresh database. Port 3100, or the next free one when something else already holds 3100.
// 3200 is the Lighthouse server and is never in range.
const FIRST_PORT = 3100;
const LAST_PORT = 3199;

/** True when something accepts connections on the port (checked on both loopback families). */
function inUse(port: number): boolean {
  const probe = `
    const net = require("net");
    const dial = (host) => new Promise((resolve) => {
      const s = net.connect({ port: ${port}, host });
      s.once("connect", () => { s.destroy(); resolve(true); });
      s.once("error", () => resolve(false));
      setTimeout(() => { s.destroy(); resolve(false); }, 700);
    });
    Promise.all([dial("127.0.0.1"), dial("::1")]).then(([a, b]) => process.exit(a || b ? 1 : 0));
  `;
  return spawnSync(process.execPath, ["-e", probe]).status !== 0;
}

// Resolved once in the runner; the workers inherit E2E_PORT, so they do not probe again.
if (!process.env.E2E_PORT) {
  let port = FIRST_PORT;
  while (port <= LAST_PORT && inUse(port)) port += 1;
  if (port > LAST_PORT) throw new Error(`e2e: no free port between ${FIRST_PORT} and ${LAST_PORT}`);
  process.env.E2E_PORT = String(port);
}
const PORT = Number(process.env.E2E_PORT);
// E2E_BASE_URL=https://... runs against an already deployed app (no local server); used with E2E_LIVE=1.
const REMOTE = process.env.E2E_BASE_URL?.replace(/\/+$/, "");
const baseURL = REMOTE || `http://localhost:${PORT}`;

// E2E_LIVE=1 (`pnpm live:check`): the live spec against the .next-live build with the real .env (Nexconn + AI).
// LIVE_DRY_RUN=1 runs that spec against the mock e2e server to check the spec itself without credentials.
const LIVE = process.env.E2E_LIVE === "1";
const serverCmd = LIVE && process.env.LIVE_DRY_RUN !== "1" ? "node scripts/e2e-server.mjs --live" : "node scripts/e2e-server.mjs";

export default defineConfig({
  testDir: LIVE ? "src/tests/live" : "src/tests/e2e",
  testMatch: /.*\.spec\.ts/,
  // One shared server and one database: specs run in order, one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: REMOTE ? undefined : {
    command: serverCmd,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { E2E_PORT: String(PORT) },
  },
});
