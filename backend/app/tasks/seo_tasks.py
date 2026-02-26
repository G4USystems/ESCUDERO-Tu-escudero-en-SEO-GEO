"""Celery tasks for SEO/SERP operations."""

import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.celery_app import celery
import app.database as _db
from app.engines.seo.content_classifier import classify, classify_with_llm
from app.engines.seo import get_serp_provider
from app.models.job import BackgroundJob
from app.models.seo import ContentClassification, SerpQuery, SerpResult
from app.utils import cache, rate_limiter


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _celery_task(**kwargs):
    """Decorator: use celery.task when available, otherwise identity."""
    if celery is not None:
        return celery.task(**kwargs)
    return lambda fn: fn


@_celery_task(bind=True, name="seo.run_serp_query")
def run_serp_query(self, query_id: str, job_id: str | None = None):
    """Fetch SERP results for a single query."""
    return _run_async(_run_serp_query(query_id, job_id))


@_celery_task(bind=True, name="seo.run_serp_batch")
def run_serp_batch(self, query_ids: list[str], job_id: str | None = None):
    """Fetch SERP results for multiple queries."""
    return _run_async(_run_serp_batch(self, query_ids, job_id))


async def _run_serp_query(query_id: str, job_id: str | None) -> dict:
    async with _db.async_session() as session:
        result = await session.execute(
            select(SerpQuery).where(SerpQuery.id == uuid.UUID(query_id))
        )
        sq = result.scalar_one_or_none()
        if not sq:
            return {"error": f"SerpQuery {query_id} not found"}

        # Check cache
        cache_key = ("serp", sq.keyword, sq.location, sq.language)
        cached = await cache.get_cached(*cache_key)

        if cached:
            items = cached["items"]
        else:
            # Rate limit and fetch
            await rate_limiter.acquire("serp")
            provider = get_serp_provider()
            resp = await provider.search(
                sq.keyword,
                location=sq.location,
                language=sq.language,
            )
            items = [
                {
                    "url": item.url,
                    "domain": item.domain,
                    "title": item.title,
                    "snippet": item.snippet,
                    "position": item.position,
                    "result_type": item.result_type,
                }
                for item in resp.items
            ]
            # Cache for 7 days
            await cache.set_cached(*cache_key, value={"items": items}, ttl=cache.SERP_TTL)

        # Store results in DB
        for item in items:
            serp_result = SerpResult(
                query_id=sq.id,
                url=item["url"],
                domain=item["domain"],
                title=item["title"],
                snippet=item["snippet"],
                position=item["position"],
                result_type=item["result_type"],
            )
            session.add(serp_result)
            await session.flush()

            # Classify content (tiers 1-2 only, free)
            classification = classify(item["url"], item["title"])
            if classification.content_type == "other" and item["snippet"]:
                # Try LLM fallback for unclassified results
                try:
                    classification = await classify_with_llm(
                        item["url"], item["title"], item["snippet"]
                    )
                except Exception:
                    pass  # Keep as "other"

            cc = ContentClassification(
                serp_result_id=serp_result.id,
                content_type=classification.content_type,
                confidence=classification.confidence,
                classified_by=classification.classified_by,
            )
            session.add(cc)

        sq.last_fetched_at = datetime.now(timezone.utc)
        await session.commit()

        if job_id:
            await _update_job(session, job_id, status="completed", progress=1.0)

    return {"query_id": query_id, "results": len(items)}


async def _run_serp_batch(task, query_ids: list[str], job_id: str | None) -> dict:
    total = len(query_ids)
    completed = 0

    # Pre-load keyword names for progress step_info
    keyword_map: dict[str, str] = {}
    async with _db.async_session() as session:
        if job_id:
            await _update_job(session, job_id, status="running")
        for qid in query_ids:
            result = await session.execute(
                select(SerpQuery).where(SerpQuery.id == uuid.UUID(qid))
            )
            sq = result.scalar_one_or_none()
            if sq:
                keyword_map[qid] = sq.keyword

    for qid in query_ids:
        # Update step_info with current keyword before processing
        if job_id:
            async with _db.async_session() as session:
                await _update_job(
                    session, job_id,
                    step_info={
                        "current_keyword": keyword_map.get(qid, ""),
                        "step": completed + 1,
                        "total": total,
                    },
                )

        try:
            await _run_serp_query(qid, None)
        except Exception as e:
            print(f"Error fetching SERP for {qid}: {e}")

        completed += 1
        if job_id:
            async with _db.async_session() as session:
                await _update_job(
                    session, job_id,
                    progress=completed / total,
                )

    if job_id:
        async with _db.async_session() as session:
            await _update_job(session, job_id, status="completed", progress=1.0)

    return {"total": total, "completed": completed}


async def _update_job(session, job_id: str, **kwargs):
    result = await session.execute(
        select(BackgroundJob).where(BackgroundJob.id == uuid.UUID(job_id))
    )
    job = result.scalar_one_or_none()
    if not job:
        return
    for k, v in kwargs.items():
        if k == "status":
            setattr(job, k, v)
            if v == "running" and not job.started_at:
                job.started_at = datetime.now(timezone.utc)
            if v == "completed":
                job.completed_at = datetime.now(timezone.utc)
        elif k == "progress":
            job.progress = v
        elif k == "step_info":
            job.step_info = v
    await session.commit()
