#!/usr/bin/env bash
# The goal gate (docs/GOAL.md). Runs with no external credentials (mock modes).
set -euo pipefail
cd "$(dirname "$0")/.."
export REALTIME_MODE=mock LLM_MODE=mock
unset ANTHROPIC_API_KEY OPENAI_API_KEY NEXCONN_APP_SECRET || true

pnpm typecheck
pnpm lint
pnpm test

# Build with canary secret values so check:secrets proves none of them reach client bundles (C4).
CANARIES=(
  NEXCONN_APP_SECRET=cp-canary-nexconn-app-secret-7f3a
  ANTHROPIC_API_KEY=cp-canary-anthropic-key-91bd
  OPENAI_API_KEY=cp-canary-openai-key-4c2e
  SESSION_SECRET=cp-canary-session-secret-000000000000000
  ADMIN_TOKEN=cp-canary-admin-token-5e8d
)
env "${CANARIES[@]}" REALTIME_MODE=mock LLM_MODE=mock pnpm build
env "${CANARIES[@]}" pnpm check:secrets

REALTIME_MODE=mock LLM_MODE=mock pnpm e2e
echo "verify: all gates passed"
