from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
import logging

from openai import (
    APIError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    PermissionDeniedError,
    RateLimitError,
)

from app.config import Settings

logger = logging.getLogger(__name__)

# Errors that should NOT be retried — they represent client/configuration issues.
_NON_RETRYABLE = (
    AuthenticationError,
    BadRequestError,
    PermissionDeniedError,
    ValueError,
    TypeError,
)


def _is_retryable(exc: Exception) -> bool:
    """Returns True if this error may succeed on a subsequent attempt."""
    if isinstance(exc, asyncio.CancelledError):
        return False  # Always propagate cancellation immediately.
    if isinstance(exc, _NON_RETRYABLE):
        return False
    if isinstance(exc, RateLimitError):
        return True  # 429s should retry with backoff.
    if isinstance(exc, (APIError, APITimeoutError)):
        return True
    return True  # Network-level errors (ConnectionError, etc.) are retryable.


async def run_with_retry(
    operation: Callable[[], Awaitable[tuple[str, str, str]]],
    settings: Settings,
) -> tuple[str, str, str]:
    last_error: Exception | None = None
    max_attempts = settings.provider_max_retries + 1

    for attempt in range(max_attempts):
        try:
            return await asyncio.wait_for(
                operation(),
                timeout=settings.provider_timeout_seconds,
            )
        except asyncio.CancelledError:
            raise  # Never swallow cancellation.
        except Exception as exc:
            last_error = exc
            if not _is_retryable(exc):
                logger.warning(
                    "Provider call failed with non-retryable error: %s",
                    repr(exc),
                )
                raise

            if attempt >= max_attempts - 1:
                break

            # Exponential backoff: 1.2s → 2.4s → 4.8s → 9.6s → cap at 10s.
            delay = min(1.2 * (2 ** attempt), 10.0)
            logger.info(
                "Provider call attempt %d/%d failed, retrying in %.1fs: %s",
                attempt + 1,
                max_attempts,
                delay,
                repr(exc),
            )
            await asyncio.sleep(delay)

    if last_error is None:
        raise RuntimeError("Unknown provider error")
    raise last_error
