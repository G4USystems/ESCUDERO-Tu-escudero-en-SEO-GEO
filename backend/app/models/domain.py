import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.compat import PortableUUID, PortableJSON


class DomainType(str, PyEnum):
    EDITORIAL = "editorial"
    CORPORATE = "corporate"
    UGC = "ugc"
    COMPETITOR = "competitor"
    REFERENCE = "reference"
    INSTITUTIONAL = "institutional"
    AGGREGATOR = "aggregator"


class Domain(Base):
    __tablename__ = "domains"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    domain: Mapped[str] = mapped_column(String(512), unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    domain_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    accepts_sponsored: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    monthly_traffic_estimate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    domain_authority: Mapped[int | None] = mapped_column(Integer, nullable=True)
    country: Mapped[str | None] = mapped_column(String(10), nullable=True)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    classified_by: Mapped[str] = mapped_column(String(20), default="auto")
    classified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ExclusionRule(Base):
    __tablename__ = "exclusion_rules"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    rule_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    rule_value: Mapped[dict] = mapped_column(PortableJSON, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProjectDomain(Base):
    __tablename__ = "project_domains"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    domain_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("domains.id"), nullable=False)
    niche: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_excluded: Mapped[bool] = mapped_column(Boolean, default=False)
    priority_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
