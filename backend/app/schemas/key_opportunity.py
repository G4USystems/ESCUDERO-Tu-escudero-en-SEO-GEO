"""Pydantic schemas for Key Opportunity endpoints."""

from pydantic import BaseModel


class KeyOpportunityResponse(BaseModel):
    domain: str
    display_name: str | None
    domain_type: str | None
    accepts_sponsored: bool | None

    # Dimension scores (0-100)
    seo_score: float
    geo_score: float
    backlink_score: float
    content_gap_score: float
    competitive_density: float

    # Final score
    key_opportunity_score: float

    # Classification
    priority: str  # critical, high, medium, low
    estimated_20x_potential: bool

    # Context
    competitor_brands: list[str]
    content_types: list[str]
    keywords: list[str]
    top_urls: list[str]
    niches: list[str]
    geo_providers: list[str]

    # Actions
    recommended_actions: list[str]

    # Domain metrics
    domain_authority: int | None
    monthly_traffic: int | None
