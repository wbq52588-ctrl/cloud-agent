from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import HTTPException

from app.config import get_settings

logger = logging.getLogger(__name__)

AFC_MCP_BASE_URL = "https://afcmcp.819521.xyz"
AFC_MCP_PATH = "/mcp"

_client: httpx.AsyncClient | None = None
_mcp_session_id: str | None = None


def _get_mcp_http_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        settings = get_settings()
        api_key = settings.mcp_remote_api_key or ""
        _client = httpx.AsyncClient(
            base_url=AFC_MCP_BASE_URL,
            timeout=30.0,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )
    return _client


async def close_mcp_client() -> None:
    global _client, _mcp_session_id
    _mcp_session_id = None
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None


async def _ensure_mcp_session() -> str | None:
    """Initialize an MCP session if one hasn't been established yet.

    Returns the session ID, or None if initialization failed.
    """
    global _mcp_session_id
    if _mcp_session_id:
        return _mcp_session_id

    client = _get_mcp_http_client()
    payload = {
        "jsonrpc": "2.0",
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "cloudagent", "version": "1.0.0"},
        },
        "id": 0,
    }

    try:
        response = await client.post(AFC_MCP_PATH, json=payload)
        response.raise_for_status()
        sid = response.headers.get("Mcp-Session-Id")
        if sid:
            _mcp_session_id = sid
            logger.info("MCP session established: %s…", sid[:8])
            return sid

        # Some servers return session ID in the JSON body.
        result = response.json()
        sid = result.get("result", {}).get("sessionId", "")
        if sid:
            _mcp_session_id = sid
            return sid

        logger.warning("MCP initialize returned no session ID, proceeding without")
        return None
    except Exception as exc:
        logger.error("MCP session initialization failed: %s", exc)
        return None


