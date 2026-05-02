import json
import logging

from openai import AsyncOpenAI

from app.attachment_utils import build_user_message_text
from app.config import Settings
from app.mcp_client import MCP_TOOL_DEFINITIONS, execute_tool
from app.schemas import AgentRunRequest, ChatMessage

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None
_client_settings_hash: int | None = None

MAX_TOOL_ITERATIONS = 6


def _get_client(settings: Settings) -> AsyncOpenAI:
    """Lazy singleton: reuse the AsyncOpenAI client across requests for connection pooling."""
    global _client, _client_settings_hash
    current_hash = hash((settings.deepseek_api_key, settings.deepseek_base_url))
    if _client is None or _client_settings_hash != current_hash:
        _client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        )
        _client_settings_hash = current_hash
    return _client


def _to_deepseek_messages(
    system_prompt: str | None, messages: list[ChatMessage], attachments,
) -> list[dict]:
    payload: list[dict] = []
    last_index = len(messages) - 1

    if system_prompt:
        payload.append({"role": "system", "content": system_prompt})

    for index, message in enumerate(messages):
        content = message.content
        if index == last_index and message.role == "user" and attachments:
            content = build_user_message_text(message.content, attachments)
        payload.append({"role": message.role, "content": content})

    return payload


def _build_payload_base(request: AgentRunRequest, model: str) -> dict:
    """Build the base payload dict shared by streaming and non-streaming calls."""
    payload: dict = {
        "model": model,
        "tools": MCP_TOOL_DEFINITIONS,
    }
    if model == "deepseek-v4-pro":
        payload["extra_body"] = {
            "thinking": {"type": "enabled"},
            "reasoning_effort": "high",
        }
    else:
        payload["temperature"] = request.temperature
    payload["max_tokens"] = request.max_output_tokens
    return payload


async def _run_tool_loop(
    client: AsyncOpenAI,
    ds_messages: list[dict],
    payload_base: dict,
    *,
    on_tool_start=None,
    on_tool_end=None,
) -> tuple[str, list[str], bool]:
    """Run the tool-calling loop until the model produces a final text answer.

    ds_messages is mutated in-place: tool-call assistant messages and tool-result
    messages are appended, but the FINAL assistant message is NOT appended (the
    caller decides what to do with it).

    Returns (final_content, reasoning_parts, tools_were_called).
    """
    all_reasoning: list[str] = []
    tools_called = False

    for _iteration in range(MAX_TOOL_ITERATIONS):
        response = await client.chat.completions.create(
            messages=ds_messages,
            **payload_base,
        )

        message = response.choices[0].message
        reasoning = getattr(message, "reasoning_content", None)
        if reasoning:
            all_reasoning.append(reasoning)

        if message.tool_calls:
            tools_called = True

            # 1. Append the assistant message with tool_calls FIRST (API requirement).
            tc_dicts = []
            tool_specs: list[dict] = []
            for tc in message.tool_calls:
                tc_dicts.append({
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                })
                try:
                    arguments = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    arguments = {}
                tool_specs.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": arguments,
                })

            ds_messages.append({
                "role": "assistant",
                "content": message.content or None,
                "tool_calls": tc_dicts,
            })

            # 2. Execute tools and append results AFTER the assistant message.
            for spec in tool_specs:
                if on_tool_start:
                    on_tool_start(spec["name"])

                result_str = await execute_tool(spec["name"], spec["arguments"])

                ds_messages.append({
                    "role": "tool",
                    "tool_call_id": spec["id"],
                    "content": result_str,
                })

                if on_tool_end:
                    preview = result_str[:200] + "…" if len(result_str) > 200 else result_str
                    on_tool_end(spec["name"], preview)

            continue

        # No tool calls — this is the final response.
        content = message.content or ""
        if not content.strip():
            content = "（模型未返回文本响应，请重试。）"
        return content, all_reasoning, tools_called

    # Max iterations reached.
    logger.warning("Tool loop exhausted after %d iterations", MAX_TOOL_ITERATIONS)
    return "已达到最大工具调用次数，请稍后重试。", all_reasoning, tools_called


async def run_deepseek_agent(
    request: AgentRunRequest,
    settings: Settings,
) -> tuple[str, str, str]:
    if not settings.deepseek_api_key:
        raise ValueError("Missing DEEPSEEK_API_KEY")

    model = request.model or settings.default_deepseek_model
    client = _get_client(settings)

    ds_messages = _to_deepseek_messages(
        request.system_prompt, request.messages, request.attachments,
    )
    payload_base = _build_payload_base(request, model)

    final_content, reasoning_parts, _ = await _run_tool_loop(
        client, ds_messages, payload_base,
    )

    return model, final_content, "".join(reasoning_parts)


async def run_deepseek_agent_stream(request: AgentRunRequest, settings: Settings):
    """Stream DeepSeek response, with tool-calling resolution first.

    Yields (type, text) tuples:
      - ("tool_start", json) — a tool execution is starting
      - ("tool_end", json)   — a tool execution finished
      - ("reasoning", text)  — thinking/reasoning content
      - ("content", text)    — visible assistant response text
      - ("done", "")         — stream complete
    """
    if not settings.deepseek_api_key:
        raise ValueError("Missing DEEPSEEK_API_KEY")

    model = request.model or settings.default_deepseek_model
    client = _get_client(settings)

    ds_messages = _to_deepseek_messages(
        request.system_prompt, request.messages, request.attachments,
    )
    payload_base = _build_payload_base(request, model)

    # ---- Phase 1: resolve tool calls (non-streamed, with progress events) ----
    tool_events: list[tuple[str, str]] = []

    def _on_tool_start(name: str) -> None:
        tool_events.append(("tool_start", json.dumps({"name": name})))

    def _on_tool_end(name: str, preview: str) -> None:
        tool_events.append(("tool_end", json.dumps({"name": name, "preview": preview})))

    try:
        final_content, reasoning_parts, tools_called = await _run_tool_loop(
            client, ds_messages, payload_base,
            on_tool_start=_on_tool_start,
            on_tool_end=_on_tool_end,
        )
    except Exception as exc:
        logger.error("Tool resolution error: %s", exc)
        yield ("done", "")
        return

    if not tools_called:
        # ---- No tools were needed — stream normally ----
        stream_payload = {**payload_base, "stream": True, "stream_options": {"include_usage": True}}
        stream_payload.pop("tools", None)  # Avoid unnecessary tool processing.

        stream = await client.chat.completions.create(
            messages=ds_messages,
            **stream_payload,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta:
                delta = chunk.choices[0].delta
                reasoning = getattr(delta, "reasoning_content", None)
                if reasoning:
                    yield ("reasoning", reasoning)
                if delta.content:
                    yield ("content", delta.content)

        yield ("done", "")
        return

    # ---- Phase 2: tools were used — emit tool events + consolidated response ----
    for event in tool_events:
        yield event

    reasoning_text = "".join(reasoning_parts)
    if reasoning_text:
        yield ("reasoning", reasoning_text)
    if final_content:
        yield ("content", final_content)

    yield ("done", "")
