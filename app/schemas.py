from typing import Literal

from pydantic import BaseModel, Field, model_validator


Provider = Literal["deepseek"]
Role = Literal["system", "user", "assistant"]
AttachmentKind = Literal["image", "text"]


class ChatMessage(BaseModel):
    role: Role
    content: str = Field(min_length=1)
    reasoning_content: str | None = None


class Attachment(BaseModel):
    kind: AttachmentKind
    name: str = Field(min_length=1)
    content_type: str = Field(min_length=1)
    data_url: str | None = None
    text_content: str | None = None


class AgentRunRequest(BaseModel):
    provider: Provider
    model: str | None = None
    system_prompt: str | None = None
    messages: list[ChatMessage]
    attachments: list[Attachment] = Field(default_factory=list)
    temperature: float | None = Field(default=0.2, ge=0, le=2)
    max_output_tokens: int | None = Field(default=4096, ge=1, le=32768)
    actor_wecom_userid: str | None = None


class AgentRunResponse(BaseModel):
    provider: Provider
    model: str
    output_text: str
    reasoning_text: str | None = None


class SessionCreateRequest(BaseModel):
    title: str | None = None


class SessionSummary(BaseModel):
    session_id: str
    title: str
    provider: Provider | None = None
    model: str | None = None
    updated_at: str
    message_count: int


class SessionDetail(SessionSummary):
    system_prompt: str | None = None
    messages: list[ChatMessage]


class ChatTurnRequest(BaseModel):
    provider: Provider
    model: str | None = None
    system_prompt: str | None = None
    user_message: str = ""
    attachments: list[Attachment] = Field(default_factory=list)
    temperature: float | None = Field(default=0.2, ge=0, le=2)
    max_output_tokens: int | None = Field(default=4096, ge=1, le=32768)

    @model_validator(mode="after")
    def validate_payload(self) -> "ChatTurnRequest":
        if not self.user_message.strip() and not self.attachments:
            raise ValueError("请输入消息，或至少上传一个文件")
        return self


class PublicConfigResponse(BaseModel):
    requires_password: bool
    supported_providers: list[str] = Field(default_factory=lambda: ["deepseek"])
    default_provider: str = "deepseek"
    default_models: dict[str, str] = Field(default_factory=lambda: {"deepseek": "deepseek-v4-pro"})
    current_wecom_userid: str | None = None
