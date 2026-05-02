from __future__ import annotations

import asyncio
from datetime import UTC, datetime
import json
import logging
import re
from typing import Any

import httpx

from app.schemas import ChatMessage
from app.text_utils import matches_any_keyword, recent_text

logger = logging.getLogger(__name__)

AFC_STATS_BASE_URL = "https://afcstats.552588.xyz"
MAX_CONTEXT_CHARS = 12000

# Module-level httpx client reused across requests for connection pooling.
_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(base_url=AFC_STATS_BASE_URL, timeout=30.0)
    return _http_client

AFC_CONTEXT_KEYWORDS = (
    "afc",
    "stats",
    "看板",
    "班组",
    "工分",
    "积分",
    "排名",
    "第几",
    "考勤",
    "周报",
    "检修",
    "故障",
    "待办",
    "隐患",
    "工作量",
    "张朋",
    "workload",
    "attendance",
    "weekly",
    "insight",
)


def should_fetch_afc_context(system_prompt: str | None, messages: list[ChatMessage]) -> bool:
    text = recent_text(system_prompt, messages)
    return matches_any_keyword(text, AFC_CONTEXT_KEYWORDS)


def _extract_month(text: str) -> str:
    matched = re.search(r"(20\d{2})[-/.年](0?[1-9]|1[0-2])", text)
    if matched:
        year, month = matched.groups()
        return f"{year}-{int(month):02d}"
    return datetime.now(UTC).strftime("%Y-%m")


def _take(rows: list[Any] | None, limit: int) -> list[Any]:
    return list(rows or [])[:limit]


def _compact_records(records: dict[str, Any]) -> dict[str, Any]:
    return {
        "faults": _take(records.get("faults"), 20),
        "todos": _take(records.get("todos"), 20),
        "maintenance": _take(records.get("maintenance"), 20),
        "workloads": _take(records.get("workloads"), 20),
        "attendance": _take(records.get("attendance"), 20),
    }


def _compact_weekly_report(weekly_report: dict[str, Any] | None) -> dict[str, Any] | None:
    if not weekly_report:
        return None

    return {
        "report_id": weekly_report.get("report_id"),
        "title": weekly_report.get("title"),
        "date_range": weekly_report.get("date_range"),
        "summary": weekly_report.get("summary"),
        "focus_issues": _take(weekly_report.get("focus_issues"), 15),
        "follow_up_items": _take(weekly_report.get("follow_up_items"), 15),
        "recommendations": weekly_report.get("recommendations") or [],
        "sections": [
            {
                "key": section.get("key"),
                "title": section.get("title"),
                "items": _take(section.get("items"), 20),
            }
            for section in _take(weekly_report.get("sections"), 8)
        ],
    }


def _compact_ai_context(data: dict[str, Any], insight: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "source": "GET /api/ai/context and GET /api/ai/insights from afcstats.552588.xyz",
        "generated_at": data.get("generated_at"),
        "month": data.get("month"),
        "workgroup": data.get("workgroup"),
        "summary": data.get("summary"),
        "rankings": data.get("rankings") or [],
        "records": _compact_records(data.get("records") or {}),
        "rule_usage": {
            "summary": (data.get("rule_usage") or {}).get("summary"),
            "groups": _take((data.get("rule_usage") or {}).get("groups"), 30),
        }
        if data.get("rule_usage")
        else None,
        "weekly_report": _compact_weekly_report(data.get("weekly_report")),
        "monthly_weekly_report": data.get("monthly_weekly_report"),
        "current_ai_insight": insight or data.get("current_ai_insight"),
        "write_back": {
            "endpoint": "POST /api/ai/insights",
            "note": "Do not write back automatically. If the user asks to write/save AI insight to the stats dashboard, ask for confirmation before submitting.",
            "body_schema": (data.get("instructions") or {}).get("write_back_body_schema"),
        },
    }


