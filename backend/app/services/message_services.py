from datetime import datetime, timezone
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Message
from app.paginations import CursorPage, decode_cursor, encode_cursor


async def get_conversation_messages(
    db: AsyncSession,
    conversation_id: int,  # or UUID if you use UUIDs
    limit: int = 30,
    cursor: str | None = None,
) -> CursorPage:
    now = datetime.now(timezone.utc)

    stmt = (
        select(Message)
        .where(
            Message.conversation_id == conversation_id,
            # Automatically hide expired messages at query time
            or_(Message.expires_at.is_(None), Message.expires_at > now),
        )
        .order_by(Message.sent_at.desc(), Message.id.desc())
        .limit(limit + 1)  # fetch 1 extra to detect has_more without COUNT(*)
    )

    if cursor:
        cursor_ts, cursor_id = decode_cursor(cursor)
        # Cast cursor_id to int(...) if your Message.id is an Integer
        parsed_id = int(cursor_id)
        stmt = stmt.where(
            or_(
                Message.sent_at < cursor_ts,
                and_(Message.sent_at == cursor_ts, Message.id < parsed_id),
            )
        )

    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    has_more = len(rows) > limit
    page_rows = rows[:limit]

    # Next cursor points to the oldest message in this batch
    next_cursor = (
        encode_cursor(page_rows[-1].sent_at, page_rows[-1].id)
        if has_more and page_rows
        else None
    )

    # Reverse so frontend receives chronological order (oldest -> newest)
    page_rows.reverse()

    return CursorPage(items=page_rows, next_cursor=next_cursor, has_more=has_more)