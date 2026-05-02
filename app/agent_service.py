from __future__ import annotations

import logging
import traceback

from fastapi import HTTPException

logger = logging.getLogger(__name__)

from app.claude_code_decorator import apply_claude_code_decorator
from app.config import Settings
from app.external_context import build_external_context
from app.provider_runner import run_with_retry
from app.providers.deepseek_provider import run_deepseek_agent
from app.schemas import AgentRunRequest, ChatTurnRequest
from app.skill_loader import build_system_prompt_with_skills


def format_provider_error(exc: Exception) -> str:
    message = str(exc)
    lowered = message.lower()

    if "timed out" in lowered or "timeout" in lowered:
        return "模型响应超时，请稍后重试"
    if "missing deepseek_api_key" in lowered:
        return "服务端未配置 DEEPSEEK_API_KEY"
    if "permission_denied" in lowered:
        return "模型服务拒绝了这次请求，请检查 API Key 权限"

    return f"Agent run failed: {exc}"


def build_agent_request(
    *,
    provider: str,
    model: str | None,
    system_prompt: str | None,
    messages,
    attachments,
    temperature: float | None,
    max_output_tokens: int | None,
    actor_wecom_userid: str | None = None,
) -> AgentRunRequest:
    return AgentRunRequest(
        provider=provider,
        model=model,
        system_prompt=system_prompt,
        messages=messages,
        attachments=attachments,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        actor_wecom_userid=actor_wecom_userid,
    )


def build_turn_agent_request(
    messages,
    request: ChatTurnRequest,
    *,
    actor_wecom_userid: str | None = None,
) -> AgentRunRequest:
    return build_agent_request(
        provider=request.provider,
        model=request.model,
        system_prompt=request.system_prompt,
        messages=messages,
        attachments=request.attachments,
        temperature=request.temperature,
        max_output_tokens=request.max_output_tokens,
        actor_wecom_userid=actor_wecom_userid,
    )


async def execute_agent_request(
    request: AgentRunRequest,
    settings: Settings,
) -> tuple[str, str, str]:
    request = await prepare_agent_request(request)
    try:
        return await run_with_retry(lambda: run_deepseek_agent(request, settings), settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("AGENT_ERROR exc=%s traceback=%s", repr(exc), traceback.format_exc())
        raise HTTPException(status_code=500, detail=format_provider_error(exc)) from exc


async def prepare_agent_request(request: AgentRunRequest) -> AgentRunRequest:
    """Add live context, wecom identity, coding style guidance, and optional skills."""
    external_context = await build_external_context(request.system_prompt, request.messages)
    system_prompt = request.system_prompt
    if external_context:
        system_prompt = (
            f"{external_context}\n\n---\n\n{system_prompt}"
            if system_prompt
            else external_context
        )

    # Inject actor_wecom_userid so the model knows what value to use for MCP tool calls.
    if request.actor_wecom_userid:
        identity_note = (
            f"当前操作用户的企业微信 userid 为: {request.actor_wecom_userid}。"
            f"调用 AFC MCP 工具（afc_* 系列）时，必须使用此值作为 actor_wecom_userid 参数，"
            f"不得编造或使用其他值。"
        )
        system_prompt = (
            f"{identity_note}\n\n{system_prompt}"
            if system_prompt
            else identity_note
        )

    request = request.model_copy(
        update={
            "system_prompt": build_system_prompt_with_skills(
                apply_claude_code_decorator(system_prompt, request.messages),
                request.messages,
            )
        }
    )
    return request
