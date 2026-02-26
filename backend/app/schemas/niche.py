import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.project import BrandResponse


class NicheCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    brief: dict | None = None
    sort_order: int = 0


class NicheUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    brief: dict | None = None
    sort_order: int | None = None


class NicheResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    brief: dict | None = None
    sort_order: int
    competitor_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class NicheDetailResponse(NicheResponse):
    competitors: list[BrandResponse] = []


class NicheBrandAdd(BaseModel):
    brand_id: uuid.UUID
