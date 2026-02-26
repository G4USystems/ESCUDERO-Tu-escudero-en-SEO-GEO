import uuid
from datetime import datetime

from pydantic import BaseModel


class ContentBriefResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    niche: str
    keyword: str
    category: str
    source: str
    opportunity_score: float | None
    competitor_coverage: dict | None
    prompt_text: str | None
    title: str | None
    outline: dict | None
    meta_description: str | None
    target_word_count: int | None
    target_domain: str | None
    target_domain_rationale: str | None
    provider: str | None
    model_used: str | None
    tokens_used: int | None
    status: str
    created_at: datetime

    # Skills integration + keyword research fields
    recommendation_type: str
    geo_prompt_id: uuid.UUID | None
    suggested_skill: str | None
    skill_context: str | None
    buyer_stage: str | None
    generated_content: str | None
    search_volume: int | None
    cpc: float | None
    ev: int | None
    kd: int | None
    competitor_position: int | None

    model_config = {"from_attributes": True}


class ContentRecommendRequest(BaseModel):
    project_id: uuid.UUID
    niche: str  # niche slug


class ContentBriefCreate(BaseModel):
    niche: str
    keyword: str
    category: str = "guide"
    source: str = "manual"


class ContentBriefUpdate(BaseModel):
    status: str | None = None
    keyword: str | None = None
    category: str | None = None
    title: str | None = None
    target_domain: str | None = None
    generated_content: str | None = None  # NEW: For paste-back workflow


class ContentGenerateRequest(BaseModel):
    project_id: uuid.UUID
    niche: str
    provider: str = "openai"
