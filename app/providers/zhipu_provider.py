from openai import AsyncOpenAI

from app.attachment_utils import build_user_message_text
from app.config import Settings
from app.schemas import AgentRunRequest, ChatMessage


def _resolve_base_url(model: str, settings: Settings) -> str:
    if model.startswith("glm-4.7"):
        return settings.zhipu_coding_base_url
    return settings.zhipu_base_url


def _to_zhipu_messages(system_prompt: str | None, messages: list[ChatMessage], attachments) -> list[dict]:
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


async def run_zhipu_agent(request: AgentRunRequest, settings: Settings) -> tuple[str, str]:
    if not settings.zhipu_api_key:
        raise ValueError("Missing ZHIPU_API_KEY")

    model = request.model or settings.default_zhipu_model
    client = AsyncOpenAI(
        api_key=settings.zhipu_api_key,
        base_url=_resolve_base_url(model, settings),
    )
    response = await client.chat.completions.create(
        model=model,
        messages=_to_zhipu_messages(request.system_prompt, request.messages, request.attachments),
        temperature=request.temperature,
        max_tokens=request.max_output_tokens,
    )

    output_text = response.choices[0].message.content or ""
    return model, output_text
