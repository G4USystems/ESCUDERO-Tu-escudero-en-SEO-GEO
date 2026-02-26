"""Celery app configuration.

When redis_url is empty (local dev), celery_app is set to None
and tasks run inline via inline_runner instead.
"""

from app.config import settings

celery_app = None

if settings.redis_url:
    from celery import Celery

    celery_app = Celery(
        "seo_geo_partner",
        broker=settings.redis_url,
        backend=settings.redis_url,
    )

    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="Europe/Madrid",
        enable_utc=True,
        task_track_started=True,
        task_acks_late=True,
        worker_prefetch_multiplier=1,
    )

    celery_app.autodiscover_tasks(["app.tasks"])

# Alias for backward compat
celery = celery_app
