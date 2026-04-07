#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required to deploy the Cloudflare Worker." >&2
  exit 1
fi

echo "Deploying Cloudflare Worker from $(pwd)"
npx wrangler deploy
