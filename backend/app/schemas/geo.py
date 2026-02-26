"""Pydantic schemas for GEO endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel


# --- GEO Runs ---
class GeoRunCreate(BaseModel):
    project_id: uuid.UUID
    niche_id: uuid.UUID | None = None
    name: str | None = None
    providers: list[str] = ["openai", "anthropic", "gemini", "perplexity"]


class GeoRunResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    niche_id: uuid.UUID | None = None
    name: str | None
    status: str
    providers: list[str]
    total_prompts: int
    completed_prompts: int
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- GEO Responses ---
class GeoResponseResponse(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    prompt_id: uuid.UUID
    provider: str
    model_used: str | None
    tokens_used: int | None
    latency_ms: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class GeoResponseDetail(GeoResponseResponse):
    raw_response: str
    mentions: list["BrandMentionResponse"]
    citations: list["SourceCitationResponse"]


# --- Brand Mentions ---
class BrandMentionResponse(BaseModel):
    id: uuid.UUID
    brand_id: uuid.UUID
    mention_text: str
    position: int | None
    sentiment: str | None
    sentiment_score: float | None
    is_recommended: bool
    context: str | None

    model_config = {"from_attributes": True}


# --- Source Citations ---
class SourceCitationResponse(BaseModel):
    id: uuid.UUID
    url: str
    domain: str | None
    title: str | None
    position: int | None
    brand_id: uuid.UUID | None

    model_config = {"from_attributes": True}


# --- Aggregated Metrics ---
class ProviderStatsResponse(BaseModel):
    provider: str
    mention_count: int
    avg_position: float | None
    avg_sentiment_score: float
    visibility_pct: float


class BrandMetricsResponse(BaseModel):
    brand_name: str
    visibility_pct: float
    avg_position: float | None
    avg_sentiment_score: float
    sentiment_label: str
    mention_count: int
    recommendation_count: int
    provider_breakdown: dict[str, ProviderStatsResponse] = {}


class AggregatedResultResponse(BaseModel):
    total_prompts: int
    total_responses: int
    brands: list[BrandMetricsResponse]
    top_cited_domains: list[dict]


# --- Job Status ---
class JobStatusResponse(BaseModel):
    id: uuid.UUID
    job_type: str
    status: str
    progress: float
    result: dict | None
    step_info: dict | None = None
    error: str | None
    created_at: datetime
    run_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}
