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
    next_cursor = page[0]["id"] if has_more and page else None
    # from app.paginations import encode_cursor
    # sent_at_dt = datetime.fromisoformat(page[0]["sent_at"].replace("Z", "+00:00")) if page else None
    # next_cursor = encode_cursor(sent_at_dt, page[0]["id"]) if has_more and page else None

    return {
        "items": page,
        "has_more": has_more,
        "next_cursor": next_cursor,
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

USER_CACHE_TTL = 300       # 5 minutes
PROFILE_CACHE_TTL = 300    # 5 minutes
REVOKE_TTL = 86400         # 24 hours (covers token expiry)


async def get_user_cached(user_id: int) -> Optional[dict]:
    """Retrieve user basic info from Redis cache if available."""
    if not _usable():
        return None
    try:
        raw = await _redis.get(f"user:{user_id}")
        return json.loads(raw) if raw else None
    except Exception:
        _pause("get_user_cached failed")
        return None


async def set_user_cached(user_id: int, user_data: dict, ttl: int = USER_CACHE_TTL) -> None:
    """Store user basic info in Redis with TTL."""
    if not _usable() or not user_data:
        return
    try:
        await _redis.set(f"user:{user_id}", json.dumps(user_data), ex=ttl)
    except Exception:
        _pause("set_user_cached failed")


async def invalidate_user(user_id: int) -> None:
    """Delete user cache from Redis."""
    if not _usable():
        return
    try:
        await _redis.delete(f"user:{user_id}")
    except Exception:
        _pause("invalidate_user failed")


async def revoke_user(user_id: int, ttl: int = REVOKE_TTL) -> None:
    """Mark a user as revoked/logged out across all sessions/tabs."""
    if not _usable():
        return
    try:
        pipe = _redis.pipeline()
        pipe.set(f"revoked_user:{user_id}", "1", ex=ttl)
        pipe.delete(f"user:{user_id}")
        pipe.delete(f"user:{user_id}:profile")
        await pipe.execute()
    except Exception:
        _pause("revoke_user failed")


async def unrevoke_user(user_id: int) -> None:
    """Clear revocation when user is reactivated or re-logs in."""
    if not _usable():
        return
    try:
        await _redis.delete(f"revoked_user:{user_id}")
    except Exception:
        _pause("unrevoke_user failed")


async def is_user_revoked(user_id: int) -> bool:
    """Check if the user session has been revoked."""
    if not _usable():
        return False
    try:
        return bool(await _redis.exists(f"revoked_user:{user_id}"))
    except Exception:
        _pause("is_user_revoked failed")
        return False


async def get_profile_cached(user_id: int) -> Optional[dict]:
    """Retrieve user profile (groups & permissions) from Redis."""
    if not _usable():
        return None
    try:
        raw = await _redis.get(f"user:{user_id}:profile")
        return json.loads(raw) if raw else None
    except Exception:
        _pause("get_profile_cached failed")
        return None


async def set_profile_cached(user_id: int, profile_data: dict, ttl: int = PROFILE_CACHE_TTL) -> None:
    """Cache user profile in Redis."""
    if not _usable() or not profile_data:
        return
    try:
        # Custom serializer handles datetime fields (e.g. created_at)
        def _default_serializer(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

        payload = json.dumps(profile_data, default=_default_serializer)
        await _redis.set(f"user:{user_id}:profile", payload, ex=ttl)
    except Exception:
        _pause("set_profile_cached failed")


async def invalidate_profile_cache(user_id: int) -> None:
    """Invalidate profile cache when permissions/groups change."""
    if not _usable():
        return
    try:
        await _redis.delete(f"user:{user_id}:profile")
    except Exception:
        _pause("invalidate_profile_cache failed")