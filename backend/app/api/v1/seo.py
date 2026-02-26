"""SEO/SERP API endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.job import BackgroundJob
from app.models.seo import ContentClassification, SerpQuery, SerpResult
from app.schemas.geo import JobStatusResponse
from app.schemas.seo import (
    ClassificationResponse,
    ClassifyRequest,
    SerpQueryBatchCreate,
    SerpQueryCreate,
    SerpQueryResponse,
    SerpQueryUpdate,
    SerpQueryWithResults,
    SerpResultResponse,
)

router = APIRouter(prefix="/seo", tags=["seo"])


@router.post("/queries", response_model=SerpQueryResponse, status_code=201)
async def create_serp_query(data: SerpQueryCreate, db: AsyncSession = Depends(get_db)):
    """Create a SERP query to track."""
    query = SerpQuery(
        project_id=data.project_id,
        keyword=data.keyword,
        language=data.language,
        location=data.location,
        niche=data.niche,
    )
    db.add(query)
    await db.commit()
    await db.refresh(query)
    return query


@router.post("/queries/batch", response_model=JobStatusResponse, status_code=201)
async def create_batch_serp_queries(data: SerpQueryBatchCreate, db: AsyncSession = Depends(get_db)):
    """Create multiple SERP queries and launch a batch fetch job."""
    queries = []
    for kw in data.keywords:
        q = SerpQuery(
            project_id=data.project_id,
            keyword=kw,
            language=data.language,
            location=data.location,
            niche=data.niche,
        )
        db.add(q)
        queries.append(q)

    await db.flush()

    # Create background job
    job = BackgroundJob(project_id=data.project_id, job_type="serp_batch")
    db.add(job)
    await db.flush()

    # Dispatch task (Celery if Redis available, otherwise inline)
    from app.tasks.inline_runner import use_inline

    query_ids = [str(q.id) for q in queries]
    job_id_str = str(job.id)

    if use_inline():
        from app.tasks.seo_tasks import _run_serp_batch
        from app.tasks.inline_runner import dispatch_inline

        await db.commit()
        dispatch_inline(
            lambda: _run_serp_batch(None, query_ids, job_id_str),
            job_id=job_id_str,
        )
    else:
        from app.tasks.seo_tasks import run_serp_batch

        task = run_serp_batch.delay(query_ids, str(job.id))
        job.celery_task_id = task.id
        await db.commit()

    await db.refresh(job)
    return job


@router.get("/queries", response_model=list[SerpQueryResponse])
async def list_serp_queries(
    project_id: uuid.UUID,
    niche: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List SERP queries for a project, optionally filtered by niche."""
    query = select(SerpQuery).where(SerpQuery.project_id == project_id)
    if niche:
        query = query.where(SerpQuery.niche == niche)
    query = query.order_by(SerpQuery.created_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/queries/{query_id}/results", response_model=SerpQueryWithResults)
async def get_query_results(query_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get a SERP query with its results and classifications."""
    result = await db.execute(
        select(SerpQuery)
        .where(SerpQuery.id == query_id)
        .options(selectinload(SerpQuery.results).selectinload(SerpResult.classification))
    )
    query = result.scalar_one_or_none()
    if not query:
        raise HTTPException(404, "SERP query not found")

    # Map results with classification
    results = []
    for r in query.results:
        ct = r.classification
        results.append(
            SerpResultResponse(
                id=r.id,
                query_id=r.query_id,
                url=r.url,
                domain=r.domain,
                title=r.title,
                snippet=r.snippet,
                position=r.position,
                result_type=r.result_type,
                fetched_at=r.fetched_at,
                content_type=ct.content_type if ct else None,
                content_confidence=ct.confidence if ct else None,
            )
        )

    return SerpQueryWithResults(
        id=query.id,
        project_id=query.project_id,
        keyword=query.keyword,
        language=query.language,
        location=query.location,
        niche=query.niche,
        last_fetched_at=query.last_fetched_at,
        created_at=query.created_at,
        results=sorted(results, key=lambda r: r.position),
    )


@router.put("/queries/{query_id}", response_model=SerpQueryResponse)
async def update_serp_query(
    query_id: uuid.UUID, data: SerpQueryUpdate, db: AsyncSession = Depends(get_db)
):
    """Update a SERP query's keyword."""
    result = await db.execute(select(SerpQuery).where(SerpQuery.id == query_id))
    sq = result.scalar_one_or_none()
    if not sq:
        raise HTTPException(404, "SERP query not found")
    sq.keyword = data.keyword
    await db.commit()
    await db.refresh(sq)
    return sq


@router.delete("/queries/{query_id}", status_code=204)
async def delete_serp_query(query_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Delete a SERP query and its results."""
    result = await db.execute(select(SerpQuery).where(SerpQuery.id == query_id))
    sq = result.scalar_one_or_none()
    if not sq:
        raise HTTPException(404, "SERP query not found")
    await db.delete(sq)


@router.post("/classify", response_model=ClassificationResponse)
async def classify_content(data: ClassifyRequest):
    """Classify a single URL (tiers 1-2 only, no LLM cost)."""
    from app.engines.seo.content_classifier import classify

    result = classify(data.url, data.title)
    return ClassificationResponse(
        content_type=result.content_type,
        confidence=result.confidence,
        classified_by=result.classified_by,
    )


@router.post("/refetch-batch", response_model=JobStatusResponse, status_code=201)
async def refetch_serp_batch(
    data: dict, db: AsyncSession = Depends(get_db)
):
    """Re-fetch SERP results for a list of existing query IDs (batch)."""
    from pydantic import BaseModel

    query_ids: list[str] = data.get("query_ids", [])
    project_id_str: str = data.get("project_id", "")
    if not query_ids:
        raise HTTPException(400, "query_ids required")

    try:
        project_uuid = uuid.UUID(project_id_str)
    except ValueError:
        raise HTTPException(400, "Invalid project_id")

    job = BackgroundJob(project_id=project_uuid, job_type="serp_batch")
    db.add(job)
    await db.flush()

    from app.tasks.inline_runner import use_inline

    job_id_str = str(job.id)

    if use_inline():
        from app.tasks.seo_tasks import _run_serp_batch
        from app.tasks.inline_runner import dispatch_inline

        await db.commit()
        dispatch_inline(
            lambda: _run_serp_batch(None, query_ids, job_id_str),
            job_id=job_id_str,
        )
    else:
        from app.tasks.seo_tasks import run_serp_batch

        task = run_serp_batch.delay(query_ids, job_id_str)
        job.celery_task_id = task.id
        await db.commit()

    await db.refresh(job)
    return job


@router.post("/fetch/{query_id}", response_model=JobStatusResponse)
async def fetch_serp_results(query_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Fetch (or re-fetch) SERP results for a single query."""
    query = await db.execute(select(SerpQuery).where(SerpQuery.id == query_id))
    sq = query.scalar_one_or_none()
    if not sq:
        raise HTTPException(404, "SERP query not found")

    job = BackgroundJob(project_id=sq.project_id, job_type="serp_fetch")
    db.add(job)
    await db.flush()

    from app.tasks.inline_runner import use_inline

    query_id_str = str(query_id)
    job_id_str = str(job.id)

    if use_inline():
        from app.tasks.seo_tasks import _run_serp_query
        from app.tasks.inline_runner import dispatch_inline

        await db.commit()
        dispatch_inline(
            lambda: _run_serp_query(query_id_str, job_id_str),
            job_id=job_id_str,
        )
    else:
        from app.tasks.seo_tasks import run_serp_query

        task = run_serp_query.delay(query_id_str, job_id_str)
        job.celery_task_id = task.id
        await db.commit()

    await db.refresh(job)
    return job
