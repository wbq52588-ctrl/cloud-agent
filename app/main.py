import asyncio
from contextlib import asynccontextmanager
import json
import logging
from pathlib import Path
import re
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app.agent_service import build_turn_agent_request, execute_agent_request, format_provider_error, prepare_agent_request
from app.attachment_utils import build_user_message_text
from app.config import get_settings
from app.external_context import close_http_client
from app.logging_config import correlation_id, new_correlation_id, setup_logging
from app.rate_limit import make_rate_limit_dependency
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
from app.providers.deepseek_provider import run_deepseek_agent_stream
from app.session_store import SessionStore

logger = logging.getLogger(__name__)
_rate_limit_chat = make_rate_limit_dependency()


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging()
    get_settings()
    yield
    await close_http_client()


app = FastAPI(title="DeepSeek Workspace", lifespan=lifespan)

# CORS — allow configurable origins.
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    """Attach a correlation ID to every request for tracing."""
    cid = request.headers.get("X-Correlation-ID") or new_correlation_id()
    correlation_id.set(cid)
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = cid
    return response


stores: dict[str, SessionStore] = {}
public_dir = Path(__file__).resolve().parent.parent / "public"
static_dir = public_dir / "static"

if static_dir.exists():
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


def normalize_user_id(user_id: str | None) -> str:
    cleaned = (user_id or "").strip()
    if not cleaned:
        return "default"
    return re.sub(r"[^a-zA-Z0-9_.-]+", "_", cleaned)[:80] or "default"


def get_session_store(user_id: str | None) -> SessionStore:
    normalized = normalize_user_id(user_id)
    if normalized not in stores:
        settings = get_settings()
        base_path = Path(settings.session_store_path)
        if normalized == "default":
            store_path = base_path
        else:
            store_path = base_path.parent / "users" / normalized / base_path.name
        stores[normalized] = SessionStore(str(store_path), ttl_days=settings.session_ttl_days)
    return stores[normalized]


def require_access(x_access_password: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.app_access_password:
        return

    if not secrets.compare_digest(x_access_password or "", settings.app_access_password):
        raise HTTPException(status_code=401, detail="访问口令无效，请先登录")


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    index_file = public_dir / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Frontend not found")
    return FileResponse(index_file)


@app.get("/v1/public-config", response_model=PublicConfigResponse)
async def public_config(x_wecom_userid: str | None = Header(default=None)) -> PublicConfigResponse:
    settings = get_settings()
    return PublicConfigResponse(
        requires_password=bool(settings.app_access_password),
        supported_providers=["deepseek"],
        default_provider="deepseek",
        default_models={"deepseek": settings.default_deepseek_model},
        current_wecom_userid=x_wecom_userid,
    )


@app.post("/v1/client-log")
async def client_log(request: Request) -> dict[str, bool]:
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        payload = {"raw": (await request.body()).decode("utf-8", errors="replace")}
    logger.info("CLIENT_LOG payload=%s", payload)
    return {"ok": True}


@app.post("/v1/agent/run", response_model=AgentRunResponse)
async def run_agent(
    request: AgentRunRequest,
    x_access_password: str | None = Header(default=None),
    _rate_limit: None = Depends(_rate_limit_chat),
) -> AgentRunResponse:
    require_access(x_access_password)
    model, output_text, reasoning_text = await execute_agent_request(request, get_settings())
    return AgentRunResponse(
        provider=request.provider,
        model=model,
        output_text=output_text,
        reasoning_text=reasoning_text or None,
    )


@app.get("/v1/sessions", response_model=list[SessionSummary])
async def list_sessions(
    x_access_password: str | None = Header(default=None),
    x_wecom_userid: str | None = Header(default=None),
) -> list[SessionSummary]:
    require_access(x_access_password)
    return await get_session_store(x_wecom_userid).list_sessions()


@app.post("/v1/sessions", response_model=SessionDetail)
async def create_session(
    request: SessionCreateRequest,
    x_access_password: str | None = Header(default=None),
    x_wecom_userid: str | None = Header(default=None),
) -> SessionDetail:
    require_access(x_access_password)
    return await get_session_store(x_wecom_userid).create_session(request.title)


@app.get("/v1/sessions/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: str,
    x_access_password: str | None = Header(default=None),
    x_wecom_userid: str | None = Header(default=None),
) -> SessionDetail:
    require_access(x_access_password)
    session = await get_session_store(x_wecom_userid).get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.delete("/v1/sessions/{session_id}")
async def delete_session(
    session_id: str,
    x_access_password: str | None = Header(default=None),
    x_wecom_userid: str | None = Header(default=None),
) -> dict[str, bool]:
    require_access(x_access_password)
    deleted = await get_session_store(x_wecom_userid).delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True}


