from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import HTTPException

from app.config import Settings
from app.provider_runner import run_with_retry
from app.providers.gemini_provider import run_gemini_agent
from app.providers.openai_provider import run_openai_agent
from app.providers.vps_provider import run_vps_agent
from app.providers.zhipu_provider import run_zhipu_agent
from app.schemas import AgentRunRequest, ChatTurnRequest

ProviderRunner = Callable[[AgentRunRequest, Settings], Awaitable[tuple[str, str]]]


def format_provider_error(exc: Exception) -> str:
    message = str(exc)
    lowered = message.lower()

    if "insufficient_quota" in lowered:
        return "OpenAI API 额度不足，请检查 billing 或充值后重试"
    if "timed out" in lowered or "timeout" in lowered:
        return "模型响应超时，请稍后重试"
    if "resource_exhausted" in lowered:
        return "Gemini 当前模型额度不足，请稍后重试或切换其他 Gemini 模型"
    if "api key was reported as leaked" in lowered:
        return "Gemini API Key 已被判定泄露，请更换新的 Key"
    if "missing zhipu_api_key" in lowered:
        return "服务端未配置 ZHIPU_API_KEY"
    if "permission_denied" in lowered:
        return "模型服务拒绝了这次请求，请检查 API Key 权限"
    if "missing openai_api_key" in lowered:
        return "服务端未配置 OPENAI_API_KEY"
    if "missing gemini_api_key" in lowered:
        return "服务端未配置 GEMINI_API_KEY"

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
) -> AgentRunRequest:
    return AgentRunRequest(
        provider=provider,
        model=model,
        system_prompt=system_prompt,
        messages=messages,
        attachments=attachments,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )


def build_turn_agent_request(messages, request: ChatTurnRequest) -> AgentRunRequest:
    return build_agent_request(
        provider=request.provider,
        model=request.model,
        system_prompt=request.system_prompt,
        messages=messages,
        attachments=request.attachments,
        temperature=request.temperature,
        max_output_tokens=request.max_output_tokens,
    )


async def _run_non_vps(
    request: AgentRunRequest,
    settings: Settings,
    runner: ProviderRunner,
) -> tuple[str, str]:
    return await run_with_retry(lambda: runner(request, settings), settings)


async def execute_agent_request(
    request: AgentRunRequest,
    settings: Settings,
) -> tuple[str, str]:
    try:
        if request.provider == "vps":
            return await run_vps_agent(request)
        if request.provider == "openai":
            return await _run_non_vps(request, settings, run_openai_agent)
        if request.provider == "zhipu":
            return await _run_non_vps(request, settings, run_zhipu_agent)
        return await _run_non_vps(request, settings, run_gemini_agent)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=format_provider_error(exc)) from exc
