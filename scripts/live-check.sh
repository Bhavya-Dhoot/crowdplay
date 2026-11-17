#!/usr/bin/env bash
# Live checks for the submission. Needs .env with the Nexconn credentials (and AI keys for live AI).
#   1. pnpm smoke:nexconn           server-side U1-U10 checks; appends results to docs/NEXCONN_FINDINGS.md
#   2. realtime contract (server)   the adapter against the shared RealtimeServer contract
#   3. build into .next-live        with the .env modes (REALTIME_MODE=nexconn, LLM_MODE=live)
#   4. live show                    two headless phones + the big screen, one full round; results in docs/live-results/
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "live: .env not found (copy .env.example and fill the Nexconn lines)"; exit 2; }
set -a; . ./.env; set +a

echo "== 1/4 smoke:nexconn"; pnpm smoke:nexconn
echo "== 2/4 realtime contract (nexconn)"; REALTIME_CONTRACT=nexconn pnpm exec vitest run src/tests/integration/realtime-contract.test.ts
echo "== 3/4 build (.next-live)"; NEXT_DIST_DIR=.next-live pnpm build
echo "== 4/4 live show"; E2E_LIVE=1 pnpm exec playwright test
echo "live: all checks passed"
