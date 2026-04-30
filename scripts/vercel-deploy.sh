#!/usr/bin/env bash
# Vercel deploy script. Run AFTER `vercel login` (interactive OAuth - one time).
#
# Usage:
#   bash scripts/vercel-deploy.sh
#
# What it does:
#   1. Links the local repo to a Vercel project (creates if needed)
#   2. Pushes env vars (DEMO_REPLAY=1 + the API keys) to production
#   3. Deploys to production
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Link
vercel link --yes

# 2. Env vars (production scope)
# DEMO_REPLAY=1 keeps the demo critical path on cached fixtures even with the
# SDK installed - investigate calls return in <100ms instead of 18s. The keys
# are present so you can flip DEMO_REPLAY=0 in the dashboard for live SDK
# proof on demand.
echo "1" | vercel env add DEMO_REPLAY production --force 2>/dev/null || true

if [ -f .env.local ]; then
  set +e
  CURSOR_KEY=$(grep '^CURSOR_API_KEY=' .env.local | cut -d= -f2)
  SPECTER_KEY=$(grep '^SPECTER_API_KEY=' .env.local | cut -d= -f2)
  set -e
  if [ -n "${CURSOR_KEY:-}" ]; then
    echo "$CURSOR_KEY" | vercel env add CURSOR_API_KEY production --force 2>/dev/null || true
  fi
  if [ -n "${SPECTER_KEY:-}" ]; then
    echo "$SPECTER_KEY" | vercel env add SPECTER_API_KEY production --force 2>/dev/null || true
  fi
fi

# 3. Deploy production
vercel --prod --yes
