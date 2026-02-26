"""Token-bucket rate limiter (per LLM/SERP provider).

Uses Redis when redis_url is set, otherwise falls back to in-memory tracking.
"""

import asyncio
import time

from app.config import settings

_use_redis = bool(settings.redis_url)

# Requests-per-minute limits from config
_RPM_MAP = {
    "openai": settings.openai_rpm,
    "anthropic": settings.anthropic_rpm,
    "gemini": settings.gemini_rpm,
    "perplexity": settings.perplexity_rpm,
    "serp": settings.serp_rpm,
}

# ---------------------------------------------------------------------------
# In-memory fallback
# ---------------------------------------------------------------------------
_mem_last: dict[str, float] = {}


async def _mem_acquire(provider: str, interval: float) -> None:
    while True:
        now = time.time()
        last = _mem_last.get(provider)
        if last is None or (now - last) >= interval:
            _mem_last[provider] = now
            return
        wait = interval - (now - last)
        await asyncio.sleep(wait)


# ---------------------------------------------------------------------------
# Redis backend
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

async def acquire(provider: str) -> None:
    """Wait until a request slot is available for *provider*."""
    rpm = _RPM_MAP.get(provider, 60)
    interval = 60.0 / rpm  # minimum seconds between requests

    if not _use_redis:
        await _mem_acquire(provider, interval)
        return

    key = f"rate:{provider}:last"
    r = await _get_redis()
    while True:
        now = time.time()
        last = await r.get(key)
        if last is None or (now - float(last)) >= interval:
            await r.set(key, str(now), ex=120)
            return
        wait = interval - (now - float(last))
        await asyncio.sleep(wait)
