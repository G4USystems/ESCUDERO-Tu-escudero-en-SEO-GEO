"""GEO engine API endpoints: runs, responses, metrics."""

import asyncio
import uuid
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.geo import BrandMention, GeoResponse, GeoRun, SourceCitation
from app.models.job import BackgroundJob
from app.models.project import Brand
from app.models.prompt import Prompt
from app.schemas.geo import (
    AggregatedResultResponse,
    BrandMetricsResponse,
    GeoResponseDetail,
    GeoRunCreate,
    GeoRunResponse,
    JobStatusResponse,
    ProviderStatsResponse,
)

router = APIRouter(prefix="/geo", tags=["geo"])


@router.post("/runs", response_model=JobStatusResponse, status_code=201)
async def create_geo_run(data: GeoRunCreate, db: AsyncSession = Depends(get_db)):
    """Launch a new GEO analysis run (queued as background job)."""
    # Validate providers
    valid = {"openai", "anthropic", "gemini", "perplexity"}
    invalid = set(data.providers) - valid
    if invalid:
        raise HTTPException(400, f"Invalid providers: {invalid}")

    # Count active prompts (scoped to niche if provided)
    count_query = select(func.count(Prompt.id)).where(
        Prompt.project_id == data.project_id,
        Prompt.is_active.is_(True),
    )
    if data.niche_id:
        count_query = count_query.where(Prompt.niche_id == data.niche_id)
    result = await db.execute(count_query)
    prompt_count = result.scalar() or 0
    if prompt_count == 0:
        raise HTTPException(400, "No active prompts found for this project/niche")

    # Create GeoRun
    run = GeoRun(
        project_id=data.project_id,
        niche_id=data.niche_id,
        name=data.name,
        providers=data.providers,
        total_prompts=prompt_count,
    )
    db.add(run)
    await db.flush()

    # Create BackgroundJob
    job = BackgroundJob(
        project_id=data.project_id,
        job_type="geo_analysis",
    )
    db.add(job)
    await db.flush()

    # Dispatch task (Celery if Redis available, otherwise inline)
    from app.tasks.inline_runner import use_inline

    # Capture IDs before session closes (avoids lazy-load in lambda)
    run_id_str = str(run.id)
    job_id_str = str(job.id)

    if use_inline():
        from app.tasks.geo_tasks import _run_geo_analysis
        from app.tasks.inline_runner import dispatch_inline

        await db.commit()
        dispatch_inline(
            lambda: _run_geo_analysis(None, run_id_str, job_id_str),
            job_id=job_id_str,
        )
    else:
        from app.tasks.geo_tasks import run_geo_analysis

        task = run_geo_analysis.delay(str(run.id), str(job.id))
        job.celery_task_id = task.id
        await db.commit()

    await db.refresh(job)
    return JobStatusResponse(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        progress=job.progress,
        result=job.result,
        step_info=job.step_info,
        error=job.error,
        created_at=job.created_at,
        run_id=uuid.UUID(run_id_str),
    )


