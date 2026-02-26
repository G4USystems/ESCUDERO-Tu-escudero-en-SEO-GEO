"""Block B API: Content keyword recommendations and blog outline generation."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.content import ContentBrief
from app.models.job import BackgroundJob
from app.models.project import Project
from app.schemas.content import (
    ContentBriefCreate,
    ContentBriefResponse,
    ContentBriefUpdate,
    ContentGenerateRequest,
    ContentRecommendRequest,
)
from pydantic import BaseModel


class SuggestKeywordsRequest(BaseModel):
    project_id: uuid.UUID
    niche: str
    count: int = 20

router = APIRouter(prefix="/content", tags=["content"])


@router.post("/recommend", response_model=dict, status_code=201)
async def recommend_keywords(data: ContentRecommendRequest, db: AsyncSession = Depends(get_db)):
    """Analyze Block A data and create keyword AND prompt recommendations."""
    from app.engines.content.recommender import recommend_keywords as _recommend_keywords
    from app.engines.content.prompt_recommender import recommend_prompts as _recommend_prompts

    # Validate project
    result = await db.execute(select(Project).where(Project.id == data.project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Delete existing recommendations for this niche (fresh analysis)
    existing = await db.execute(
        select(ContentBrief).where(
            ContentBrief.project_id == data.project_id,
            ContentBrief.niche == data.niche,
            ContentBrief.status == "recommended",
        )
    )
    for brief in existing.scalars().all():
        await db.delete(brief)
    await db.flush()

    # Run both recommenders
    keyword_recs = await _recommend_keywords(str(data.project_id), data.niche, db)
    prompt_recs = await _recommend_prompts(str(data.project_id), data.niche, db)

    # Create ContentBrief rows for keywords
    keywords_created = 0
    for rec in keyword_recs:
        brief = ContentBrief(
            project_id=data.project_id,
            niche=data.niche,
            keyword=rec["keyword"],
            category=rec["category"],
            source=rec["source"],
            opportunity_score=rec["score"],
            competitor_coverage=rec["competitor_coverage"],
            status="recommended",
            recommendation_type=rec["recommendation_type"],
            suggested_skill=rec["suggested_skill"],
            search_volume=rec.get("search_volume"),
            cpc=rec.get("cpc"),
            ev=rec.get("ev"),
            kd=rec.get("kd"),
            competitor_position=rec.get("competitor_position"),
        )
        db.add(brief)
        keywords_created += 1

    # Create ContentBrief rows for prompts
    prompts_created = 0
    for rec in prompt_recs:
        # Parse prompt_id from UUID string if available
        prompt_id = None
        if "prompt_id" in rec:
            try:
                prompt_id = uuid.UUID(rec["prompt_id"])
            except (ValueError, TypeError):
                pass

        brief = ContentBrief(
            project_id=data.project_id,
            niche=data.niche,
            keyword=rec["prompt_text"],  # Store prompt text in keyword field
            category=rec["category"],
            source=rec["source"],
            opportunity_score=rec["score"],
            competitor_coverage=rec["competitor_mentions"],
            status="recommended",
            recommendation_type="prompt",
            geo_prompt_id=prompt_id,
            suggested_skill="content-strategy",  # Default for prompts
        )
        db.add(brief)
        prompts_created += 1

    await db.flush()
    return {
        "keywords": keywords_created,
        "prompts": prompts_created,
        "total": keywords_created + prompts_created,
    }


@router.get("/briefs", response_model=list[ContentBriefResponse])
async def list_briefs(
    project_id: uuid.UUID = Query(...),
    niche: str | None = Query(None),
    status: str | None = Query(None),
    category: str | None = Query(None),
    recommendation_type: str | None = Query(None),  # NEW: filter by keyword/prompt
    db: AsyncSession = Depends(get_db),
):
    """List content briefs with optional filters."""
    query = select(ContentBrief).where(ContentBrief.project_id == project_id)
    if niche:
        query = query.where(ContentBrief.niche == niche)
    if status:
        query = query.where(ContentBrief.status == status)
    if category:
        query = query.where(ContentBrief.category == category)
    if recommendation_type:
        query = query.where(ContentBrief.recommendation_type == recommendation_type)
    query = query.order_by(ContentBrief.opportunity_score.desc().nullslast(), ContentBrief.created_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/briefs/{brief_id}", response_model=ContentBriefResponse)
async def get_brief(brief_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get a single brief with full outline."""
    result = await db.execute(
        select(ContentBrief).where(ContentBrief.id == brief_id)
    )
    brief = result.scalar_one_or_none()
    if not brief:
        raise HTTPException(status_code=404, detail="Brief not found")
    return brief


