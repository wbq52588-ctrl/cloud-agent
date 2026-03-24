from google import genai
from google.genai import types

from app.attachment_utils import build_user_message_text, parse_data_url
from app.config import Settings
from app.schemas import AgentRunRequest, ChatMessage


def _to_gemini_contents(messages: list[ChatMessage], attachments) -> list[types.Content]:
    contents: list[types.Content] = []
    last_index = len(messages) - 1

    for index, message in enumerate(messages):
        role = "model" if message.role == "assistant" else "user"
        parts = [types.Part(text=message.content)]

        if index == last_index and message.role == "user" and attachments:
            parts = [types.Part(text=build_user_message_text(message.content, attachments))]
            for attachment in attachments:
                if attachment.kind == "image" and attachment.data_url:
                    mime_type, data = parse_data_url(attachment.data_url)
                    parts.append(types.Part.from_bytes(data=data, mime_type=mime_type))

        contents.append(
            types.Content(
                role=role,
                parts=parts,
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
        contents=_to_gemini_contents(request.messages, request.attachments),
        config=types.GenerateContentConfig(
            system_instruction=request.system_prompt,
            temperature=request.temperature,
            max_output_tokens=request.max_output_tokens,
        ),
    )

    return model, response.text or ""