@router.get("/runs", response_model=list[GeoRunResponse])
async def list_geo_runs(
    project_id: uuid.UUID,
    niche_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List GEO runs for a project, optionally filtered by niche."""
    query = select(GeoRun).where(GeoRun.project_id == project_id)
    if niche_id:
        query = query.where(GeoRun.niche_id == niche_id)
    query = query.order_by(GeoRun.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/runs/{run_id}", response_model=GeoRunResponse)
async def get_geo_run(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get a single GEO run by ID."""
    result = await db.execute(select(GeoRun).where(GeoRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "GEO run not found")
    return run


@router.get("/runs/{run_id}/responses", response_model=list[GeoResponseDetail])
async def get_run_responses(
    run_id: uuid.UUID,
    provider: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get all responses for a GEO run, optionally filtered by provider."""
    query = (
        select(GeoResponse)
        .where(GeoResponse.run_id == run_id)
        .options(
            selectinload(GeoResponse.mentions),
            selectinload(GeoResponse.citations),
        )
    )
    if provider:
        query = query.where(GeoResponse.provider == provider)
    query = query.order_by(GeoResponse.created_at)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/runs/{run_id}/metrics", response_model=AggregatedResultResponse)
async def get_run_metrics(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get aggregated brand visibility metrics for a completed GEO run."""
    # Load run
    run_result = await db.execute(select(GeoRun).where(GeoRun.id == run_id))
    run = run_result.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "GEO run not found")

    # Load all responses with mentions and citations
    resp_result = await db.execute(
        select(GeoResponse)
        .where(GeoResponse.run_id == run_id)
        .options(
            selectinload(GeoResponse.mentions),
            selectinload(GeoResponse.citations),
        )
    )
    responses = resp_result.scalars().all()

    # Load brands
    brand_result = await db.execute(
        select(Brand).where(Brand.project_id == run.project_id)
    )
    brands = brand_result.scalars().all()
    brand_map = {str(b.id): b.name for b in brands}

    # Build aggregation data
    from app.engines.geo.aggregator import aggregate

    parsed_responses = []
    for r in responses:
        parsed_responses.append({
            "prompt_id": str(r.prompt_id),
            "provider": r.provider,
            "mentions": [
                {
                    "brand_name": brand_map.get(str(m.brand_id), m.mention_text),
                    "position": m.position or 99,
                    "sentiment": m.sentiment or "neutral",
                    "sentiment_score": m.sentiment_score or 0.0,
                    "is_recommended": m.is_recommended,
                }
                for m in r.mentions
            ],
            "citations": [
                {"url": c.url, "domain": c.domain or "", "title": c.title or ""}
                for c in r.citations
            ],
        })

    agg = aggregate(
        parsed_responses,
        [b.name for b in brands],
        run.total_prompts,
    )

    # Enrich domain classifications with cached DB data (includes LLM results)
    from app.models.domain import Domain as DomainModel
    cited_domain_names = [d["domain"] for d in agg.top_cited_domains if d.get("domain")]
    if cited_domain_names:
        dom_result = await db.execute(
            select(DomainModel).where(DomainModel.domain.in_(cited_domain_names))
        )
        cached_domains = {d.domain: d for d in dom_result.scalars().all()}
        for cited in agg.top_cited_domains:
            dom_name = cited.get("domain", "")
            if dom_name in cached_domains and cached_domains[dom_name].domain_type:
                cited["domain_type"] = cached_domains[dom_name].domain_type
                cited["accepts_sponsored"] = cached_domains[dom_name].accepts_sponsored

    return AggregatedResultResponse(
        total_prompts=agg.total_prompts,
        total_responses=agg.total_responses,
        brands=[
            BrandMetricsResponse(
                brand_name=bm.brand_name,
                visibility_pct=bm.visibility_pct,
                avg_position=bm.avg_position,
                avg_sentiment_score=bm.avg_sentiment_score,
                sentiment_label=bm.sentiment_label,
                mention_count=bm.mention_count,
                recommendation_count=bm.recommendation_count,
                provider_breakdown={
                    k: ProviderStatsResponse(
                        provider=v.provider,
                        mention_count=v.mention_count,
                        avg_position=v.avg_position,
                        avg_sentiment_score=v.avg_sentiment_score,
                        visibility_pct=v.visibility_pct,
                    )
                    for k, v in bm.provider_breakdown.items()
                },
            )
            for bm in agg.brands
        ],
        top_cited_domains=agg.top_cited_domains,
    )


class ValidateUrlsRequest(BaseModel):
    urls: List[str]


@router.post("/validate-urls")
async def validate_urls(body: ValidateUrlsRequest):
    """Check which URLs are reachable (2xx/3xx). Used to filter LLM-hallucinated URLs."""
    urls = list(set(body.urls))[:80]  # deduplicate, cap at 80

    _HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; SanchoCMO/1.0; +https://sancho.ai)"
        )
    }

    async def check(url: str) -> tuple[str, bool]:
        try:
            async with httpx.AsyncClient(
                follow_redirects=True,
                timeout=6.0,
                verify=False,  # noqa: S501 — external URLs, SSL errors irrelevant
            ) as client:
                r = await client.head(url, headers=_HEADERS)
                if r.status_code == 405:
                    # Server doesn't accept HEAD — try GET with stream
                    r = await client.get(url, headers=_HEADERS)
                return url, r.status_code < 400
        except Exception:
            return url, False

    results = await asyncio.gather(*[check(u) for u in urls])
    valid = [u for u, ok in results if ok]
    return {"valid": valid}


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Poll a background job for progress."""
    result = await db.execute(
        select(BackgroundJob).where(BackgroundJob.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job
