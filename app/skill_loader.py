from __future__ import annotations

from functools import lru_cache

from app.schemas import ChatMessage
from app.text_utils import matches_any_keyword, recent_text


SKILL_KEYWORDS = (
    "afc",
    "stats",
    "afc-stats",
    "看板",
    "班组",
    "工分",
    "积分",
    "排名",
    "考勤",
    "周报",
    "检修",
    "张朋",
    "workload",
    "attendance",
    "weekly",
    "部署",
    "pm2",
    "/opt/afc-stats",
)

SKILL_SUMMARY = """Installed skill summary:
- Skill name: afc-stats-project
- Use for: AFC stats dashboard changes, debugging, score rules, attendance import, workload audit, weekly reports, and VPS deployment.
- Local project path: /opt/afc-stats (container) / C:\\Users\\AFC检修六工班\\Desktop\\afc-stats (local dev)
- Production app directory: /opt/afc-stats
- Production PM2 process: afc-stats
- Frontend: plain HTML/CSS/vanilla JavaScript ES modules.
- Backend: Node.js + Express.
- Remote data source: https://afcops.819521.xyz

IMPORTANT: You CANNOT execute bash commands, read files, or access the local filesystem. You are a chat-only model without tool access. When the user asks about code, rules, or data, analyze from the provided external API context (afcstats.552588.xyz) and the knowledge already in the conversation. DO NOT output <bash> tags or try to run commands — they will appear as raw text to the user and cause confusion. Instead, explain what you know from the available context and tell the user clearly if you need them to check something on the server.
"""


@lru_cache(maxsize=1)
def load_skill_context() -> str | None:
    return (
        "You have one local project skill installed. Treat it as optional background context, "
        "not as the user's active task unless the user explicitly asks about AFC, stats, kanban, "
        "score rules, attendance, weekly reports, workload, deployment, or this installed skill. "
        "For unrelated chat, ignore it. Do not redirect ordinary questions into this project.\n\n"
        f"{SKILL_SUMMARY}"
    )


def should_apply_skill(system_prompt: str | None, messages: list[ChatMessage]) -> bool:
    text = recent_text(system_prompt, messages)
    return matches_any_keyword(text, SKILL_KEYWORDS)


def build_system_prompt_with_skills(
    system_prompt: str | None,
    messages: list[ChatMessage],
) -> str | None:
    if not should_apply_skill(system_prompt, messages):
        return system_prompt

    skill_context = load_skill_context()
    if not skill_context:
        return system_prompt
    if not system_prompt:
        return skill_context
    return f"{skill_context}\n\n---\n\nUser-provided system prompt:\n\n{system_prompt}"
