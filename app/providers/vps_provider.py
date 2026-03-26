import asyncio
import json
import os
import re
import socket
import subprocess
from typing import Any
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from app.schemas import AgentRunRequest

DEFAULT_MODEL = "vps-status"
MAX_OUTPUT = 12000
INTERNAL_HEALTH_URL = "http://127.0.0.1:10000/health"
DEFAULT_LOG_LINES = 120
ERROR_PATTERNS = re.compile(r"error|exception|traceback|failed|timeout|denied|refused|503|500", re.IGNORECASE)
WARN_PATTERNS = re.compile(r"warn|warning|deprecated", re.IGNORECASE)


def _clip(text: str) -> str:
    text = (text or "").strip()
    if len(text) <= MAX_OUTPUT:
        return text
    return text[:MAX_OUTPUT] + "\n\n[output truncated]"


def _line_count_from_request(request: AgentRunRequest, default: int = DEFAULT_LOG_LINES) -> int:
    user_messages = [m.content for m in request.messages if m.role == "user"]
    latest_user = user_messages[-1] if user_messages else ""
    match = re.search(r"(\d{1,4})", latest_user)
    if not match:
        return default
    return max(20, min(int(match.group(1)), 400))


def _run_command(args: list[str], timeout: int = 8) -> tuple[bool, str]:
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "CI": "1", "TERM": "dumb"},
        )
    except Exception as exc:
        return False, str(exc)

    output = ((result.stdout or "") + ("\n" + result.stderr if result.stderr else "")).strip()
    if result.returncode != 0:
        return False, output or f"exit={result.returncode}"
    return True, output


def _probe_url(url: str, timeout: int = 5) -> tuple[bool, str]:
    try:
        with urlopen(url, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace").strip()
            return 200 <= response.status < 300, body
    except URLError as exc:
        return False, str(exc.reason or exc)
    except Exception as exc:
        return False, str(exc)


def _guess_external_health_url() -> str | None:
    explicit = os.environ.get("VPS_STATUS_HEALTH_URL", "").strip()
    if explicit:
        return explicit

    bridge_url = os.environ.get("CODEX_BRIDGE_URL", "").strip()
    if bridge_url:
        parsed = urlparse(bridge_url)
        if parsed.hostname:
            return f"{parsed.scheme or 'http'}://{parsed.hostname}:18000/health"

    public_host = os.environ.get("PUBLIC_BASE_URL", "").strip()
    if public_host:
        parsed = urlparse(public_host)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}/health"

    try:
        host_ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        host_ip = ""
    if host_ip and not host_ip.startswith("127."):
        return f"http://{host_ip}:18000/health"
    return None


def _pick_lines(text: str, pattern: re.Pattern[str], limit: int = 3) -> list[str]:
    results: list[str] = []
    for line in text.splitlines():
        cleaned = line.strip()
        if cleaned and pattern.search(cleaned):
            results.append(cleaned)
        if len(results) >= limit:
            break
    return results


