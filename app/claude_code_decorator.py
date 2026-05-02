from __future__ import annotations

from app.schemas import ChatMessage
from app.text_utils import matches_any_keyword, recent_text


CLAUDE_CODE_DECORATOR = """Claude Code style API decorator:
- Act like a senior coding agent working inside the user's project, but do not claim to be Anthropic Claude or Claude Code.
- Be concise, practical, and implementation-oriented.
- For API/data questions, answer from provided live context first. State the concrete endpoint or data source only when useful.
- Do not invent API results. If live context is unavailable, say what is missing and what endpoint should be checked.
- Do not claim that data was written, deployed, deleted, or submitted unless the backend actually performed that action.
- For coding or deployment tasks, prefer concrete file paths, commands, and verification results.
- For ordinary chat, keep the answer natural and do not force project context.
"""


CODE_STYLE_KEYWORDS = (
    "api",
    "接口",
    "代码",
    "项目",
    "部署",
    "服务",
    "后端",
    "前端",
    "报错",
    "日志",
    "修复",
    "claudecode",
    "claude code",
)


def should_apply_claude_code_decorator(
    system_prompt: str | None,
    messages: list[ChatMessage],
) -> bool:
    text = recent_text(system_prompt, messages)
    return matches_any_keyword(text, CODE_STYLE_KEYWORDS)


def apply_claude_code_decorator(
    system_prompt: str | None,
    messages: list[ChatMessage],
    *,
    force: bool = False,
) -> str | None:
    if not force and not should_apply_claude_code_decorator(system_prompt, messages):
        return system_prompt
    if not system_prompt:
        return CLAUDE_CODE_DECORATOR
    return f"{CLAUDE_CODE_DECORATOR}\n\n---\n\n{system_prompt}"
