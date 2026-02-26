"""Niche model: target market segments within a project, each with its own competitors."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.compat import PortableJSON, PortableUUID


class Niche(Base):
    __tablename__ = "niches"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    brief: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="niches")
    niche_brands: Mapped[list["NicheBrand"]] = relationship(back_populates="niche", cascade="all, delete-orphan")


class NicheBrand(Base):
    """Join table: links brands (competitors) to specific niches."""
    __tablename__ = "niche_brands"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    niche_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("niches.id", ondelete="CASCADE"), nullable=False)
    brand_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)

    niche: Mapped["Niche"] = relationship(back_populates="niche_brands")
    brand: Mapped["Brand"] = relationship()


from app.models.project import Project, Brand  # noqa: E402, F811
