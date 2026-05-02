"""Simple in-memory rate limiter for API endpoints that trigger paid LLM calls."""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Callable

from fastapi import Header, HTTPException, Request


class RateLimiter:
    """Per-user sliding-window rate limiter."""

    def __init__(self, max_requests: int = 20, window_seconds: float = 60.0) -> None:
        self._max_requests = max_requests
        self._window = window_seconds
        self._buckets: dict[str, list[float]] = defaultdict(list)

    def _prune(self, key: str, now: float) -> None:
        cutoff = now - self._window
        self._buckets[key] = [t for t in self._buckets[key] if t >= cutoff]
        if not self._buckets[key]:
            del self._buckets[key]

    def is_allowed(self, key: str) -> bool:
        now = time.monotonic()
        self._prune(key, now)
        return len(self._buckets[key]) < self._max_requests

    def record(self, key: str) -> None:
        now = time.monotonic()
        self._prune(key, now)
        self._buckets[key].append(now)


# Default instance shared across requests
_chat_limiter = RateLimiter(max_requests=20, window_seconds=60.0)


def make_rate_limit_dependency(
    limiter: RateLimiter | None = None,
) -> Callable:
    if limiter is None:
        limiter = _chat_limiter

    async def check_rate_limit(
        request: Request,
        x_wecom_userid: str | None = Header(default=None),
    ) -> None:
        user_key = (x_wecom_userid or "default").strip()
        client_ip = request.client.host if request.client else "unknown"
        key = f"{user_key}:{client_ip}"

        if not limiter.is_allowed(key):
            raise HTTPException(
                status_code=429,
                detail="请求过于频繁，请稍后再试",
            )
        limiter.record(key)

    return check_rate_limit
