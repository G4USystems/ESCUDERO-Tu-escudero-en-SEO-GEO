import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.compat import PortableUUID, PortableArray


class LLMProvider(str, PyEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    PERPLEXITY = "perplexity"


class GeoRun(Base):
    __tablename__ = "geo_runs"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    niche_id: Mapped[uuid.UUID | None] = mapped_column(PortableUUID, ForeignKey("niches.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    providers: Mapped[list[str]] = mapped_column(PortableArray(), nullable=False)
    total_prompts: Mapped[int] = mapped_column(Integer, default=0)
    completed_prompts: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    responses: Mapped[list["GeoResponse"]] = relationship(back_populates="run", cascade="all, delete-orphan")


class GeoResponse(Base):
    __tablename__ = "geo_responses"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("geo_runs.id", ondelete="CASCADE"), nullable=False)
    prompt_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("prompts.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    raw_response: Mapped[str] = mapped_column(Text, nullable=False)
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    turn: Mapped[int] = mapped_column(Integer, default=1)  # 1=discovery, 2=why, 3=sources
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    run: Mapped["GeoRun"] = relationship(back_populates="responses")
    mentions: Mapped[list["BrandMention"]] = relationship(back_populates="response", cascade="all, delete-orphan")
    citations: Mapped[list["SourceCitation"]] = relationship(back_populates="response", cascade="all, delete-orphan")


class BrandMention(Base):
    __tablename__ = "brand_mentions"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    response_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("geo_responses.id", ondelete="CASCADE"), nullable=False)
    brand_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("brands.id"), nullable=False)
    mention_text: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_recommended: Mapped[bool] = mapped_column(Boolean, default=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)

    response: Mapped["GeoResponse"] = relationship(back_populates="mentions")


class SourceCitation(Base):
    __tablename__ = "source_citations"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    response_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("geo_responses.id", ondelete="CASCADE"), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    domain: Mapped[str | None] = mapped_column(String(512), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    brand_id: Mapped[uuid.UUID | None] = mapped_column(PortableUUID, ForeignKey("brands.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    response: Mapped["GeoResponse"] = relationship(back_populates="citations")
