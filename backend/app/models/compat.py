"""SQLAlchemy type compatibility: works with both SQLite and PostgreSQL.

- UUID  → String(36) on SQLite, native UUID on Postgres
- JSONB → JSON on SQLite, native JSONB on Postgres
- ARRAY → JSON on SQLite, native ARRAY on Postgres
"""

import json
import uuid as _uuid

from sqlalchemy import JSON, String, TypeDecorator
from sqlalchemy.dialects import postgresql

from app.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")


class PortableUUID(TypeDecorator):
    """UUID that works on both SQLite (as String) and Postgres (as native UUID)."""

    impl = String(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(postgresql.UUID(as_uuid=True))
        return dialect.type_descriptor(String(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value if isinstance(value, _uuid.UUID) else _uuid.UUID(str(value))
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value if isinstance(value, _uuid.UUID) else _uuid.UUID(str(value))


class PortableJSON(TypeDecorator):
    """JSON/JSONB that works on SQLite (JSON) and Postgres (JSONB)."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(postgresql.JSONB)
        return dialect.type_descriptor(JSON)


class PortableArray(TypeDecorator):
    """ARRAY that works on SQLite (as JSON list) and Postgres (as native ARRAY)."""

    impl = JSON
    cache_ok = True

    def __init__(self, item_type=String):
        super().__init__()
        self._item_type = item_type

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(postgresql.ARRAY(self._item_type))
        return dialect.type_descriptor(JSON)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name != "postgresql":
            return list(value)  # Store as JSON list in SQLite
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            return json.loads(value)
        return list(value)
