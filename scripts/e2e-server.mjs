// Starts the production build for the Playwright suite (playwright.config.ts runs this as its webServer).
// Default: mock realtime + mock LLM, a fresh database, and short phase timers. It never builds: `pnpm verify`
// builds once and the suite then tests exactly that build.
// --live (`pnpm live:check`): the .next-live build with the real .env modes and keys (Nexconn + live AI),
// a fresh database in .data/live and real phase timers.
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const live = process.argv.includes("--live");
const port = process.env.E2E_PORT || "3100";
const distDir = live ? ".next-live" : ".next";
const dataDir = path.join(root, ".data", live ? "live" : "e2e");

if (!existsSync(path.join(root, distDir, "BUILD_ID"))) {
  console.error(
    live
      ? "live: no build in .next-live. Run `pnpm live:check` (it builds with your .env first)."
      : "e2e: no production build found in .next. Run `pnpm build` first (`pnpm verify` does this for you).",
  );
  process.exit(1);
}
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextBin)) {
  console.error("e2e: next is not installed. Run `pnpm install` first.");
  process.exit(1);
}

rmSync(dataDir, { recursive: true, force: true });

// No credentials, whatever the developer's shell or .env holds. An empty string counts as unset in config.ts and
// stops Next from filling the variable in from a .env file.
const NO_CREDENTIALS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_FAST_MODEL",
  "NEXCONN_APP_KEY",
  "NEXCONN_APP_SECRET",
  "NEXCONN_PRIMARY_API_DOMAIN",
  "NEXCONN_SECONDARY_API_DOMAIN",
  "NEXCONN_WEBHOOK_SECRET",
  "NEXT_PUBLIC_NEXCONN_AREA",
  "DATABASE_URL",
  "FEATURE_TTS",
  "FEATURE_MULTILINGUAL",
];

// Live: keep the developer's .env (Next loads it at start) and only pin what must differ per run.
const liveEnv = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_DIST_DIR: distDir,
  PGLITE_DIR: ".data/live",
  APP_URL: `http://localhost:${port}`,
  PORT: port,
};

const mockEnv = {
  ...process.env,
  ...Object.fromEntries(NO_CREDENTIALS.map((k) => [k, ""])),
  NODE_ENV: "production",
  REALTIME_MODE: "mock",
  LLM_MODE: "mock",
  INGEST_MODE: "dual",
  ALLOW_MOCK_IN_PROD: "1",
  FEATURE_CHEERS: "1",
  TIMING_SCALE: "0.3",
  MOCK_DISTILL_DELAY_MS: "3000",
  DISTILL_HARD_CAP_MS: "20000", // scaled to 6 s: keeps the 3 s mock DISTILL clear of the cap tick
  PGLITE_DIR: ".data/e2e",
  // E2E_DATABASE_URL=postgres://... runs the suite on a real Postgres instead (use an empty database).
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
  APP_URL: `http://localhost:${port}`,
  SESSION_SECRET: "e2e-session-secret-0123456789-abcdefghij",
  ADMIN_TOKEN: "e2e-admin-token",
  LOG_LEVEL: "warn",
  PORT: port,
};

const env = live ? liveEnv : mockEnv;
const child = spawn(process.execPath, [nextBin, "start", "-p", port], { cwd: root, env, stdio: "inherit" });

const stop = () => child.kill();
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.on("exit", stop);
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
