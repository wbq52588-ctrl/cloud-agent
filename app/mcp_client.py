from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import HTTPException

from app.config import get_settings

logger = logging.getLogger(__name__)

AFC_MCP_URL = "https://afcmcp.819521.xyz/mcp"

_client: httpx.AsyncClient | None = None


def _get_mcp_http_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        settings = get_settings()
        api_key = settings.mcp_remote_api_key or ""
        _client = httpx.AsyncClient(
            base_url=AFC_MCP_URL,
            timeout=30.0,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )
    return _client


async def close_mcp_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None


async def _mcp_call_tool(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Call a single MCP tool and return the result."""
    client = _get_mcp_http_client()

    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
        "id": 1,
    }

    try:
        response = await client.post("", json=payload)
        response.raise_for_status()
        result = response.json()

        if "error" in result:
            error_msg = result["error"].get("message", str(result["error"]))
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

    payload = {
        "jsonrpc": "2.0",
        "method": "tools/list",
        "params": {},
        "id": 1,
    }

    try:
        response = await client.post("", json=payload)
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
