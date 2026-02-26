"""Pydantic schemas for Domain Intelligence endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel


# --- Domains ---
class DomainCreate(BaseModel):
    domain: str
    display_name: str | None = None
    domain_type: str | None = None
    accepts_sponsored: bool | None = None
    country: str | None = None
    language: str | None = None
    notes: str | None = None


class DomainResponse(BaseModel):
    id: uuid.UUID
    domain: str
    display_name: str | None
    domain_type: str | None
    accepts_sponsored: bool | None
    monthly_traffic_estimate: int | None
    domain_authority: int | None
    country: str | None
    language: str | None
    notes: str | None
    classified_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DomainClassifyRequest(BaseModel):
    domain: str
    use_llm_fallback: bool = True


class DomainClassifyResponse(BaseModel):
    domain: str
    domain_type: str | None
    accepts_sponsored: bool | None
    classified_by: str
    is_excluded_fintech: bool = False


class BatchClassifyRequest(BaseModel):
    domains: list[str]
    use_llm_fallback: bool = True


class BatchClassifyItem(BaseModel):
    domain: str
    domain_type: str | None
    accepts_sponsored: bool | None
    classified_by: str


# --- Exclusion Rules ---
class ExclusionRuleCreate(BaseModel):
    project_id: uuid.UUID
    rule_name: str
    description: str | None = None
    rule_type: str  # domain_exact, domain_contains, domain_type
    rule_value: dict


class ExclusionRuleResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    rule_name: str
    description: str | None
    rule_type: str
    rule_value: dict
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Project Domains ---
class ProjectDomainResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    domain_id: uuid.UUID
    domain_name: str | None = None
    niche: str | None
    is_excluded: bool
    priority_score: float | None
    notes: str | None

    model_config = {"from_attributes": True}