async def _mcp_call_tool(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Call a single MCP tool and return the result."""
    global _mcp_session_id

    client = _get_mcp_http_client()

    # Ensure we have an MCP session.
    await _ensure_mcp_session()

    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
        "id": 1,
    }

    headers = {}
    if _mcp_session_id:
        headers["Mcp-Session-Id"] = _mcp_session_id

    async def _do_post():
        resp = await client.post(AFC_MCP_PATH, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()

    try:
        result = await _do_post()

        if "error" in result:
            error_msg = result["error"].get("message", str(result["error"]))
            # If session expired, reset and retry once.
            if "session" in error_msg.lower() and _mcp_session_id:
                _mcp_session_id = None
                await _ensure_mcp_session()
                if _mcp_session_id:
                    headers["Mcp-Session-Id"] = _mcp_session_id
                    result2 = await _do_post()
                    if "error" in result2:
                        return {"error": result2["error"].get("message", str(result2["error"]))}
                    return result2.get("result", result2)

            logger.warning("MCP tool %s error: %s", tool_name, error_msg)
            return {"error": error_msg}

        return result.get("result", result)
    except httpx.HTTPError as exc:
        logger.error("MCP tool %s HTTP error: %s", tool_name, exc)
        return {"error": f"MCP connection failed: {exc}"}
    except Exception as exc:
        logger.error("MCP tool %s unexpected error: %s", tool_name, exc)
        return {"error": str(exc)}


async def list_mcp_tools() -> list[dict[str, Any]]:
    """List all available MCP tools from the afc-ops server."""
    client = _get_mcp_http_client()
    await _ensure_mcp_session()

    payload = {
        "jsonrpc": "2.0",
        "method": "tools/list",
        "params": {},
        "id": 1,
    }

    headers = {}
    if _mcp_session_id:
        headers["Mcp-Session-Id"] = _mcp_session_id

    try:
        response = await client.post(AFC_MCP_PATH, json=payload, headers=headers)
        response.raise_for_status()
        result = response.json()
        tools = result.get("result", {}).get("tools", [])
        return tools
    except Exception as exc:
        logger.error("Failed to list MCP tools: %s", exc)
        return []


# Tool definitions for DeepSeek API function calling format.
MCP_TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "afc_list_todos",
            "description": "查询当前用户的待办任务列表",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {
                        "type": "string",
                        "description": "企业微信 userid，从会话上下文获取",
                    },
                    "status": {
                        "type": "string",
                        "enum": ["pending", "completed", "all"],
                        "description": "过滤待办状态，默认 all",
                    },
                },
                "required": ["actor_wecom_userid"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_get_todo_details",
            "description": "查看某个待办任务的详细子项",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "task_id": {"type": "string", "description": "待办任务 ID"},
                },
                "required": ["actor_wecom_userid", "task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_create_todo",
            "description": "创建普通待办任务（不创建周期模板）",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "title": {"type": "string", "description": "待办标题"},
                    "scope_type": {
                        "type": "string",
                        "enum": ["station", "personnel"],
                        "description": "作用范围类型",
                    },
                    "target_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "目标站点或人员 ID 列表",
                    },
                    "description": {"type": "string", "description": "待办描述（可选）"},
                    "due_at": {"type": "string", "description": "截止时间 ISO 字符串（可选）"},
                },
                "required": ["actor_wecom_userid", "title", "scope_type", "target_ids"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_complete_todo_item",
            "description": "完成待办任务中的某个子项",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "item_id": {"type": "string", "description": "待办子项 ID"},
                    "remarks": {"type": "string", "description": "完成备注（可选）"},
                },
                "required": ["actor_wecom_userid", "item_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_list_faults",
            "description": "查询故障列表",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "status": {
                        "type": "string",
                        "enum": ["pending", "fixed", "all"],
                        "description": "过滤故障状态，默认 all",
                    },
                },
                "required": ["actor_wecom_userid"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_get_fault_details",
            "description": "查看故障详情",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "fault_id": {"type": "string", "description": "故障 ID"},
                },
                "required": ["actor_wecom_userid", "fault_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_report_fault",
            "description": "上报新故障",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "description": {"type": "string", "description": "故障描述"},
                    "station_id": {"type": "string", "description": "站点 ID"},
                    "device_type_name": {"type": "string", "description": "设备类型，如 BOM、闸机"},
                    "device_number": {"type": "string", "description": "设备编号（可选）"},
                },
                "required": ["actor_wecom_userid", "description", "station_id", "device_type_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_fix_fault",
            "description": "标记故障已修复",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "fault_id": {"type": "string", "description": "故障 ID"},
                    "remarks": {"type": "string", "description": "修复备注（可选）"},
                },
                "required": ["actor_wecom_userid", "fault_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_list_maintenance",
            "description": "查询检修计划/记录",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "status": {
                        "type": "string",
                        "enum": ["pending", "completed", "all"],
                        "description": "过滤检修状态，默认 all",
                    },
                },
                "required": ["actor_wecom_userid"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_get_maintenance_details",
            "description": "查看检修记录详情",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "maintenance_id": {"type": "string", "description": "检修记录 ID"},
                },
                "required": ["actor_wecom_userid", "maintenance_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_complete_maintenance",
            "description": "完成检修记录",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "maintenance_id": {"type": "string", "description": "检修记录 ID"},
                    "remarks": {"type": "string", "description": "完成备注（可选）"},
                },
                "required": ["actor_wecom_userid", "maintenance_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_list_materials",
            "description": "查询物料库存",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "low_stock_only": {"type": "boolean", "description": "只显示低库存物料"},
                },
                "required": ["actor_wecom_userid"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_add_material_stock",
            "description": "增加物料库存",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "material_id": {"type": "string", "description": "物料 ID"},
                    "quantity": {"type": "integer", "description": "增加数量"},
                },
                "required": ["actor_wecom_userid", "material_id", "quantity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_list_stations",
            "description": "查询站点列表，用于匹配站点名称",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "keyword": {"type": "string", "description": "站点名称关键词（可选）"},
                },
                "required": ["actor_wecom_userid"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "afc_search_users",
            "description": "搜索用户，用于匹配人员姓名",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_wecom_userid": {"type": "string", "description": "企业微信 userid"},
                    "keyword": {"type": "string", "description": "姓名关键词"},
                },
                "required": ["actor_wecom_userid", "keyword"],
            },
        },
    },
]


async def execute_tool(tool_name: str, arguments: dict[str, Any]) -> str:
    """Execute an MCP tool and return a string result."""
    result = await _mcp_call_tool(tool_name, arguments)
    return json.dumps(result, ensure_ascii=False, indent=2)
