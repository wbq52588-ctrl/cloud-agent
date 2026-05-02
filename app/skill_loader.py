from __future__ import annotations

from functools import lru_cache

from app.schemas import ChatMessage
from app.text_utils import matches_any_keyword, recent_text


# ---- afc-stats-project skill ----

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


# ---- afc-ops-mcp skill ----

AFC_OPS_KEYWORDS = (
    "待办",
    "故障",
    "物料",
    "库存",
    "站点",
    "车站",
    "上报",
    "修复",
    "检修记录",
    "检修计划",
    "工单",
    "派发",
    "指派",
    "维护",
    "设备",
    "BOM",
    "闸机",
    "TVM",
    "AGM",
    "afc-ops",
    "mcp",
    "运维",
)

AFC_OPS_SKILL_CONTEXT = """You have access to the AFC OPS MCP (Model Context Protocol) tools via function calling. These tools connect to the AFC 运维管理系统 (AFC Operations Management System).

## Available MCP Tools
You can call these tools as functions to interact with the AFC system:

**查询类 (Read-only):**
- afc_list_todos — 查询待办任务列表
- afc_get_todo_details — 查看待办任务详细子项
- afc_list_faults — 查询故障列表
- afc_get_fault_details — 查看故障详情
- afc_list_maintenance — 查询检修计划/记录
- afc_get_maintenance_details — 查看检修记录详情
- afc_list_materials — 查询物料库存
- afc_list_stations — 查询站点列表（用于匹配站点名称）
- afc_search_users — 搜索用户（用于匹配人员姓名）

**操作类 (Write):**
- afc_create_todo — 创建普通待办任务
- afc_complete_todo_item — 完成待办子项
- afc_report_fault — 上报新故障
- afc_fix_fault — 标记故障已修复
- afc_complete_maintenance — 完成检修记录
- afc_add_material_stock — 增加物料库存

## 核心规则
1. 所有工具调用必须带 actor_wecom_userid，该值来自会话上下文（x_wecom_userid header）
2. 不要自己编造业务结果，必须通过工具获取真实数据
3. 创建待办前必须确认 scope_type（station/personnel）和目标对象
4. 处理重名人员/站点时先查询匹配，不要盲猜
5. 查询结果先说结论，再列关键项
6. 写操作成功说"已创建/已完成"，失败转述后端返回的错误原因
7. 如果当前会话没有 actor_wecom_userid（企业微信身份），不要调用工具，直接说明无法鉴权
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


@lru_cache(maxsize=1)
def load_afc_ops_context() -> str | None:
    return (
        "You are connected to the AFC OPS MCP server. Use the available function tools "
        "to help users with AFC operations tasks. Always call tools for live data — do not "
        "invent results.\n\n"
        f"{AFC_OPS_SKILL_CONTEXT}"
    )


def should_apply_skill(system_prompt: str | None, messages: list[ChatMessage]) -> bool:
    text = recent_text(system_prompt, messages)
    return matches_any_keyword(text, SKILL_KEYWORDS)


def _should_apply_afc_ops(system_prompt: str | None, messages: list[ChatMessage]) -> bool:
    text = recent_text(system_prompt, messages)
    return matches_any_keyword(text, AFC_OPS_KEYWORDS)


def build_system_prompt_with_skills(
    system_prompt: str | None,
    messages: list[ChatMessage],
) -> str | None:
    """Build the system prompt enriched with relevant skill contexts.

    The afc-stats-project skill is applied when stats/project keywords are detected.
    The afc-ops-mcp skill is applied when AFC operations keywords are detected.
    Both can be applied simultaneously if both keyword sets match.
    """
    want_stats = should_apply_skill(system_prompt, messages)
    want_ops = _should_apply_afc_ops(system_prompt, messages)

    parts: list[str] = []

    if want_ops:
        ops_ctx = load_afc_ops_context()
        if ops_ctx:
            parts.append(ops_ctx)

    if want_stats:
        stats_ctx = load_skill_context()
        if stats_ctx:
            parts.append(stats_ctx)

    if not parts:
        return system_prompt

    skill_text = "\n\n---\n\n".join(parts)

    if not system_prompt:
        return skill_text
    return f"{skill_text}\n\n---\n\nUser-provided system prompt:\n\n{system_prompt}"
