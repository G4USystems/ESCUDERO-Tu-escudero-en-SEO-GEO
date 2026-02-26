"""Influencer discovery endpoints — YouTube & Instagram via SERP."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.influencer import InfluencerResult
from app.models.job import BackgroundJob
from app.schemas.geo import JobStatusResponse
from app.schemas.influencer import InfluencerResultResponse, InfluencerSearchCreate

router = APIRouter(prefix="/influencers", tags=["influencers"])


@router.post("/search", response_model=JobStatusResponse, status_code=201)
async def search_influencers(
    data: InfluencerSearchCreate,
    db: AsyncSession = Depends(get_db),
):
    """Launch influencer discovery for YouTube + Instagram."""
    job = BackgroundJob(project_id=data.project_id, job_type="influencer_search")
    db.add(job)
    await db.flush()

    from app.tasks.inline_runner import use_inline

    job_id_str = str(job.id)
    project_id_str = str(data.project_id)
    niche_id_str = str(data.niche_id) if data.niche_id else None

    if use_inline():
        from app.tasks.influencer_tasks import _run_influencer_search
        from app.tasks.inline_runner import dispatch_inline

        await db.commit()
        dispatch_inline(
            lambda: _run_influencer_search(
                job_id_str, project_id_str, niche_id_str,
                data.niche_slug, data.platforms, data.num_results,
            ),
            job_id=job_id_str,
        )
    else:
        from app.tasks.influencer_tasks import run_influencer_search

        task = run_influencer_search.delay(
            job_id_str, project_id_str, niche_id_str,
            data.niche_slug, data.platforms, data.num_results,
        )
        job.celery_task_id = task.id
        await db.commit()

    await db.refresh(job)
    return job


@router.get("/results", response_model=list[InfluencerResultResponse])
async def list_influencer_results(
    project_id: uuid.UUID,
    niche_slug: str | None = Query(None),
    platform: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List influencer results for a project/niche."""
    query = select(InfluencerResult).where(InfluencerResult.project_id == project_id)
    if niche_slug:
        query = query.where(InfluencerResult.niche_slug == niche_slug)
    if platform:
        query = query.where(InfluencerResult.platform == platform)
    query = query.order_by(InfluencerResult.relevance_score.desc())

    result = await db.execute(query)
    return result.scalars().all()
