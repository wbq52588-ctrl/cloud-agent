#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:18000/health}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-45}"
RECREATE_FLAG="${RECREATE_FLAG:---force-recreate}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCK_BIN="/usr/local/bin/cloud-agent-lock"
UNLOCK_BIN="/usr/local/bin/cloud-agent-unlock"

cleanup() {
  if [ -x "$LOCK_BIN" ]; then
    "$LOCK_BIN" >/dev/null || true
  fi
}
trap cleanup EXIT

if [ -x "$UNLOCK_BIN" ]; then
  "$UNLOCK_BIN" >/dev/null
fi

cd "$PROJECT_DIR"

git fetch origin "$BRANCH"
git checkout "$BRANCH"

REMOTE_REF="refs/remotes/origin/$BRANCH"
if git show-ref --verify --quiet "$REMOTE_REF"; then
  if git merge-base --is-ancestor HEAD "origin/$BRANCH"; then
    git pull --ff-only origin "$BRANCH"
  elif git merge-base --is-ancestor "origin/$BRANCH" HEAD; then
    echo "Keeping local commits because branch is ahead of origin/$BRANCH" >&2
  else
    echo "Local branch diverged from origin/$BRANCH; refusing release without ALLOW_DIVERGED_RELEASE=1" >&2
    if [ "${ALLOW_DIVERGED_RELEASE:-0}" != "1" ]; then
      exit 3
    fi
  fi
fi

mkdir -p data
docker compose up -d --build "$RECREATE_FLAG"

deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
until curl -fsS "$HEALTH_URL" >/tmp/cloud-agent-release-health.json 2>/tmp/cloud-agent-release-health.err; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "Health check failed for $HEALTH_URL" >&2
    cat /tmp/cloud-agent-release-health.err >&2 || true
    docker compose ps >&2 || true
    docker logs --tail 120 cloud-agent >&2 || true
    exit 4
  fi
  sleep 2
done

docker compose ps
cat /tmp/cloud-agent-release-health.json