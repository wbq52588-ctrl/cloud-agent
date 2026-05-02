#!/bin/sh
set -e
# Ensure the data directory (bind-mounted from host) is writable by appuser.
chown appuser:appuser /app/data 2>/dev/null || true
# Run the app as the non-root appuser.
exec su -s /bin/sh appuser -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"
