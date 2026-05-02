"""Shared text utilities for keyword-based context injection."""

from __future__ import annotations

from app.schemas import ChatMessage


def recent_text(system_prompt: str | None, messages: list[ChatMessage], *, n: int = 4) -> str:
    """Build a single lowercased string from the system prompt and last *n* messages."""
    return " ".join(
        [
            system_prompt or "",
            *(message.content for message in messages[-n:]),
        ]
    ).lower()


def matches_any_keyword(text: str, keywords: tuple[str, ...]) -> bool:
    """Return True if any keyword (case-insensitive) appears in *text*."""
    lowered = text.lower()
    return any(keyword.lower() in lowered for keyword in keywords)
