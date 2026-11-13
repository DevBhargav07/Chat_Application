import base64
from datetime import datetime
from typing import Generic, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class CursorPage(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: Optional[str] = None
    has_more: bool


def encode_cursor(created_at: datetime, msg_id: str | int) -> str:
    raw = f"{created_at.isoformat()}|{msg_id}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        ts_str, msg_id = raw.split("|", 1)
        return datetime.fromisoformat(ts_str), msg_id
    except Exception as exc:
        raise ValueError("Invalid pagination cursor") from exc