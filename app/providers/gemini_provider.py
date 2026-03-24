from google import genai
from google.genai import types

from app.config import Settings
from app.schemas import AgentRunRequest, ChatMessage


def _to_gemini_contents(messages: list[ChatMessage]) -> list[types.Content]:
    contents: list[types.Content] = []

    for message in messages:
        role = "model" if message.role == "assistant" else "user"
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part(text=message.content)],
            )
        )

    return contents


async def run_gemini_agent(request: AgentRunRequest, settings: Settings) -> tuple[str, str]:
    if not settings.gemini_api_key:
        raise ValueError("Missing GEMINI_API_KEY")

    client = genai.Client(api_key=settings.gemini_api_key)
    model = request.model or settings.default_gemini_model
    response = await client.aio.models.generate_content(
        model=model,
        contents=_to_gemini_contents(request.messages),
        config=types.GenerateContentConfig(
            system_instruction=request.system_prompt,
            temperature=request.temperature,
            max_output_tokens=request.max_output_tokens,
        ),
    )

    return model, response.text or ""
