#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-codex/render-deploy}"

cd "$(dirname "$0")/.."

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

mkdir -p data
docker compose up -d --build
docker compose ps
