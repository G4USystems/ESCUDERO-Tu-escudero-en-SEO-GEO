import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.compat import PortableUUID, PortableJSON


class ContentBrief(Base):
    __tablename__ = "content_briefs"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    niche: Mapped[str] = mapped_column(String(255), nullable=False)  # niche slug
    keyword: Mapped[str] = mapped_column(String(512), nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="guide")  # ranking, comparison, guide, solution, authority, trend
    source: Mapped[str] = mapped_column(String(50), default="manual")  # gap_analysis, serp_data, geo_citation, manual

    # NEW: Recommendation type and skill integration
    recommendation_type: Mapped[str] = mapped_column(String(20), default="keyword")  # "keyword" or "prompt"
    geo_prompt_id: Mapped[uuid.UUID | None] = mapped_column(PortableUUID, ForeignKey("prompts.id", ondelete="SET NULL"), nullable=True)
    suggested_skill: Mapped[str | None] = mapped_column(String(50), nullable=True)  # content-strategy, copywriting, etc.
    skill_context: Mapped[str | None] = mapped_column(Text, nullable=True)  # formatted brief for CLI skill invocation
    buyer_stage: Mapped[str | None] = mapped_column(String(30), nullable=True)  # awareness, consideration, decision, implementation
    generated_content: Mapped[str | None] = mapped_column(Text, nullable=True)  # paste-back field for skill output

    # Recommendation data (from Block A analysis + DataForSEO)
    opportunity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    competitor_coverage: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)  # {brand: count}
    search_volume: Mapped[int | None] = mapped_column(Integer, nullable=True)  # monthly searches
    cpc: Mapped[float | None] = mapped_column(Float, nullable=True)  # cost-per-click USD
    ev: Mapped[int | None] = mapped_column(Integer, nullable=True)  # estimated monthly visits
    kd: Mapped[int | None] = mapped_column(Integer, nullable=True)  # keyword difficulty 0-100
    competitor_position: Mapped[int | None] = mapped_column(Integer, nullable=True)  # competitor's rank position

    # LLM generation fields
    prompt_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    outline: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)  # {sections: [{h2, points[], keyword_hint}]}
    meta_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Target editorial site (from Block A data)
    target_domain: Mapped[str | None] = mapped_column(String(512), nullable=True)
    target_domain_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    # LLM metadata
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Lifecycle
    status: Mapped[str] = mapped_column(String(20), default="recommended")  # recommended, selected, briefed, generating, generated, approved
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
