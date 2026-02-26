import uuid
from datetime import datetime

from pydantic import BaseModel


class BrandCreate(BaseModel):
    name: str
    domain: str | None = None
    is_client: bool = False
    aliases: list[str] | None = None


class BrandResponse(BaseModel):
    id: uuid.UUID
    name: str
    domain: str | None
    is_client: bool
    aliases: list[str] | None
    company_type: str | None = None
    service_description: str | None = None
    target_market: str | None = None
    about_summary: str | None = None
    analyzed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    website: str | None = None
    market: str = "es"
    language: str = "es"


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    website: str | None = None
    market: str | None = None
    language: str | None = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    website: str | None
    market: str
    language: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectDetailResponse(ProjectResponse):
    brands: list[BrandResponse] = []
