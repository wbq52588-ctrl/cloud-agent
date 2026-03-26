import re
from asyncio import create_subprocess_shell
from asyncio.subprocess import PIPE

from app.schemas import AgentRunRequest

MODEL_COMMANDS: dict[str, str] = {
    "vps-run": "systemctl start codex-repo-automation.service && echo 'Triggered codex-repo-automation.service'",
    "vps-status": "systemctl status codex-repo-automation.service --no-pager || true",
    "vps-logs": "tail -n 120 /root/codex-automation/logs/repo-automation.log || true",
    "vps-timer": "systemctl list-timers codex-repo-automation.timer --no-pager || true",
    "vps-branch": "cd /root/codex-automation/repos/main && git branch -vv && echo && git log --oneline --decorate -n 8",
}

DEFAULT_MODEL = "vps-status"
MAX_OUTPUT = 12000


def _line_count_from_message(user_message: str) -> int | None:
    if not user_message:
        return None
    match = re.search(r"(\d{1,4})", user_message)
    if not match:
        return None
    value = int(match.group(1))
    return max(20, min(value, 400))


def _resolve_command(request: AgentRunRequest, model: str) -> str:
    base = MODEL_COMMANDS.get(model, MODEL_COMMANDS[DEFAULT_MODEL])
    if model != "vps-logs":
        return base

    # Allow users to request a different tail length with natural language numbers.
    user_messages = [m.content for m in request.messages if m.role == "user"]
    latest_user = user_messages[-1] if user_messages else ""
    lines = _line_count_from_message(latest_user)
    if not lines:
        return base
    return f"tail -n {lines} /root/codex-automation/logs/repo-automation.log || true"


async def run_vps_agent(request: AgentRunRequest) -> tuple[str, str]:
    model = request.model or DEFAULT_MODEL
    command = _resolve_command(request, model)

    proc = await create_subprocess_shell(command, stdout=PIPE, stderr=PIPE)
    stdout, stderr = await proc.communicate()

    combined = (stdout or b"").decode(errors="replace")
    if stderr:
        combined += "\n" + stderr.decode(errors="replace")

    combined = combined.strip()
    if not combined:
        combined = "Command finished with no output."

    if len(combined) > MAX_OUTPUT:
        combined = combined[:MAX_OUTPUT] + "\n\n[output truncated]"

    return model, combined
