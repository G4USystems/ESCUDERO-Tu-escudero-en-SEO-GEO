import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.project import Brand, Project
from app.schemas.project import (
    BrandCreate,
    BrandResponse,
    ProjectCreate,
    ProjectDetailResponse,
    ProjectResponse,
    ProjectUpdate,
)


class DescribeWebsiteRequest(BaseModel):
    url: str


class DescribeWebsiteResponse(BaseModel):
    description: str


router = APIRouter()


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    project = Project(**data.model_dump())
    db.add(project)
    await db.flush()
    await db.refresh(project)
    return project


@router.get("", response_model=list[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    return result.scalars().all()


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(selectinload(Project.brands))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: uuid.UUID, data: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    await db.flush()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)


# --- Brands ---


@router.post("/{project_id}/brands", response_model=BrandResponse, status_code=201)
async def create_brand(project_id: uuid.UUID, data: BrandCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    brand = Brand(project_id=project_id, **data.model_dump())
    db.add(brand)
    await db.flush()
    await db.refresh(brand)
    return brand


@router.get("/{project_id}/brands", response_model=list[BrandResponse])
async def list_brands(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Brand).where(Brand.project_id == project_id).order_by(Brand.is_client.desc(), Brand.name)
    )
    return result.scalars().all()


@router.delete("/{project_id}/brands/{brand_id}", status_code=204)
async def delete_brand(project_id: uuid.UUID, brand_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Brand).where(Brand.id == brand_id, Brand.project_id == project_id)
    )
    brand = result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    await db.delete(brand)


@router.post("/{project_id}/brands/{brand_id}/analyze", response_model=BrandResponse)
async def analyze_brand(project_id: uuid.UUID, brand_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Scrape a brand's domain and extract business intelligence via LLM."""
    result = await db.execute(
        select(Brand).where(Brand.id == brand_id, Brand.project_id == project_id)
    )
    brand = result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    if not brand.domain:
        raise HTTPException(status_code=400, detail="Brand has no domain to analyze")

    from app.engines.intelligence.domain_analyzer import analyze_domain

    analysis = await analyze_domain(brand.domain)

    brand.company_type = analysis.company_type
    brand.service_description = ", ".join(analysis.services) if analysis.services else None
    brand.target_market = analysis.target_market
    brand.about_summary = analysis.summary
    brand.analyzed_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(brand)
    return brand


@router.post("/describe-website", response_model=DescribeWebsiteResponse)
async def describe_website(data: DescribeWebsiteRequest):
    """Fetch a website and generate a short company description using LLM."""
    from app.engines.intelligence.domain_analyzer import analyze_domain

    url = data.url.strip()
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    try:
        analysis = await analyze_domain(url)
        description = analysis.summary or ""
        return DescribeWebsiteResponse(description=description)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"No se pudo analizar la web: {e}")
