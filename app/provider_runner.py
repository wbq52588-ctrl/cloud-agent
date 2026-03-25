from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from app.config import Settings


async def run_with_retry(
    operation: Callable[[], Awaitable[tuple[str, str]]],
    settings: Settings,
) -> tuple[str, str]:
    last_error: Exception | None = None

    for attempt in range(settings.provider_max_retries + 1):
        try:
            return await asyncio.wait_for(
                operation(),
                timeout=settings.provider_timeout_seconds,
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt >= settings.provider_max_retries:
                break
            await asyncio.sleep(1.2)

    if last_error is None:
        raise RuntimeError("Unknown provider error")
    raise last_error