@router.put("/briefs/{brief_id}", response_model=ContentBriefResponse)
async def update_brief(brief_id: uuid.UUID, data: ContentBriefUpdate, db: AsyncSession = Depends(get_db)):
    """Update a content brief (status, keyword, etc.)."""
    result = await db.execute(
        select(ContentBrief).where(ContentBrief.id == brief_id)
    )
    brief = result.scalar_one_or_none()
    if not brief:
        raise HTTPException(status_code=404, detail="Brief not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(brief, field, value)

    await db.flush()
    await db.refresh(brief)
    return brief


@router.post("/briefs/{brief_id}/generate-brief", response_model=ContentBriefResponse)
async def generate_brief(brief_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Generate skill_context for a selected brief."""
    from app.engines.content.brief_generator import generate_brief as _generate_brief
    from app.models.project import Niche, Brand

    # Load brief
    brief_result = await db.execute(
        select(ContentBrief).where(ContentBrief.id == brief_id)
    )
    brief = brief_result.scalar_one_or_none()
    if not brief:
        raise HTTPException(status_code=404, detail="Brief not found")

    # Load project
    project_result = await db.execute(
        select(Project).where(Project.id == brief.project_id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Load niche
    niche_result = await db.execute(
        select(Niche).where(
            Niche.project_id == brief.project_id,
            Niche.slug == brief.niche,
        )
    )
    niche = niche_result.scalar_one_or_none()
    if not niche:
        raise HTTPException(status_code=404, detail="Niche not found")

    # Load competitors
    competitors_result = await db.execute(
        select(Brand).where(
            Brand.project_id == brief.project_id,
            Brand.is_client.is_(False),
        )
    )
    competitors = competitors_result.scalars().all()

    # Generate brief
    skill_context = _generate_brief(brief, project, niche, list(competitors))

    # Update brief with generated context
    brief.skill_context = skill_context
    brief.status = "briefed"

    await db.flush()
    await db.refresh(brief)
    return brief


@router.post("/briefs/{brief_id}/generate-article", response_model=ContentBriefResponse)
async def generate_article(brief_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Generate a complete blog article for a selected brief using LLM."""
    from app.engines.content.article_generator import generate_article as _generate_article
    from app.models.project import Niche, Brand

    brief_result = await db.execute(select(ContentBrief).where(ContentBrief.id == brief_id))
    brief = brief_result.scalar_one_or_none()
    if not brief:
        raise HTTPException(status_code=404, detail="Brief not found")

    project_result = await db.execute(select(Project).where(Project.id == brief.project_id))
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    niche_result = await db.execute(
        select(Niche).where(Niche.project_id == brief.project_id, Niche.slug == brief.niche)
    )
    niche = niche_result.scalar_one_or_none()
    if not niche:
        raise HTTPException(status_code=404, detail="Niche not found")

    competitors_result = await db.execute(
        select(Brand).where(Brand.project_id == brief.project_id, Brand.is_client.is_(False))
    )
    competitors = competitors_result.scalars().all()

    # Generate the article
    brief.status = "generating"
    await db.flush()

    try:
        result = await _generate_article(brief, project, niche, list(competitors))
        brief.generated_content = result["content"]
        brief.title = result["title"]
        brief.target_word_count = result["word_count"]
        brief.status = "generated"
    except Exception as e:
        brief.status = "selected"  # revert on failure
        await db.flush()
        raise HTTPException(status_code=500, detail=f"Article generation failed: {str(e)}")

    await db.flush()
    await db.refresh(brief)
    return brief


@router.post("/suggest-keywords", response_model=list[dict])
async def suggest_keywords(data: SuggestKeywordsRequest, db: AsyncSession = Depends(get_db)):
    """Use LLM to suggest new keyword opportunities for the niche."""
    from app.engines.content.keyword_suggester import suggest_keywords as _suggest_keywords
    from app.models.project import Niche, Brand

    project_result = await db.execute(select(Project).where(Project.id == data.project_id))
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    niche_result = await db.execute(
        select(Niche).where(Niche.project_id == data.project_id, Niche.slug == data.niche)
    )
    niche = niche_result.scalar_one_or_none()
    if not niche:
        raise HTTPException(status_code=404, detail="Niche not found")

    competitors_result = await db.execute(
        select(Brand).where(Brand.project_id == data.project_id)
    )
    competitors = competitors_result.scalars().all()

    # Get existing keywords to avoid duplicates
    existing_result = await db.execute(
        select(ContentBrief.keyword).where(
            ContentBrief.project_id == data.project_id,
            ContentBrief.niche == data.niche,
        )
    )
    existing_keywords = [row[0] for row in existing_result.all()]

    suggestions = await _suggest_keywords(
        project=project,
        niche=niche,
        competitors=list(competitors),
        existing_keywords=existing_keywords,
        count=data.count,
    )
    return suggestions


@router.delete("/briefs/{brief_id}", status_code=204)
async def delete_brief(brief_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Delete a content brief."""
    result = await db.execute(
        select(ContentBrief).where(ContentBrief.id == brief_id)
    )
    brief = result.scalar_one_or_none()
    if not brief:
        raise HTTPException(status_code=404, detail="Brief not found")
    await db.delete(brief)


@router.post("/briefs/add", response_model=ContentBriefResponse, status_code=201)
async def add_manual_brief(
    project_id: uuid.UUID = Query(...),
    data: ContentBriefCreate = ...,
    db: AsyncSession = Depends(get_db),
):
    """Add a manual content brief."""
    brief = ContentBrief(
        project_id=project_id,
        niche=data.niche,
        keyword=data.keyword,
        category=data.category,
        source=data.source,
        status="selected",
    )
    db.add(brief)
    await db.flush()
    await db.refresh(brief)
    return brief


@router.post("/generate", response_model=dict, status_code=201)
async def generate_content(data: ContentGenerateRequest, db: AsyncSession = Depends(get_db)):
    """Launch LLM generation for selected briefs."""
    # Validate project
    result = await db.execute(select(Project).where(Project.id == data.project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Check selected briefs exist
    brief_result = await db.execute(
        select(ContentBrief).where(
            ContentBrief.project_id == data.project_id,
            ContentBrief.niche == data.niche,
            ContentBrief.status == "selected",
        )
    )
    briefs = brief_result.scalars().all()
    if not briefs:
        raise HTTPException(status_code=400, detail="No selected briefs to generate")

    # Create BackgroundJob
    job = BackgroundJob(
        project_id=data.project_id,
        job_type="content_generation",
    )
    db.add(job)
    await db.flush()

    # Dispatch task
    from app.tasks.inline_runner import use_inline

    project_id_str = str(data.project_id)
    job_id_str = str(job.id)
    niche_str = data.niche
    provider_str = data.provider

    if use_inline():
        from app.tasks.content_tasks import _run_content_generation
        from app.tasks.inline_runner import dispatch_inline

        await db.commit()
        dispatch_inline(
            lambda: _run_content_generation(project_id_str, niche_str, job_id_str, provider_str),
            job_id=job_id_str,
        )
    else:
        from app.tasks.content_tasks import run_content_generation

        task = run_content_generation.delay(project_id_str, niche_str, job_id_str, provider_str)
        job.celery_task_id = task.id
        await db.commit()

    await db.refresh(job)
    return {"job_id": str(job.id), "briefs_queued": len(briefs)}
