from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.providers.gemini_provider import run_gemini_agent
from app.providers.openai_provider import run_openai_agent
from app.schemas import (
    AgentRunRequest,
    AgentRunResponse,
    ChatMessage,
    ChatTurnRequest,
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


@app.get("/", response_class=FileResponse)
async def index() -> FileResponse:
    return FileResponse("app/templates/index.html")


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/agent/run", response_model=AgentRunResponse)
async def run_agent(request: AgentRunRequest) -> AgentRunResponse:
    settings = get_settings()

    try:
        if request.provider == "openai":
            model, output_text = await run_openai_agent(request, settings)
        else:
            model, output_text = await run_gemini_agent(request, settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agent run failed: {exc}") from exc

    return AgentRunResponse(
        provider=request.provider,
        model=model,
        output_text=output_text,
    )


@app.get("/v1/sessions", response_model=list[SessionSummary])
async def list_sessions() -> list[SessionSummary]:
    return store.list_sessions()


@app.post("/v1/sessions", response_model=SessionDetail)
async def create_session(request: SessionCreateRequest) -> SessionDetail:
    return store.create_session(request.title)


@app.get("/v1/sessions/{session_id}", response_model=SessionDetail)
async def get_session(session_id: str) -> SessionDetail:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/v1/sessions/{session_id}/chat", response_model=SessionDetail)
async def chat_session(session_id: str, request: ChatTurnRequest) -> SessionDetail:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = [
        *session.messages,
        ChatMessage(role="user", content=request.user_message),
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
                    temperature=request.temperature,
                    max_output_tokens=request.max_output_tokens,
                ),
                settings,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agent run failed: {exc}") from exc

    updated_session = store.append_turn(
        session_id=session_id,
        user_message=request.user_message,
        assistant_message=output_text,
        provider=request.provider,
        model=model,
        system_prompt=request.system_prompt,
    )
    if updated_session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return updated_session
