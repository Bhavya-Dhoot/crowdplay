// Fails if any server secret value appears in what the browser can download (C4, FR-2).
// Scans .next/static plus prerendered HTML/RSC payloads. verify.sh builds with canary values
// for every secret so this check always has something real to look for.
import fs from "node:fs";
import path from "node:path";

const SECRET_VARS = ["NEXCONN_APP_SECRET", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "SESSION_SECRET", "ADMIN_TOKEN", "NEXCONN_WEBHOOK_SECRET"];
const ALWAYS = ["crowdplay-dev-only-session-secret-not-for-prod"]; // dev fallback secret from config.ts

function envFileValues(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*("?)([^"#\r\n]*)\2/);
      if (m && SECRET_VARS.includes(m[1])) out[`${f}:${m[1]}`] = m[3].trim();
    }
  }
  return out;
}

const needles = new Map<string, string>();
for (const k of SECRET_VARS) {
  const v = process.env[k]?.trim();
  if (v && v.length >= 8) needles.set(v, `env ${k}`);
}
for (const [k, v] of Object.entries(envFileValues())) if (v.length >= 8) needles.set(v, k);
for (const v of ALWAYS) needles.set(v, "dev fallback secret");

const roots = [".next/static", ".next/server/app"];
const exts = new Set([".js", ".css", ".html", ".rsc", ".json", ".txt", ".map"]);
const hits: string[] = [];
let scanned = 0;

function walk(dir: string, clientOnly: boolean) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, clientOnly);
    else if (exts.has(path.extname(e.name))) {
      // In .next/server/app only payloads that are sent to browsers (HTML/RSC) count.
      if (!clientOnly && ![".html", ".rsc"].includes(path.extname(e.name))) continue;
      const body = fs.readFileSync(p, "utf8");
      scanned++;
      for (const [needle, label] of needles) if (body.includes(needle)) hits.push(`${p}: contains ${label}`);
    }
  }
}

if (!fs.existsSync(".next/static")) {
  console.error("check:secrets: .next/static not found — run `pnpm build` first.");
  process.exit(1);
}
walk(roots[0], true);
walk(roots[1], false);

if (hits.length) {
  console.error(`check:secrets: FAIL — ${hits.length} leak(s):\n` + hits.join("\n"));
  process.exit(1);
}
console.log(`check:secrets: OK — ${needles.size} secret value(s) checked across ${scanned} client-visible file(s).`);
