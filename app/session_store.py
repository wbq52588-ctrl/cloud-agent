from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
import json
from pathlib import Path
from uuid import uuid4

import aiosqlite

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
    """SQLite-backed session store with per-session incremental writes and TTL expiry."""

    def __init__(self, store_path: str, ttl_days: int = 30) -> None:
        self._store_path = Path(store_path)
        self._ttl = timedelta(days=ttl_days)
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        self._db: aiosqlite.Connection | None = None
        self._init_lock = asyncio.Lock()

    async def _get_db(self) -> aiosqlite.Connection:
        if self._db is not None:
            return self._db
        async with self._init_lock:
            if self._db is not None:  # Double-check inside the lock.
                return self._db
            self._db = await aiosqlite.connect(str(self._store_path))
            self._db.row_factory = aiosqlite.Row
            await self._db.execute("PRAGMA journal_mode=WAL")
            await self._db.execute("PRAGMA foreign_keys=ON")
            await self._db.executescript("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id   TEXT PRIMARY KEY,
                    title        TEXT NOT NULL,
                    provider     TEXT,
                    model        TEXT,
                    system_prompt TEXT,
                    updated_at   TEXT NOT NULL,
                    message_count INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id  TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
                    role        TEXT NOT NULL,
                    content     TEXT NOT NULL,
                    reasoning_content TEXT,
                    created_at  TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_messages_session
                    ON messages(session_id, id);
            """)
            # Migration: add reasoning_content column for existing databases.
            try:
                await self._db.execute(
                    "ALTER TABLE messages ADD COLUMN reasoning_content TEXT"
                )
            except aiosqlite.OperationalError:
                pass  # Column already exists.
            await self._db.commit()
            return self._db

    async def _purge_expired(self, db: aiosqlite.Connection) -> None:
        cutoff = (datetime.now(UTC) - self._ttl).isoformat()
        await db.execute("DELETE FROM sessions WHERE updated_at < ?", (cutoff,))
        await db.commit()

    async def create_session(self, title: str | None = None) -> SessionDetail:
        db = await self._get_db()
        session_id = uuid4().hex
        final_title = (title or "").strip() or NEW_SESSION_TITLE
        now = _now_iso()
        await db.execute(
            """INSERT INTO sessions (session_id, title, updated_at, message_count)
               VALUES (?, ?, ?, 0)""",
            (session_id, final_title, now),
        )
        await db.commit()
        return SessionDetail(
            session_id=session_id,
            title=final_title,
            provider=None,
            model=None,
            updated_at=now,
            message_count=0,
            system_prompt=None,
            messages=[],
        )

    async def list_sessions(self) -> list[SessionSummary]:
        db = await self._get_db()
        await self._purge_expired(db)
        rows = await db.execute(
            """SELECT session_id, title, provider, model, updated_at, message_count
               FROM sessions
               ORDER BY updated_at DESC"""
        )
        return [
            SessionSummary(
                session_id=row["session_id"],
                title=row["title"],
                provider=row["provider"],
                model=row["model"],
                updated_at=row["updated_at"],
                message_count=row["message_count"],
            )
            for row in await rows.fetchall()
        ]

    async def get_session(self, session_id: str) -> SessionDetail | None:
        db = await self._get_db()
        row = await db.execute(
            """SELECT session_id, title, provider, model, system_prompt, updated_at, message_count
               FROM sessions WHERE session_id = ?""",
            (session_id,),
        )
        session_row = await row.fetchone()
        if session_row is None:
            return None

        msg_rows = await db.execute(
            "SELECT role, content, reasoning_content FROM messages WHERE session_id = ? ORDER BY id",
            (session_id,),
        )
        def _safe_msg(row) -> ChatMessage:
            content = row["content"] or ""
            if not content.strip():
                content = "（空消息）"
            return ChatMessage(
                role=row["role"],
                content=content,
                reasoning_content=row["reasoning_content"],
            )

        messages = [_safe_msg(row) for row in await msg_rows.fetchall()]
        return SessionDetail(
            session_id=session_row["session_id"],
            title=session_row["title"],
            provider=session_row["provider"],
            model=session_row["model"],
            system_prompt=session_row["system_prompt"],
            updated_at=session_row["updated_at"],
            message_count=session_row["message_count"],
            messages=messages,
        )

    async def delete_session(self, session_id: str) -> bool:
        db = await self._get_db()
        cursor = await db.execute(
            "DELETE FROM sessions WHERE session_id = ?", (session_id,)
        )
        await db.commit()
        return cursor.rowcount > 0

    async def append_turn(
        self,
        session_id: str,
        user_message: str,
        assistant_message: str,
        provider: str,
        model: str,
        system_prompt: str | None,
        reasoning_content: str | None = None,
    ) -> SessionDetail | None:
        db = await self._get_db()
        session_row = await (await db.execute(
            "SELECT session_id, title FROM sessions WHERE session_id = ?",
            (session_id,),
        )).fetchone()

        if session_row is None:
            return None

        title = session_row["title"]
        if title == NEW_SESSION_TITLE:
            title = _summarize_title(user_message)

        now = _now_iso()
        await db.execute(
            """UPDATE sessions
               SET title = ?, provider = ?, model = ?, system_prompt = ?,
                   updated_at = ?, message_count = message_count + 2
               WHERE session_id = ?""",
            (title, provider, model, system_prompt, now, session_id),
        )
        await db.execute(
            "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (session_id, "user", user_message, now),
        )
        safe_assistant = assistant_message.strip() or "（无响应内容）"
        await db.execute(
            "INSERT INTO messages (session_id, role, content, reasoning_content, created_at) VALUES (?, ?, ?, ?, ?)",
            (session_id, "assistant", safe_assistant, reasoning_content, now),
        )
        await db.commit()

        return await self.get_session(session_id)
