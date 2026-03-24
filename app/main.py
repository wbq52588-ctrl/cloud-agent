from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from app.config import get_settings
from app.providers.gemini_provider import run_gemini_agent
from app.providers.openai_provider import run_openai_agent
from app.schemas import AgentRunRequest, AgentRunResponse


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings()
    yield


app = FastAPI(title="Multi Model Agent", lifespan=lifespan)


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
