#!/bin/sh
set -e

# Generate a cache-busting version from git hash (or timestamp fallback).
CACHE_VER=$(cd /app && git rev-parse --short HEAD 2>/dev/null || date +%s)
echo "Cache version: $CACHE_VER"

# Inject version into static asset references in index.html.
sed -i "s/?v=BUILD_VERSION/?v=$CACHE_VER/g" /app/public/index.html

# Ensure the data directory (bind-mounted from host) is writable by appuser.
chown appuser:appuser /app/data 2>/dev/null || true
# Run the app as the non-root appuser.
exec su -s /bin/sh appuser -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"
