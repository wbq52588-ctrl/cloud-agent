"""Centralized logging configuration with request correlation IDs."""

from __future__ import annotations

import logging
import sys
import uuid
from contextvars import ContextVar

# Context variable shared across the request lifecycle.
correlation_id: ContextVar[str] = ContextVar("correlation_id", default="")


def setup_logging(level: int = logging.INFO) -> None:
    """Configure structured JSON-line logging to stdout."""
    root = logging.getLogger()
    root.setLevel(level)

    # Remove any existing handlers to avoid duplicates on reload.
    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    formatter = logging.Formatter(
        '{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s",'
        '"correlation_id":"%(correlation_id)s","message":%(message)s}',
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    handler.setFormatter(formatter)

    class CorrelationFilter(logging.Filter):
        def filter(self, record):
            record.correlation_id = correlation_id.get() or ""
            return True

    handler.addFilter(CorrelationFilter())
    root.addHandler(handler)

    # Silence noisy libraries.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def new_correlation_id() -> str:
    """Generate a short correlation ID for a request."""
    return uuid.uuid4().hex[:12]
