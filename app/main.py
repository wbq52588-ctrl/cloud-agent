from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.attachment_utils import build_user_message_text
from app.config import get_settings
from app.providers.gemini_provider import run_gemini_agent
from app.providers.openai_provider import run_openai_agent
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
app.mount("/static", StaticFiles(directory="app/static"), name="static")


def require_access(x_access_password: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.app_access_password:
        return

    if x_access_password != settings.app_access_password:
        raise HTTPException(status_code=401, detail="访问口令无效，请先登录")


def format_provider_error(exc: Exception) -> str:
    message = str(exc)
    lowered = message.lower()

    if "insufficient_quota" in lowered:
        return "OpenAI API 额度不足，请检查 billing 或充值后重试"
    if "resource_exhausted" in lowered:
        return "Gemini 当前模型额度不足，请稍后重试或切换到其他 Gemini 模型"
    if "api key was reported as leaked" in lowered:
        return "Gemini API Key 已被判定泄露，请更换新的 Key"
    if "permission_denied" in lowered:
        return "模型服务拒绝了这次请求，请检查 API Key 权限"
    if "missing openai_api_key" in lowered:
        return "服务器未配置 OPENAI_API_KEY"
    if "missing gemini_api_key" in lowered:
        return "服务器未配置 GEMINI_API_KEY"

    return f"Agent run failed: {exc}"


@app.get("/", response_class=FileResponse)
async def index() -> FileResponse:
    return FileResponse("app/templates/index.html")


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
    settings = get_settings()

    try:
        if request.provider == "openai":
            model, output_text = await run_openai_agent(request, settings)
        else:
            model, output_text = await run_gemini_agent(request, settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=format_provider_error(exc)) from exc

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

    composed_user_message = build_user_message_text(request.user_message, request.attachments)
    messages = [
        *session.messages,
        ChatMessage(role="user", content=composed_user_message or request.user_message or "[Uploaded content]"),
    ]
    settings = get_settings()

    try:
        if request.provider == "openai":
            model, output_text = await run_openai_agent(
                AgentRunRequest(
                    provider=request.provider,
                    model=request.model,
                    system_prompt=request.system_prompt,
                    messages=messages,
                    attachments=request.attachments,
                    temperature=request.temperature,
                    max_output_tokens=request.max_output_tokens,
                ),
                settings,
            )
        else:
            model, output_text = await run_gemini_agent(
                AgentRunRequest(
                    provider=request.provider,
                    model=request.model,
                    system_prompt=request.system_prompt,
                    messages=messages,
                    attachments=request.attachments,
                    temperature=request.temperature,
                    max_output_tokens=request.max_output_tokens,
                ),
                settings,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=format_provider_error(exc)) from exc

    updated_session = store.append_turn(
        session_id=session_id,
        user_message=composed_user_message or request.user_message or "[Uploaded content]",
        assistant_message=output_text,
        provider=request.provider,
        model=model,
        system_prompt=request.system_prompt,
    )
    if updated_session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return updated_session
