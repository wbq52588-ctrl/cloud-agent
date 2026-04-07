from __future__ import annotations

from datetime import UTC, datetime
import json
from pathlib import Path
from threading import Lock
from uuid import uuid4

from app.schemas import ChatMessage, SessionDetail, SessionSummary


NEW_SESSION_TITLE = "新会话"


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _summarize_title(text: str) -> str:
    cleaned = " ".join(text.strip().split())
    if not cleaned:
        return NEW_SESSION_TITLE
    return cleaned[:28] + ("..." if len(cleaned) > 28 else "")


class SessionStore:
    def __init__(self, store_path: str) -> None:
        self._lock = Lock()
        self._store_path = Path(store_path)
        self._sessions: dict[str, SessionDetail] = {}
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        self._load()

    def _sorted_sessions(self) -> list[SessionDetail]:
        return sorted(
            self._sessions.values(),
            key=lambda session: session.updated_at,
            reverse=True,
        )

    def _load(self) -> None:
        if not self._store_path.exists():
            return

        payload = json.loads(self._store_path.read_text(encoding="utf-8"))
        self._sessions = {
            item["session_id"]: SessionDetail.model_validate(item)
            for item in payload
        }

    def _save(self) -> None:
        payload = [session.model_dump() for session in self._sorted_sessions()]
        temp_path = self._store_path.with_suffix(f"{self._store_path.suffix}.tmp")
        temp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temp_path.replace(self._store_path)

    def create_session(self, title: str | None = None) -> SessionDetail:
        with self._lock:
            session_id = uuid4().hex
            session = SessionDetail(
                session_id=session_id,
                title=(title or "").strip() or NEW_SESSION_TITLE,
                provider=None,
                model=None,
                updated_at=_now_iso(),
                message_count=0,
                system_prompt=None,
                messages=[],
            )
            self._sessions[session_id] = session
            self._save()
            return SessionDetail.model_validate(session.model_dump())

    def list_sessions(self) -> list[SessionSummary]:
        with self._lock:
            return [
                SessionSummary(
                    session_id=session.session_id,
                    title=session.title,
                    provider=session.provider,
                    model=session.model,
                    updated_at=session.updated_at,
                    message_count=session.message_count,
                )
                for session in self._sorted_sessions()
            ]

    def get_session(self, session_id: str) -> SessionDetail | None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            return SessionDetail.model_validate(session.model_dump())

    def delete_session(self, session_id: str) -> bool:
        with self._lock:
            if session_id not in self._sessions:
                return False
            del self._sessions[session_id]
            self._save()
            return True

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

            if session.title == NEW_SESSION_TITLE:
                session.title = _summarize_title(user_message)

            session.system_prompt = system_prompt
            session.provider = provider
            session.model = model
            session.messages.append(ChatMessage(role="user", content=user_message))
            session.messages.append(ChatMessage(role="assistant", content=assistant_message))
            session.message_count = len(session.messages)
            session.updated_at = _now_iso()
            self._save()
            return SessionDetail.model_validate(session.model_dump())
