import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.compat import PortableUUID, PortableJSON


class InfluencerResult(Base):
    __tablename__ = "influencer_results"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        PortableUUID, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    niche_id: Mapped[uuid.UUID | None] = mapped_column(
        PortableUUID, ForeignKey("niches.id", ondelete="SET NULL"), nullable=True
    )
    niche_slug: Mapped[str | None] = mapped_column(String(255), nullable=True)
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        PortableUUID, ForeignKey("background_jobs.id", ondelete="SET NULL"), nullable=True
    )
    platform: Mapped[str] = mapped_column(String(20), nullable=False)       # youtube | instagram
    handle: Mapped[str | None] = mapped_column(String(255), nullable=True)  # @username or channel handle
    display_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    profile_url: Mapped[str] = mapped_column(String(2048), nullable=False)  # profile/channel URL
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)  # original SERP result URL
    subscribers: Mapped[int | None] = mapped_column(Integer, nullable=True) # followers/subscribers if found
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)        # SERP snippet
    recommendation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    relevance_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0-100
    search_query: Mapped[str | None] = mapped_column(String(512), nullable=True)  # query that found this
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
