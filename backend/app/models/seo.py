import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.compat import PortableUUID


class ContentType(str, PyEnum):
    REVIEW = "review"
    RANKING = "ranking"
    SOLUTION = "solution"
    NEWS = "news"
    FORUM = "forum"
    OTHER = "other"


class SerpQuery(Base):
    __tablename__ = "serp_queries"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    keyword: Mapped[str] = mapped_column(String(512), nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="es")
    location: Mapped[str] = mapped_column(String(100), default="Spain")
    niche: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    results: Mapped[list["SerpResult"]] = relationship(back_populates="query", cascade="all, delete-orphan")


class SerpResult(Base):
    __tablename__ = "serp_results"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    query_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("serp_queries.id", ondelete="CASCADE"), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    domain: Mapped[str | None] = mapped_column(String(512), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    result_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    query: Mapped["SerpQuery"] = relationship(back_populates="results")
    classification: Mapped["ContentClassification | None"] = relationship(back_populates="serp_result", uselist=False, cascade="all, delete-orphan")


class ContentClassification(Base):
    __tablename__ = "content_classifications"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    serp_result_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("serp_results.id", ondelete="CASCADE"), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    classified_by: Mapped[str] = mapped_column(String(20), default="auto")
    classified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    serp_result: Mapped["SerpResult"] = relationship(back_populates="classification")