def _detect_context_scope(text: str) -> str:
    lowered = text.lower()
    if any(word in lowered for word in ("排名", "第几", "积分", "工分", "score", "rank")):
        return "ranking"
    if any(word in lowered for word in ("周报", "隐患", "建议", "weekly", "hazard", "risk")):
        return "weekly"
    if any(word in lowered for word in ("故障", "待办", "检修", "工作量", "考勤", "fault", "todo", "workload", "attendance")):
        return "records"
    return "summary"


def _compact_ai_context_for_scope(
    data: dict[str, Any],
    insight: dict[str, Any] | None,
    scope: str,
) -> dict[str, Any]:
    base = {
        "source": "GET /api/ai/context and GET /api/ai/insights from afcstats.552588.xyz",
        "generated_at": data.get("generated_at"),
        "month": data.get("month"),
        "workgroup": data.get("workgroup"),
        "summary": data.get("summary"),
        "current_ai_insight": insight or data.get("current_ai_insight"),
    }

    if scope == "ranking":
        return {
            **base,
            "rankings": data.get("rankings") or [],
        }

    if scope == "weekly":
        return {
            **base,
            "weekly_report": _compact_weekly_report(data.get("weekly_report")),
            "monthly_weekly_report": data.get("monthly_weekly_report"),
        }

    if scope == "records":
        return {
            **base,
            "rankings": data.get("rankings") or [],
            "records": _compact_records(data.get("records") or {}),
            "rule_usage": {
                "summary": (data.get("rule_usage") or {}).get("summary"),
                "groups": _take((data.get("rule_usage") or {}).get("groups"), 20),
            }
            if data.get("rule_usage")
            else None,
        }

    return {
        **base,
        "rankings": _take(data.get("rankings"), 13),
        "write_back": {
            "endpoint": "POST /api/ai/insights",
            "note": "Do not write back automatically.",
        },
    }


async def build_external_context(system_prompt: str | None, messages: list[ChatMessage]) -> str | None:
    if not should_fetch_afc_context(system_prompt, messages):
        return None

    text = recent_text(system_prompt, messages)
    month = _extract_month(text)
    scope = _detect_context_scope(text)

    client = _get_http_client()

    async def _fetch_context() -> dict[str, Any]:
        response = await client.get("/api/ai/context", params={"month": month})
        response.raise_for_status()
        return response.json()

    async def _fetch_insights() -> dict[str, Any]:
        response = await client.get("/api/ai/insights", params={"month": month})
        response.raise_for_status()
        return response.json()

    # Parallelize the two independent API calls.
    try:
        context_payload, insights_payload = await asyncio.gather(
            _fetch_context(),
            _fetch_insights(),
        )
    except Exception as exc:
        logger.warning(
            "External AFC stats API unavailable, proceeding without live context: %s",
            repr(exc),
        )
        return None

    ai_context = context_payload.get("data") or {}
    current_insight = insights_payload.get("data")
    compact = _compact_ai_context_for_scope(ai_context, current_insight, scope)
    serialized = json.dumps(compact, ensure_ascii=False, separators=(",", ":"))

    if len(serialized) > MAX_CONTEXT_CHARS:
        serialized = serialized[:MAX_CONTEXT_CHARS].rstrip() + "...[truncated]"

    return (
        "=== EXTERNAL CONTEXT START (afcstats.552588.xyz) ===\n"
        "Live external API context from the AFC stats project. "
        "Use this as the source of truth for AFC dashboard, ranking, score, attendance, "
        "workload, fault, todo, maintenance, weekly report, risk, and AI insight questions. "
        "The stats project exposes two AI-facing read APIs: GET /api/ai/context and GET /api/ai/insights. "
        "A write-back API POST /api/ai/insights exists, but you must not claim it was called unless the server actually calls it.\n\n"
        f"{serialized}\n"
        "=== EXTERNAL CONTEXT END ==="
    )
