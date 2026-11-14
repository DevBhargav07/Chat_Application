import json
import logging
import time
from datetime import datetime, timezone
from typing import List, Optional

from redis.asyncio import Redis

from app.chat_manager import MESSAGE_TTL
from app.config import settings

logger = logging.getLogger(__name__)

CACHE_SIZE = 100                              # newest messages kept per conversation
LIST_TTL = int(MESSAGE_TTL.total_seconds())   # the list can never outlive its messages
READY_TTL = 600                               # trust the cache for 10 min, then rebuild from the DB
PAUSE_AFTER_FAILURE = 30                      # seconds to skip Redis after an error

# No REDIS_URL = no cache. Everything keeps working straight from the database.
_redis: Optional[Redis] = (
    Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=1.5,   # a slow Redis must never hold up a chat message
        socket_timeout=1.5,
        health_check_interval=30,
        max_connections=10,
        protocol=2,
    )
    if settings.redis_url
    else None
)
_paused_until = 0.0


def _usable() -> bool:
    return _redis is not None and time.monotonic() >= _paused_until


def _pause(reason: str) -> None:
    global _paused_until
    _paused_until = time.monotonic() + PAUSE_AFTER_FAILURE
    logger.warning("messages cache paused for %ss: %s", PAUSE_AFTER_FAILURE, reason, exc_info=True)


def _list_key(conversation_id: int) -> str:
    return f"chat:conv:{conversation_id}:recent"


def _ready_key(conversation_id: int) -> str:
    return f"chat:conv:{conversation_id}:ready"


def _dump(message: dict) -> str:
    return json.dumps(message, sort_keys=True, separators=(",", ":"))


async def ping() -> bool:
    if _redis is None:
        return False
    try:
        return bool(await _redis.ping())
    except Exception:
        return False


async def get_first_page(conversation_id: int, limit: int) -> Optional[dict]:
    """The newest `limit` messages from the cache, or None on a miss / Redis problem."""
    if not _usable():
        return None
    try:
        pipe = _redis.pipeline()
        pipe.exists(_ready_key(conversation_id))
        pipe.zrevrange(_list_key(conversation_id), 0, CACHE_SIZE - 1)
        ready, raw = await pipe.execute()
    except Exception:
        _pause("read failed")
        return None

    if not ready or not raw:
        return None

    now = datetime.now(timezone.utc)
    by_id = {}
    for item in raw:                                   # newest first
        message = json.loads(item)
        expires_at = message["expires_at"].replace("Z", "+00:00")
        if datetime.fromisoformat(expires_at) > now:
            by_id.setdefault(message["id"], message)   # also drops accidental duplicates
    items = list(by_id.values())
    if not items:
        return None

    has_more = len(items) > limit or len(items) >= CACHE_SIZE
    page = list(reversed(items[:limit]))               # oldest first, like the database path
    return {
        "items": page,
        "has_more": has_more,
        "next_cursor": page[0]["id"] if has_more else None,
    }


async def populate(conversation_id: int, newest_first: List[dict]) -> None:
    """Fill the cache after reading the newest messages from the database."""
    if not _usable() or not newest_first:
        return
    try:
        key = _list_key(conversation_id)
        pipe = _redis.pipeline()
        pipe.zadd(key, {_dump(m): m["id"] for m in newest_first})
        pipe.zremrangebyrank(key, 0, -(CACHE_SIZE + 1))
        pipe.expire(key, LIST_TTL)
        pipe.set(_ready_key(conversation_id), "1", ex=READY_TTL)
        await pipe.execute()
    except Exception:
        _pause("populate failed")


async def add_message(message: dict) -> None:
    """Call right after a message is saved. Always adds; the ready flag decides if reads trust it."""
    if not _usable():
        return
    try:
        key = _list_key(message["conversation_id"])
        pipe = _redis.pipeline()
        pipe.zadd(key, {_dump(message): message["id"]})
        pipe.zremrangebyrank(key, 0, -(CACHE_SIZE + 1))
        pipe.expire(key, LIST_TTL)
        await pipe.execute()
    except Exception:
        _pause("write failed")

USER_CACHE_TTL = 300 # 5 minutes
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User
from sqlalchemy import select

async def get_user_cache_or_db(user_id: int, redis, db: AsyncSession):
    cache_key = f"user:{user_id}"

    # try fetch from cache first
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    # cache missed: calling db
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return None

    # serialize user data
    user_data = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser
    }
    await redis.set(cache_key, json.dumps(user_data), ex=USER_CACHE_TTL)
    return user_data