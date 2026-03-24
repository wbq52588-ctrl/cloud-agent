from typing import Literal

from pydantic import BaseModel, Field


Provider = Literal["openai", "gemini"]
Role = Literal["system", "user", "assistant"]


class ChatMessage(BaseModel):
    role: Role
    content: str = Field(min_length=1)


class AgentRunRequest(BaseModel):
    provider: Provider
    model: str | None = None
    system_prompt: str | None = None
    messages: list[ChatMessage]
    temperature: float | None = Field(default=0.2, ge=0, le=2)
    max_output_tokens: int | None = Field(default=800, ge=1, le=8192)


class AgentRunResponse(BaseModel):
    provider: Provider
    model: str
    output_text: str