def _tail_lines(text: str, limit: int = 3) -> list[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines[-limit:]


def _format_status_reply(internal_ok: bool, internal_body: str, external_url: str | None, external_ok: bool, external_body: str) -> str:
    if internal_ok and external_url and external_ok:
        return (
            "结论：服务现在是活着的，而且对外入口也已经能正常访问。\n\n"
            f"我这样判断是因为容器内健康检查 `127.0.0.1:10000/health` 返回成功：`{internal_body or 'ok'}`，"
            f"同时外部入口 `{external_url}` 也返回成功：`{external_body or 'ok'}`。\n\n"
            "下一步如果你想更稳一点，我可以继续帮你补查最近一次请求日志。"
        )
    if internal_ok and external_url and not external_ok:
        return (
            "结论：应用已经在容器里正常跑起来了，但对外入口目前还不通。\n\n"
            f"我这样判断是因为容器内健康检查 `127.0.0.1:10000/health` 已经成功：`{internal_body or 'ok'}`，"
            f"但外部入口 `{external_url}` 失败了：`{external_body}`。\n\n"
            "下一步最值得查的是端口映射、反向代理，或者安全组/防火墙。"
        )
    if internal_ok:
        return (
            "结论：应用本身现在是活着的，至少容器内服务已经正常响应。\n\n"
            f"我这样判断是因为 `127.0.0.1:10000/health` 返回成功：`{internal_body or 'ok'}`。 这说明应用进程已经起来了。\n\n"
            "如果你愿意，我可以继续帮你补查外部入口是不是也已经打通。"
        )
    if external_url and external_ok:
        return (
            "结论：对外入口是通的，所以这个服务现在可以算在线。\n\n"
            f"我这样判断是因为 `{external_url}` 返回成功：`{external_body or 'ok'}`。 只是这次容器内自检没有拿到成功结果。\n\n"
            "如果你愿意，我可以继续追容器内部为什么没通过自检。"
        )
    extra = f"外部入口 `{external_url}` 的结果是：`{external_body}`。" if external_url else "这次我没有拿到可靠的外部入口地址。"
    return (
        "结论：现在还不能算服务在线，至少应用自检没有通过。\n\n"
        f"我这样判断是因为 `127.0.0.1:10000/health` 失败：`{internal_body}`。{extra}\n\n"
        "下一步最值得查的是应用日志、启动参数，或者容器是否刚重启完还没完全就绪。"
    )


def _format_log_reply(app_logs: str, bridge_logs: str, line_count: int) -> str:
    app_errors = _pick_lines(app_logs, ERROR_PATTERNS)
    bridge_errors = _pick_lines(bridge_logs, ERROR_PATTERNS)
    app_warnings = _pick_lines(app_logs, WARN_PATTERNS)
    recent_app = _tail_lines(app_logs)
    recent_bridge = _tail_lines(bridge_logs)
    if app_errors or bridge_errors:
        details = []
        if app_errors:
            details.append("应用日志里最值得注意的异常有：" + "；".join(f"`{line}`" for line in app_errors))
        if bridge_errors:
            details.append("bridge 日志里最值得注意的异常有：" + "；".join(f"`{line}`" for line in bridge_errors))
        return "结论：最近的日志里有明显异常，值得优先处理。\n\n" + "\n".join(details) + "\n\n下一步建议：先从最早出现的一条异常往上追 20 到 50 行上下文，我也可以继续帮你做这一步。"
    if app_warnings:
        warning_text = "；".join(f"`{line}`" for line in app_warnings)
        return (
            "结论：最近日志里没有特别硬的报错，但有一些值得留意的告警。\n\n"
            f"我先帮你摘出最显眼的几条：{warning_text}。\n\n"
            "下一步建议：如果你是在追某次失败请求，我可以继续按时间把相关日志串起来。"
        )
    app_recent_text = "；".join(f"`{line}`" for line in recent_app) if recent_app else "没有拿到应用最近日志"
    bridge_recent_text = "；".join(f"`{line}`" for line in recent_bridge) if recent_bridge else "没有拿到 bridge 最近日志"
    return (
        f"结论：最近 {line_count} 行里暂时没看到明显报错，整体更像是在正常收请求。\n\n"
        f"应用侧最近几条日志是：{app_recent_text}。\n"
        f"bridge 侧最近几条日志是：{bridge_recent_text}。\n\n"
        "下一步建议：如果你怀疑是偶发问题，我可以继续按错误关键词或某个时间点精确筛一轮。"
    )


def _build_prompt(request: AgentRunRequest, model: str) -> str:
    system_prompt = (
        request.system_prompt
        or "你是一个在 VPS 上协助排查和执行任务的中文助手。回答要自然、简洁、主动。"
        " 默认使用'结论 + 依据 + 下一步建议'的结构。除非用户明确要求，否则不要输出冗长命令轨迹。"
        " 遇到服务排查时，优先使用 docker、curl、ss、ps 这类方式，不要默认使用 systemctl、service、journalctl。"
        " 如果权限不足或信息不完整，要明确说出不确定性，不要把猜测说成结论。"
    )
    parts = [f"[SYSTEM]\n{system_prompt}", f"[MODEL]\n{model}"]
    for message in request.messages:
        parts.append(f"[{message.role.upper()}]\n{message.content}")
    if request.attachments:
        attachment_lines = []
        for item in request.attachments:
            if item.kind == "text" and item.text_content:
                attachment_lines.append(f"- {item.name}:\n{item.text_content}")
            else:
                attachment_lines.append(f"- {item.name} ({item.kind})")
        parts.append("[ATTACHMENTS]\n" + "\n".join(attachment_lines))
    parts.append("[STYLE]\n先给结论，再补 1 到 2 句依据；如果有价值，最后主动补一句下一步建议。")
    return "\n\n".join(parts)


def _bridge_request(prompt: str) -> str:
    bridge_url = os.environ.get("CODEX_BRIDGE_URL", "").strip()
    if not bridge_url:
        raise RuntimeError("missing CODEX_BRIDGE_URL")
    token = os.environ.get("CODEX_BRIDGE_TOKEN", "").strip()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = json.dumps({"prompt": prompt}).encode("utf-8")
    timeout = int(os.environ.get("PROVIDER_TIMEOUT_SECONDS", "90"))
    request = Request(bridge_url, data=payload, headers=headers, method="POST")
    with urlopen(request, timeout=timeout) as response:
        data: dict[str, Any] = json.loads(response.read().decode("utf-8", errors="replace"))
    if not data.get("ok"):
        raise RuntimeError(data.get("output") or "bridge failed")
    return _clip(str(data.get("output") or ""))


def _build_log_fallback_prompt(line_count: int) -> str:
    return (
        "请你在这台 VPS 上做一次轻量日志巡检，目标是 cloud-agent 服务和 codex-bridge。\n"
        f"优先查看 cloud-agent 容器最近 {line_count} 行日志，以及 /opt/codex-bridge/bridge.log 最近 {line_count} 行。\n"
        "只输出中文，格式固定为：结论、依据、下一步建议。\n"
        "如果没有明显报错，就明确说没有明显报错；如果有异常，只提最关键的 1 到 3 条，不要贴整段日志。"
    )


async def _run_vps_status() -> tuple[str, str]:
    external_url = _guess_external_health_url()
    internal_ok, internal_body = await asyncio.to_thread(_probe_url, INTERNAL_HEALTH_URL)
    if external_url:
        external_ok, external_body = await asyncio.to_thread(_probe_url, external_url)
    else:
        external_ok, external_body = False, "external health URL unavailable"
    return "vps-status", _clip(_format_status_reply(internal_ok, internal_body, external_url, external_ok, external_body))


async def _run_vps_logs(request: AgentRunRequest) -> tuple[str, str]:
    line_count = _line_count_from_request(request)
    app_ok, app_logs = await asyncio.to_thread(_run_command, ["docker", "logs", f"--tail={line_count}", "cloud-agent"], 12)
    bridge_ok, bridge_logs = await asyncio.to_thread(_run_command, ["tail", "-n", str(line_count), "/opt/codex-bridge/bridge.log"], 8)
    if app_ok or bridge_ok:
        return "vps-logs", _clip(_format_log_reply(app_logs if app_ok else "", bridge_logs if bridge_ok else "", line_count))
    fallback = await asyncio.to_thread(_bridge_request, _build_log_fallback_prompt(line_count))
    return "vps-logs", fallback


async def run_vps_agent(request: AgentRunRequest) -> tuple[str, str]:
    model = request.model or DEFAULT_MODEL
    if model == "vps-status":
        return await _run_vps_status()
    if model == "vps-logs":
        return await _run_vps_logs(request)
    prompt = _build_prompt(request, model)
    output_text = await asyncio.to_thread(_bridge_request, prompt)
    return model, output_text