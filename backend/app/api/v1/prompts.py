import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.prompt import Prompt, PromptTopic
from app.models.project import Project
from app.schemas.prompt import (
    PromptBulkImport,
    PromptCreate,
    PromptResponse,
    PromptTopicCreate,
    PromptTopicResponse,
    PromptUpdate,
)

router = APIRouter()


# --- Topics ---


@router.post("/projects/{project_id}/topics", response_model=PromptTopicResponse, status_code=201)
async def create_topic(project_id: uuid.UUID, data: PromptTopicCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    topic = PromptTopic(project_id=project_id, **data.model_dump())
    db.add(topic)
    await db.flush()
    await db.refresh(topic)
    return PromptTopicResponse(
        id=topic.id,
        name=topic.name,
        slug=topic.slug,
        description=topic.description,
        sort_order=topic.sort_order,
        prompt_count=0,
    )


@router.get("/projects/{project_id}/topics", response_model=list[PromptTopicResponse])
async def list_topics(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    # Auto-seed standard topics if project has none yet
    count_result = await db.execute(
        select(func.count(PromptTopic.id)).where(PromptTopic.project_id == project_id)
    )
    if (count_result.scalar() or 0) == 0:
        await _get_or_create_topics(project_id, db)

    result = await db.execute(
        select(
            PromptTopic,
            func.count(Prompt.id).label("prompt_count"),
        )
        .outerjoin(Prompt, Prompt.topic_id == PromptTopic.id)
        .where(PromptTopic.project_id == project_id)
        .group_by(PromptTopic.id)
        .order_by(PromptTopic.sort_order)
    )
    topics = []
    for topic, count in result.all():
        topics.append(
            PromptTopicResponse(
                id=topic.id,
                name=topic.name,
                slug=topic.slug,
                description=topic.description,
                sort_order=topic.sort_order,
                prompt_count=count,
            )
        )
    return topics


# --- Prompts ---


@router.post("/projects/{project_id}/prompts", response_model=PromptResponse, status_code=201)
async def create_prompt(project_id: uuid.UUID, data: PromptCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    prompt = Prompt(project_id=project_id, **data.model_dump())
    db.add(prompt)
    await db.flush()
    await db.refresh(prompt)
    return prompt


@router.get("/projects/{project_id}/prompts", response_model=list[PromptResponse])
async def list_prompts(
    project_id: uuid.UUID,
    topic_id: uuid.UUID | None = Query(None),
    niche_id: uuid.UUID | None = Query(None),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    query = select(Prompt).where(Prompt.project_id == project_id)
    if topic_id:
        query = query.where(Prompt.topic_id == topic_id)
    if niche_id:
        query = query.where(Prompt.niche_id == niche_id)
    if active_only:
        query = query.where(Prompt.is_active.is_(True))
    query = query.order_by(Prompt.sort_order)
    result = await db.execute(query)
    return result.scalars().all()


@router.delete("/projects/{project_id}/prompts/bulk", status_code=204)
async def bulk_delete_prompts(
    project_id: uuid.UUID,
    niche_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Delete all prompts for a project, optionally filtered by niche_id."""
    query = select(Prompt).where(Prompt.project_id == project_id)
    if niche_id:
        query = query.where(Prompt.niche_id == niche_id)
    result = await db.execute(query)
    for prompt in result.scalars().all():
        await db.delete(prompt)


_DEFAULT_TOPICS = [
    ("discovery",         "Descubrimiento",          0),
    ("recommendation",    "Recomendación",            1),
    ("comparison",        "Comparación",              2),
    ("alternatives",      "Alternativas",             3),
    ("problem",           "Problema → Solución",      4),
    ("authority",         "Autoridad",                5),
    ("content_gap",       "Gap de Contenido",         6),
    ("influencer",        "Influencers",              7),
    ("media_intelligence","Inteligencia de Medios",   8),
]


async def _get_or_create_topics(project_id: uuid.UUID, db: AsyncSession) -> dict[str, uuid.UUID]:
    """Return {slug: topic_id} for project, creating defaults if needed."""
    result = await db.execute(
        select(PromptTopic).where(PromptTopic.project_id == project_id)
    )
    existing = {t.slug: t.id for t in result.scalars().all()}
    for slug, name, order in _DEFAULT_TOPICS:
        if slug not in existing:
            topic = PromptTopic(project_id=project_id, name=name, slug=slug, sort_order=order)
            db.add(topic)
            await db.flush()
            await db.refresh(topic)
            existing[slug] = topic.id
    return existing


@router.post("/projects/{project_id}/prompts/import", response_model=dict, status_code=201)
async def import_prompts(project_id: uuid.UUID, data: PromptBulkImport, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Auto-create standard topics if missing, build slug→id map
    topic_map = await _get_or_create_topics(project_id, db)

    prompts = []
    for p in data.prompts:
        payload = p.model_dump()
        # If topic_id wasn't provided or is zero, fall back to "recommendation"
        if not payload.get("topic_id"):
            payload["topic_id"] = topic_map.get("recommendation", next(iter(topic_map.values())))
        prompt = Prompt(project_id=project_id, **payload)
        db.add(prompt)
        prompts.append(prompt)
    await db.flush()
    return {"imported": len(prompts)}


@router.put("/projects/{project_id}/prompts/{prompt_id}", response_model=PromptResponse)
async def update_prompt(project_id: uuid.UUID, prompt_id: uuid.UUID, data: PromptUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Prompt).where(Prompt.id == prompt_id, Prompt.project_id == project_id)
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    prompt.text = data.text
    await db.flush()
    await db.refresh(prompt)
    return prompt


@router.delete("/projects/{project_id}/prompts/{prompt_id}", status_code=204)
async def delete_prompt(project_id: uuid.UUID, prompt_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Prompt).where(Prompt.id == prompt_id, Prompt.project_id == project_id)
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    await db.delete(prompt)
