#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

vercel link --yes

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

vercel --prod --yes
