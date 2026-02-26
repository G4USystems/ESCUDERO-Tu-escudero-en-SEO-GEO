"""Pydantic schemas for Influencer endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class InfluencerSearchCreate(BaseModel):
    project_id: uuid.UUID
    niche_id: uuid.UUID | None = None
    niche_slug: str | None = None
    platforms: list[str] = ["youtube", "instagram"]
    num_results: int = 25  # per platform


class InfluencerResultResponse(BaseModel):
    id: uuid.UUID
    platform: str
    handle: str | None
    display_name: str | None
    profile_url: str
    subscribers: int | None
    snippet: str | None
    recommendation_reason: str | None
    relevance_score: float | None
    search_query: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
