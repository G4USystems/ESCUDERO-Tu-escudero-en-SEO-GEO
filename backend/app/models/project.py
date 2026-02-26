import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.compat import PortableUUID, PortableArray


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    website: Mapped[str | None] = mapped_column(String(512), nullable=True)
    market: Mapped[str] = mapped_column(String(50), default="es")
    language: Mapped[str] = mapped_column(String(10), default="es")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    brands: Mapped[list["Brand"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    prompt_topics: Mapped[list["PromptTopic"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    niches: Mapped[list["Niche"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_client: Mapped[bool] = mapped_column(Boolean, default=False)
    aliases: Mapped[list[str] | None] = mapped_column(PortableArray(), nullable=True)
    company_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    service_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_market: Mapped[str | None] = mapped_column(String(255), nullable=True)
    about_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="brands")
    brand_domains: Mapped[list["BrandDomain"]] = relationship(back_populates="brand", cascade="all, delete-orphan")


class BrandDomain(Base):
    __tablename__ = "brand_domains"

    id: Mapped[uuid.UUID] = mapped_column(PortableUUID, primary_key=True, default=uuid.uuid4)
    brand_id: Mapped[uuid.UUID] = mapped_column(PortableUUID, ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    domain: Mapped[str] = mapped_column(String(512), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    brand: Mapped["Brand"] = relationship(back_populates="brand_domains")


# Fix forward references
from app.models.prompt import PromptTopic  # noqa: E402, F811
from app.models.niche import Niche  # noqa: E402, F811
