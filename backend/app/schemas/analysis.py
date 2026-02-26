"""Pydantic schemas for Gap Analysis endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel


# --- Gap Analysis ---
class GapAnalysisCreate(BaseModel):
    project_id: uuid.UUID
    niche_id: uuid.UUID | None = None
    niche_slug: str | None = None
    geo_run_id: uuid.UUID | None = None
    analysis_type: str = "full"  # full, geo_only, serp_only


class GapAnalysisResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    geo_run_id: uuid.UUID | None
    analysis_type: str
    status: str
    results: dict | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


# --- Gap Items ---
class GapItemResponse(BaseModel):
    id: uuid.UUID
    analysis_id: uuid.UUID
    url: str
    domain: str | None
    competitor_brands: dict | None
    client_present: bool
    found_in_geo: bool
    found_in_serp: bool
    content_type: str | None
    domain_type: str | None
    opportunity_score: float | None
    keyword: str | None
    niche: str | None

    model_config = {"from_attributes": True}


# --- Action Briefs ---
class ActionBriefResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    gap_item_id: uuid.UUID | None
    target_url: str | None
    target_domain: str | None
    recommended_content_type: str | None
    recommended_keyword: str | None
    recommended_approach: str | None
    priority: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BriefStatusUpdate(BaseModel):
    status: str  # pending, in_progress, completed, skipped
