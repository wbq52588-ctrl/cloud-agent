from openai import AsyncOpenAI

from app.attachment_utils import build_user_message_text
from app.config import Settings
from app.schemas import AgentRunRequest, ChatMessage


def _to_openai_input(system_prompt: str | None, messages: list[ChatMessage], attachments) -> list[dict]:
    payload: list[dict] = []
    last_index = len(messages) - 1

    if system_prompt:
        payload.append(
            {
                "role": "system",
                "content": [{"type": "input_text", "text": system_prompt}],
            }
        )

    for index, message in enumerate(messages):
        content = [{"type": "input_text", "text": message.content}]

        if index == last_index and message.role == "user" and attachments:
            content = [
                {
                    "type": "input_text",
                    "text": build_user_message_text(message.content, attachments),
                }
            ]
            for attachment in attachments:
                if attachment.kind == "image" and attachment.data_url:
                    content.append(
                        {
                            "type": "input_image",
                            "image_url": attachment.data_url,
                        }
                    )

        payload.append(
            {
                "role": message.role,
                "content": content,
            }
        )

    return payload


async def run_openai_agent(request: AgentRunRequest, settings: Settings) -> tuple[str, str]:
    if not settings.openai_api_key:
        raise ValueError("Missing OPENAI_API_KEY")

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    model = request.model or settings.default_openai_model
    response = await client.responses.create(
        model=model,
        input=_to_openai_input(request.system_prompt, request.messages, request.attachments),
        temperature=request.temperature,
        max_output_tokens=request.max_output_tokens,
    )

    return model, response.output_text
