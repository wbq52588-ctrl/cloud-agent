from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException

from app.agent_service import build_turn_agent_request, execute_agent_request
from app.attachment_utils import build_user_message_text
from app.config import get_settings
from app.schemas import (
    AgentRunRequest,
    AgentRunResponse,
    ChatMessage,
    ChatTurnRequest,
    PublicConfigResponse,
    SessionCreateRequest,
    SessionDetail,
    SessionSummary,
)
from app.session_store import SessionStore


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings()
    yield


app = FastAPI(title="Multi Model Agent", lifespan=lifespan)
store = SessionStore(get_settings().session_store_path)


def require_access(x_access_password: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.app_access_password:
        return

    if x_access_password != settings.app_access_password:
        raise HTTPException(status_code=401, detail="访问口令无效，请先登录")


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/public-config", response_model=PublicConfigResponse)
async def public_config() -> PublicConfigResponse:
    settings = get_settings()
    return PublicConfigResponse(requires_password=bool(settings.app_access_password))


@app.post("/v1/agent/run", response_model=AgentRunResponse)
async def run_agent(
    request: AgentRunRequest,
    x_access_password: str | None = Header(default=None),
) -> AgentRunResponse:
    require_access(x_access_password)
    model, output_text = await execute_agent_request(request, get_settings())
    return AgentRunResponse(
        provider=request.provider,
        model=model,
        output_text=output_text,
    )


@app.get("/v1/sessions", response_model=list[SessionSummary])
async def list_sessions(x_access_password: str | None = Header(default=None)) -> list[SessionSummary]:
    require_access(x_access_password)
    return store.list_sessions()


@app.post("/v1/sessions", response_model=SessionDetail)
async def create_session(
    request: SessionCreateRequest,
    x_access_password: str | None = Header(default=None),
) -> SessionDetail:
    require_access(x_access_password)
    return store.create_session(request.title)


@app.get("/v1/sessions/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: str,
    x_access_password: str | None = Header(default=None),
) -> SessionDetail:
    require_access(x_access_password)
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.delete("/v1/sessions/{session_id}")
async def delete_session(
    session_id: str,
    x_access_password: str | None = Header(default=None),
) -> dict[str, bool]:
    require_access(x_access_password)
    deleted = store.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True}


@app.post("/v1/sessions/{session_id}/chat", response_model=SessionDetail)
async def chat_session(
    session_id: str,
    request: ChatTurnRequest,
    x_access_password: str | None = Header(default=None),
) -> SessionDetail:
    require_access(x_access_password)
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    user_content = build_user_message_text(request.user_message, request.attachments)
    normalized_user_message = user_content or request.user_message or "[Uploaded content]"
    messages = [
        *session.messages,
        ChatMessage(role="user", content=normalized_user_message),
    ]

    model, output_text = await execute_agent_request(
        build_turn_agent_request(messages, request),
        get_settings(),
    )

    updated_session = store.append_turn(
        session_id=session_id,
        user_message=normalized_user_message,
        assistant_message=output_text,
        provider=request.provider,
        model=model,
        system_prompt=request.system_prompt,
    )
    if updated_session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return updated_session
