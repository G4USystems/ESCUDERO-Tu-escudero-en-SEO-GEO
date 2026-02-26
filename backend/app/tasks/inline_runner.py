"""Inline task runner for local dev (no Redis/Celery required).

When redis_url is empty, tasks run in a background thread with their
own event loop and a fresh DB engine — same pattern as Celery workers.
"""

import asyncio
import threading
import traceback
import uuid
from datetime import datetime, timezone

from app.config import settings


def use_inline() -> bool:
    """Return True if we should run tasks inline (no Redis)."""
    return not settings.redis_url


def dispatch_inline(coro_factory, job_id: str | None = None):
    """Schedule an async task to run in a background thread.

    coro_factory: a zero-argument callable that returns a coroutine.
    job_id: optional BackgroundJob ID to mark as failed on exception.

    Runs the task in a separate thread with a fresh DB engine
    (the main engine's connections can't cross threads/event loops).
    """

    def _target():
        import sys
        import app.database as db_module
        from app.database import create_worker_session

        print(f"[inline_runner] Thread started for job={job_id}", flush=True)

        # Patch async_session for this thread so all task code
        # (geo_tasks, seo_tasks, etc.) uses the fresh engine
        original_session = db_module.async_session
        worker_session = create_worker_session()
        db_module.async_session = worker_session

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            print(f"[inline_runner] Running task for job={job_id}", flush=True)
            loop.run_until_complete(coro_factory())
            print(f"[inline_runner] Task completed for job={job_id}", flush=True)
        except Exception as e:
            print(f"[inline_runner] Task FAILED for job={job_id}: {e}", flush=True)
            traceback.print_exc(file=sys.stdout)
            sys.stdout.flush()
            if job_id:
                try:
                    loop.run_until_complete(_mark_job_failed(worker_session, job_id, str(e)))
                except Exception as mark_err:
                    print(f"[inline_runner] Could not mark job failed: {mark_err}", flush=True)
        finally:
            loop.close()
            # Restore original session for safety
            db_module.async_session = original_session

    thread = threading.Thread(target=_target, daemon=True, name=f"geo-worker-{job_id}")
    thread.start()
    print(f"[inline_runner] Thread dispatched: {thread.name}", flush=True)


async def _mark_job_failed(session_factory, job_id: str, error: str):
    """Mark a background job as failed with an error message."""
    from sqlalchemy import select
    from app.models.job import BackgroundJob

    async with session_factory() as session:
        result = await session.execute(
            select(BackgroundJob).where(BackgroundJob.id == uuid.UUID(job_id))
        )
        job = result.scalar_one_or_none()
        if job:
            job.status = "failed"
            job.error = error
            job.completed_at = datetime.now(timezone.utc)
            await session.commit()
