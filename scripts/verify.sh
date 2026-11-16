#!/usr/bin/env bash
# The goal gate (docs/GOAL.md). Runs with no external credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
export REALTIME_MODE=mock LLM_MODE=mock
unset NEXCONN_APP_SECRET ANTHROPIC_API_KEY OPENAI_API_KEY || true
pnpm typecheck
pnpm lint
pnpm test
REALTIME_MODE=mock LLM_MODE=mock pnpm build
pnpm check:secrets
REALTIME_MODE=mock LLM_MODE=mock pnpm e2e
echo "verify: all gates passed"