@app.post("/v1/sessions/{session_id}/chat", response_model=SessionDetail)
async def chat_session(
    session_id: str,
    request: ChatTurnRequest,
    x_access_password: str | None = Header(default=None),
    x_wecom_userid: str | None = Header(default=None),
    _rate_limit: None = Depends(_rate_limit_chat),
) -> SessionDetail:
    require_access(x_access_password)
    store = get_session_store(x_wecom_userid)
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    user_content = build_user_message_text(request.user_message, request.attachments)
    normalized_user_message = user_content or request.user_message or "[Uploaded content]"
    messages = [
        *session.messages,
        ChatMessage(role="user", content=normalized_user_message),
    ]

    model, output_text, reasoning_text = await execute_agent_request(
        build_turn_agent_request(messages, request),
        get_settings(),
    )

    updated_session = await store.append_turn(
        session_id=session_id,
        user_message=normalized_user_message,
        assistant_message=output_text,
        reasoning_content=reasoning_text or None,
        provider=request.provider,
        model=model,
        system_prompt=request.system_prompt,
    )
    if updated_session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return updated_session


@app.post("/v1/sessions/{session_id}/chat/stream")
async def chat_session_stream(
    session_id: str,
    request: ChatTurnRequest,
    x_access_password: str | None = Header(default=None),
    x_wecom_userid: str | None = Header(default=None),
    _rate_limit: None = Depends(_rate_limit_chat),
):
    require_access(x_access_password)
    store = get_session_store(x_wecom_userid)
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    user_content = build_user_message_text(request.user_message, request.attachments)
    normalized_user_message = user_content or request.user_message or "[Uploaded content]"
    messages = [
        *session.messages,
        ChatMessage(role="user", content=normalized_user_message),
    ]

    agent_request = build_turn_agent_request(messages, request)
    settings = get_settings()

    agent_request = await prepare_agent_request(agent_request)

    async def sse_generator():
        collected_content: list[str] = []
        collected_reasoning: list[str] = []
        model_used = agent_request.model or settings.default_deepseek_model
        try:
            # Send the model name first as an event.
            yield f"event: model\ndata: {json.dumps({'model': model_used})}\n\n"

            async for chunk_type, chunk_text in run_deepseek_agent_stream(agent_request, settings):
                if chunk_type == "done":
                    break
                elif chunk_type == "reasoning":
                    collected_reasoning.append(chunk_text)
                    yield f"event: thinking\ndata: {json.dumps({'content': chunk_text})}\n\n"
                elif chunk_type == "content":
                    collected_content.append(chunk_text)
                    yield f"event: progress\ndata: {json.dumps({'content': chunk_text})}\n\n"

            full_text = "".join(collected_content)
            full_reasoning = "".join(collected_reasoning) if collected_reasoning else None
            # Persist the completed turn.
            await store.append_turn(
                session_id=session_id,
                user_message=normalized_user_message,
                assistant_message=full_text,
                reasoning_content=full_reasoning,
                provider=request.provider,
                model=model_used,
                system_prompt=request.system_prompt,
            )
            yield f"event: final\ndata: {json.dumps({'session_id': session_id})}\n\n"

        except (GeneratorExit, asyncio.CancelledError):
            raise
        except Exception as exc:
            logger.error("SSE stream error: %s", repr(exc))
            detail = format_provider_error(exc)
            yield f"event: error\ndata: {json.dumps({'detail': detail})}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
