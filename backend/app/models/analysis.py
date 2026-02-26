import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.compat import PortableUUID, PortableJSON


class GapAnalysis(Base):
    __tablename__ = "gap_analyses"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    niche_id: Mapped[uuid.UUID | None] = mapped_column(PortableUUID, ForeignKey("niches.id", ondelete="SET NULL"), nullable=True)
    niche_slug: Mapped[str | None] = mapped_column(String(255), nullable=True)
    geo_run_id: Mapped[uuid.UUID | None] = mapped_column(PortableUUID, ForeignKey("geo_runs.id"), nullable=True)
    analysis_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    results: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class GapItem(Base):
    __tablename__ = "gap_items"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("gap_analyses.id", ondelete="CASCADE"), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    domain: Mapped[str | None] = mapped_column(String(512), nullable=True)
    competitor_brands: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    client_present: Mapped[bool] = mapped_column(Boolean, default=False)
    found_in_geo: Mapped[bool] = mapped_column(Boolean, default=False)
    found_in_serp: Mapped[bool] = mapped_column(Boolean, default=False)
    content_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    domain_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    opportunity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    keyword: Mapped[str | None] = mapped_column(String(512), nullable=True)
    niche: Mapped[str | None] = mapped_column(String(255), nullable=True)


class ActionBrief(Base):
    __tablename__ = "action_briefs"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    gap_item_id: Mapped[uuid.UUID | None] = mapped_column(PortableUUID, ForeignKey("gap_items.id"), nullable=True)
    target_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    target_domain: Mapped[str | None] = mapped_column(String(512), nullable=True)
    recommended_content_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    recommended_keyword: Mapped[str | None] = mapped_column(String(512), nullable=True)
    recommended_approach: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
