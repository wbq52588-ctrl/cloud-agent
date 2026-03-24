from openai import AsyncOpenAI

from app.config import Settings
from app.schemas import AgentRunRequest, ChatMessage


def _to_openai_input(system_prompt: str | None, messages: list[ChatMessage]) -> list[dict]:
    payload: list[dict] = []

    if system_prompt:
        payload.append(
            {
                "role": "system",
                "content": [{"type": "input_text", "text": system_prompt}],
            }
        )

    for message in messages:
        payload.append(
            {
                "role": message.role,
                "content": [{"type": "input_text", "text": message.content}],
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
        input=_to_openai_input(request.system_prompt, request.messages),
        temperature=request.temperature,
        max_output_tokens=request.max_output_tokens,
    )

    return model, response.output_text
