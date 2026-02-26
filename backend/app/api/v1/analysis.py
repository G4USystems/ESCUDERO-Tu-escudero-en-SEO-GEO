"""Gap Analysis & Key Opportunity API endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.analysis import ActionBrief, GapAnalysis, GapItem
from app.models.job import BackgroundJob
from app.schemas.analysis import (
    ActionBriefResponse,
    BriefStatusUpdate,
    GapAnalysisCreate,
    GapAnalysisResponse,
    GapItemResponse,
)
from app.schemas.geo import JobStatusResponse
from app.schemas.key_opportunity import KeyOpportunityResponse

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/gaps", response_model=JobStatusResponse, status_code=201)
async def create_gap_analysis(
    data: GapAnalysisCreate,
    db: AsyncSession = Depends(get_db),
):
    """Launch a new gap analysis (background job)."""
    analysis = GapAnalysis(
        project_id=data.project_id,
        niche_id=data.niche_id,
        niche_slug=data.niche_slug,
        geo_run_id=data.geo_run_id,
        analysis_type=data.analysis_type,
    )
    db.add(analysis)
    await db.flush()

    job = BackgroundJob(project_id=data.project_id, job_type="gap_analysis")
    db.add(job)
    await db.flush()

    from app.tasks.inline_runner import use_inline

    analysis_id_str = str(analysis.id)
    job_id_str = str(job.id)

    if use_inline():
        from app.tasks.analysis_tasks import _run_gap_analysis
        from app.tasks.inline_runner import dispatch_inline

        await db.commit()
        dispatch_inline(
            lambda: _run_gap_analysis(analysis_id_str, job_id_str),
            job_id=job_id_str,
        )
    else:
        from app.tasks.analysis_tasks import run_gap_analysis

        task = run_gap_analysis.delay(str(analysis.id), str(job.id))
        job.celery_task_id = task.id
        await db.commit()

    await db.refresh(job)
    return job


@router.get("/gaps", response_model=list[GapAnalysisResponse])
async def list_gap_analyses(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """List gap analyses for a project."""
    result = await db.execute(
        select(GapAnalysis)
        .where(GapAnalysis.project_id == project_id)
        .order_by(GapAnalysis.created_at.desc())
    )
    return result.scalars().all()


@router.get("/gaps/{analysis_id}", response_model=GapAnalysisResponse)
async def get_gap_analysis(analysis_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get a gap analysis by ID."""
    result = await db.execute(select(GapAnalysis).where(GapAnalysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(404, "Gap analysis not found")
    return analysis


@router.get("/gaps/{analysis_id}/items", response_model=list[GapItemResponse])
async def get_gap_items(
    analysis_id: uuid.UUID,
    min_score: float = 0,
    content_type: str | None = None,
    domain_type: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """Get gap items for an analysis, with optional filters."""
    query = (
        select(GapItem)
        .where(GapItem.analysis_id == analysis_id)
    )
    if min_score > 0:
        query = query.where(GapItem.opportunity_score >= min_score)
    if content_type:
        query = query.where(GapItem.content_type == content_type)
    if domain_type:
        query = query.where(GapItem.domain_type == domain_type)
    query = query.order_by(GapItem.opportunity_score.desc()).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


# --- Action Briefs ---
@router.get("/briefs", response_model=list[ActionBriefResponse])
async def list_briefs(
    project_id: uuid.UUID,
    priority: str | None = None,
    status: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """List action briefs for a project."""
    query = select(ActionBrief).where(ActionBrief.project_id == project_id)
    if priority:
        query = query.where(ActionBrief.priority == priority)
    if status:
        query = query.where(ActionBrief.status == status)
    query = query.order_by(ActionBrief.created_at.desc()).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/briefs/{brief_id}", response_model=ActionBriefResponse)
async def update_brief_status(
    brief_id: uuid.UUID,
    data: BriefStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update the status of an action brief."""
    valid = {"pending", "in_progress", "completed", "skipped"}
    if data.status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of: {valid}")

    result = await db.execute(select(ActionBrief).where(ActionBrief.id == brief_id))
    brief = result.scalar_one_or_none()
    if not brief:
        raise HTTPException(404, "Brief not found")

    brief.status = data.status
    await db.commit()
    await db.refresh(brief)
    return brief


# --- Key Opportunities ---
@router.get("/key-opportunities", response_model=list[KeyOpportunityResponse])
async def get_key_opportunities(
    project_id: uuid.UUID,
    min_score: float = 0,
    priority: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Get Key Opportunity scores combining SEO + GEO + Backlinks + Content Gap.

    Aggregates all intelligence at the DOMAIN level to answer:
    "Which media outlets should we prioritize for placements?"
    """
    from app.engines.intelligence.aggregator import collect_domain_intelligence
    from app.engines.intelligence.key_opportunity import score_key_opportunities

    domain_intel = await collect_domain_intelligence(db, project_id)
    opportunities = score_key_opportunities(domain_intel)

    # Apply filters
    if min_score > 0:
        opportunities = [o for o in opportunities if o.key_opportunity_score >= min_score]
    if priority:
        opportunities = [o for o in opportunities if o.priority == priority]

    return opportunities[:limit]
