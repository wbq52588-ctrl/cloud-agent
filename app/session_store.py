from __future__ import annotations

from datetime import UTC, datetime
from threading import Lock
from uuid import uuid4

from app.schemas import ChatMessage, SessionDetail, SessionSummary


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class SessionStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._sessions: dict[str, SessionDetail] = {}

    def create_session(self, title: str | None = None) -> SessionDetail:
        with self._lock:
            session_id = uuid4().hex
            session = SessionDetail(
                session_id=session_id,
                title=title or "New chat",
                provider=None,
                model=None,
                updated_at=_now_iso(),
                message_count=0,
                system_prompt=None,
                messages=[],
            )
            self._sessions[session_id] = session
            return session

    def list_sessions(self) -> list[SessionSummary]:
        with self._lock:
            sessions = sorted(
                self._sessions.values(),
                key=lambda session: session.updated_at,
                reverse=True,
            )
            return [
                SessionSummary(
                    session_id=session.session_id,
                    title=session.title,
                    provider=session.provider,
                    model=session.model,
                    updated_at=session.updated_at,
                    message_count=session.message_count,
                )
                for session in sessions
            ]

    def get_session(self, session_id: str) -> SessionDetail | None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            return SessionDetail.model_validate(session.model_dump())

    def append_turn(
        self,
        session_id: str,
        user_message: str,
        assistant_message: str,
        provider: str,
        model: str,
        system_prompt: str | None,
    ) -> SessionDetail | None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None

            if session.title == "New chat":
                session.title = user_message[:40]

            session.system_prompt = system_prompt
            session.provider = provider
            session.model = model
            session.messages.append(ChatMessage(role="user", content=user_message))
            session.messages.append(ChatMessage(role="assistant", content=assistant_message))
            session.message_count = len(session.messages)
            session.updated_at = _now_iso()
            return SessionDetail.model_validate(session.model_dump())
