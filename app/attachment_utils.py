from __future__ import annotations

import base64
from urllib.parse import unquote_to_bytes

from app.schemas import Attachment


def build_user_message_text(user_message: str, attachments: list[Attachment]) -> str:
    chunks: list[str] = []
    if user_message.strip():
        chunks.append(user_message.strip())

    text_attachments = [item for item in attachments if item.kind == "text" and item.text_content]
    image_attachments = [item for item in attachments if item.kind == "image"]

    for attachment in text_attachments:
        chunks.append(
            "\n\n".join(
                [
                    f"[Uploaded file: {attachment.name}]",
                    attachment.text_content or "",
                ]
            )
        )

    if image_attachments:
        names = ", ".join(item.name for item in image_attachments)
        chunks.append(f"[Uploaded image(s): {names}]")

    return "\n\n".join(chunk for chunk in chunks if chunk).strip()


def parse_data_url(data_url: str) -> tuple[str, bytes]:
    header, payload = data_url.split(",", 1)
    mime_type = header.split(";")[0].split(":", 1)[1]
    if ";base64" in header:
        return mime_type, base64.b64decode(payload)
    return mime_type, unquote_to_bytes(payload)
