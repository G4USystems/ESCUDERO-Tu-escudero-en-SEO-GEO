"""Response cache for LLM and SERP calls.

Uses Redis when redis_url is set, otherwise falls back to an in-memory dict.
"""

import hashlib
import json
import time

from app.config import settings

# TTLs in seconds
LLM_TTL = 24 * 3600       # 24 hours
SERP_TTL = 7 * 24 * 3600  # 7 days
DOMAIN_TTL = 0             # indefinite (no expiry)

_use_redis = bool(settings.redis_url)


def _cache_key(namespace: str, *parts: str) -> str:
    raw = "|".join(parts)
    h = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"cache:{namespace}:{h}"


# ---------------------------------------------------------------------------
# In-memory fallback (used when redis_url is empty)
# ---------------------------------------------------------------------------
_mem_store: dict[str, tuple[str, float]] = {}  # key -> (json_str, expire_at)


async def _mem_get(key: str) -> str | None:
    entry = _mem_store.get(key)
    if entry is None:
        return None
    val, expire_at = entry
    if expire_at > 0 and time.time() > expire_at:
        del _mem_store[key]
        return None
    return val


async def _mem_set(key: str, value: str, ex: int = 0) -> None:
    expire_at = (time.time() + ex) if ex > 0 else 0
    _mem_store[key] = (value, expire_at)


# ---------------------------------------------------------------------------
# Redis backend (used when redis_url is set)
# ---------------------------------------------------------------------------
_redis = None


async def _get_redis():
    global _redis
    if _redis is None:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_cached(namespace: str, *parts: str) -> dict | None:
    """Return cached JSON value or None."""
    key = _cache_key(namespace, *parts)
    if _use_redis:
        r = await _get_redis()
        data = await r.get(key)
    else:
        data = await _mem_get(key)
    if data:
        return json.loads(data)
    return None


async def set_cached(namespace: str, *parts: str, value: dict, ttl: int = LLM_TTL) -> None:
    """Store a JSON-serialisable value in cache."""
    key = _cache_key(namespace, *parts)
    payload = json.dumps(value, ensure_ascii=False)
    if _use_redis:
        r = await _get_redis()
        if ttl > 0:
            await r.set(key, payload, ex=ttl)
        else:
            await r.set(key, payload)
    else:
        await _mem_set(key, payload, ex=ttl)
