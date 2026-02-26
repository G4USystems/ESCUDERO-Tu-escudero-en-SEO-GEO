import json

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")


def _make_engine(database_url: str):
    """Create an async engine with SQLite-safe settings.

    WAL mode (set in init_db) + 30s busy_timeout handles concurrent writes
    without StaticPool — StaticPool causes conflicts between the main event
    loop and the inline_runner background thread's new event loop.
    """
    if _is_sqlite:
        return create_async_engine(
            database_url,
            echo=False,
            connect_args={
                "check_same_thread": False,
                "timeout": 30,  # aiosqlite busy wait in seconds
            },
        )
    return create_async_engine(database_url, echo=False)


engine = _make_engine(settings.database_url)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    """Create all tables (for SQLite dev mode — production uses Alembic)."""
    # Import all models so they register with Base.metadata
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Enable WAL mode for better concurrent access (multiple threads)
        if _is_sqlite:
            await conn.execute(text("PRAGMA journal_mode=WAL"))
            await conn.execute(text("PRAGMA busy_timeout=30000"))
            await conn.execute(text("PRAGMA synchronous=NORMAL"))
            # Add step_info column to background_jobs if missing (SQLite migration)
            try:
                await conn.execute(text(
                    "ALTER TABLE background_jobs ADD COLUMN step_info JSON"
                ))
            except Exception:
                pass  # Column already exists
            # Add brief column to niches if missing (SQLite migration)
            try:
                await conn.execute(text(
                    "ALTER TABLE niches ADD COLUMN brief JSON"
                ))
            except Exception:
                pass  # Column already exists
            # Add new content_briefs columns for skills integration + volumes
            _content_briefs_migrations = [
                "ALTER TABLE content_briefs ADD COLUMN recommendation_type VARCHAR(20) DEFAULT 'keyword'",
                "ALTER TABLE content_briefs ADD COLUMN geo_prompt_id VARCHAR(36)",
                "ALTER TABLE content_briefs ADD COLUMN suggested_skill VARCHAR(50)",
                "ALTER TABLE content_briefs ADD COLUMN skill_context TEXT",
                "ALTER TABLE content_briefs ADD COLUMN buyer_stage VARCHAR(30)",
                "ALTER TABLE content_briefs ADD COLUMN generated_content TEXT",
                "ALTER TABLE content_briefs ADD COLUMN search_volume INTEGER",
                "ALTER TABLE content_briefs ADD COLUMN cpc REAL",
                "ALTER TABLE content_briefs ADD COLUMN ev INTEGER",
                "ALTER TABLE content_briefs ADD COLUMN kd INTEGER",
                "ALTER TABLE content_briefs ADD COLUMN competitor_position INTEGER",
            ]
            for migration_sql in _content_briefs_migrations:
                try:
                    await conn.execute(text(migration_sql))
                except Exception:
                    pass  # Column already exists


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def create_worker_session() -> async_sessionmaker[AsyncSession]:
    """Create a fresh engine + session factory for background threads.

    Needed because the main engine's connections are bound to uvicorn's
    event loop and can't be reused from a different thread/loop.
    """
    worker_engine = _make_engine(settings.database_url)
    return async_sessionmaker(worker_engine, class_=AsyncSession, expire_on_commit=False)
