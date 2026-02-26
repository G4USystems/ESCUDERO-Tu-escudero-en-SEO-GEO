"""Pydantic schemas for SEO/SERP endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel


# --- SERP Queries ---
class SerpQueryCreate(BaseModel):
    project_id: uuid.UUID
    keyword: str
    language: str = "es"
    location: str = "Spain"
    niche: str | None = None


class SerpQueryUpdate(BaseModel):
    keyword: str


class SerpQueryBatchCreate(BaseModel):
    project_id: uuid.UUID
    keywords: list[str]
    language: str = "es"
    location: str = "Spain"
    niche: str | None = None


class SerpQueryResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    keyword: str
    language: str
    location: str
    niche: str | None
    last_fetched_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- SERP Results ---
class SerpResultResponse(BaseModel):
    id: uuid.UUID
    query_id: uuid.UUID
    url: str
    domain: str | None
    title: str | None
    snippet: str | None
    position: int
    result_type: str | None
    fetched_at: datetime
    content_type: str | None = None
    content_confidence: float | None = None

    model_config = {"from_attributes": True}


class SerpQueryWithResults(SerpQueryResponse):
    results: list[SerpResultResponse]


# --- Content Classification ---
class ClassifyRequest(BaseModel):
    url: str
    title: str
    snippet: str = ""


class ClassificationResponse(BaseModel):
    content_type: str
    confidence: float
    classified_by: str
