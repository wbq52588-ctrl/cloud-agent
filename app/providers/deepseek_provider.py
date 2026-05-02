from openai import AsyncOpenAI

from app.attachment_utils import build_user_message_text
from app.config import Settings
from app.schemas import AgentRunRequest, ChatMessage

_client: AsyncOpenAI | None = None
_client_settings_hash: int | None = None


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


def _to_deepseek_messages(system_prompt: str | None, messages: list[ChatMessage], attachments) -> list[dict]:
    payload: list[dict] = []
    last_index = len(messages) - 1

    if system_prompt:
        payload.append(
            {
                "role": "system",
                "content": system_prompt,
            }
        )

    for index, message in enumerate(messages):
        content = message.content

        if index == last_index and message.role == "user" and attachments:
            content = build_user_message_text(message.content, attachments)

        payload.append(
            {
                "role": message.role,
                "content": content,
            }
        )

    return payload


async def run_deepseek_agent(request: AgentRunRequest, settings: Settings) -> tuple[str, str, str]:
    if not settings.deepseek_api_key:
        raise ValueError("Missing DEEPSEEK_API_KEY")

    model = request.model or settings.default_deepseek_model
    client = _get_client(settings)

    payload = {
        "model": model,
        "messages": _to_deepseek_messages(request.system_prompt, request.messages, request.attachments),
    }
    if model == "deepseek-v4-pro":
        payload["extra_body"] = {
            "thinking": {"type": "enabled"},
            "reasoning_effort": "high",
        }
    else:
        payload["temperature"] = request.temperature
        payload["max_tokens"] = request.max_output_tokens

    response = await client.chat.completions.create(**payload)

    message = response.choices[0].message
    output_text = message.content or ""
    reasoning_text = getattr(message, "reasoning_content", None) or ""
    return model, output_text, reasoning_text


async def run_deepseek_agent_stream(request: AgentRunRequest, settings: Settings):
    """Stream DeepSeek response chunks as they arrive.

    Yields (type, text) tuples:
      - ("reasoning", text) — thinking/reasoning content (deepseek-v4-pro only)
      - ("content", text)   — visible assistant response text
      - ("done", "")        — stream complete
    """
    if not settings.deepseek_api_key:
        raise ValueError("Missing DEEPSEEK_API_KEY")

    model = request.model or settings.default_deepseek_model
    client = _get_client(settings)

    payload = {
        "model": model,
        "messages": _to_deepseek_messages(request.system_prompt, request.messages, request.attachments),
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if model == "deepseek-v4-pro":
        payload["extra_body"] = {
            "thinking": {"type": "enabled"},
            "reasoning_effort": "high",
        }
    else:
        payload["temperature"] = request.temperature
        payload["max_tokens"] = request.max_output_tokens

    stream = await client.chat.completions.create(**payload)

    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta:
            delta = chunk.choices[0].delta
            reasoning = getattr(delta, "reasoning_content", None)
            if reasoning:
                yield ("reasoning", reasoning)
            if delta.content:
                yield ("content", delta.content)

    yield ("done", "")
