"""Celery tasks for GEO analysis runs — multi-turn conversation."""

import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.celery_app import celery
import app.database as _db
from app.engines.geo import get_adapter
from app.engines.geo.aggregator import aggregate
from app.engines.geo.response_parser import parse_response
from app.models.geo import BrandMention, GeoResponse, GeoRun, SourceCitation
from app.models.job import BackgroundJob
from app.models.project import Brand
from app.models.prompt import Prompt
from app.utils import cache, rate_limiter

GEO_SYSTEM_PROMPT = (
    "You are a helpful assistant. The user is asking about products, services, "
    "or agencies in a specific market. Provide a comprehensive, factual answer. "
    "If you know specific brands or companies, mention them by name. "
    "Include URLs or sources when possible."
)

# Standalone follow-up templates — inject context instead of sending full conversation
# This saves ~50-60% input tokens vs multi-turn conversation

_FOLLOWUP_WHY_ES = (
    "Un usuario preguntó: \"{original_prompt}\"\n"
    "Recomendaste estas empresas: {brands}.\n\n"
    "Explica brevemente por qué recomiendas cada una. "
    "¿En qué fuentes, artículos o sitios web te basas? Dame URLs concretas."
)
_FOLLOWUP_WHY_EN = (
    "A user asked: \"{original_prompt}\"\n"
    "You recommended these companies: {brands}.\n\n"
    "Briefly explain why you recommend each one. "
    "What sources, articles, or websites inform your recommendations? Provide specific URLs."
)

_FOLLOWUP_SOURCES_ES = (
    "Contexto: un usuario buscaba {context_type}.\n\n"
    "Si una empresa de este sector quisiera aparecer en las recomendaciones de asistentes de IA, "
    "¿en qué medios editoriales, blogs o sitios web debería publicar contenido o conseguir menciones? "
    "Dame una lista con URLs concretas de artículos específicos (no solo la página principal del medio) "
    "que traten directamente este tema. Formato: título del artículo + URL completa del artículo."
)
_FOLLOWUP_SOURCES_EN = (
    "Context: a user was looking for {context_type}.\n\n"
    "If a company in this sector wanted to appear in AI assistant recommendations, "
    "which editorial media, blogs, or websites should they publish on or get mentioned in? "
    "Give me a list with specific article URLs (not just the homepage) that directly cover this topic. "
    "Format: article title + full article URL."
)


def _run_async(coro):
    """Run async coroutine from sync Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _celery_task(**kwargs):
    """Decorator: use celery.task when available, otherwise identity."""
    if celery is not None:
        return celery.task(**kwargs)
    return lambda fn: fn


@_celery_task(bind=True, name="geo.run_analysis")
def run_geo_analysis(self, run_id: str, job_id: str | None = None):
    """Execute a full GEO analysis run (all prompts x all providers)."""
    return _run_async(_run_geo_analysis(self, run_id, job_id))


async def _run_geo_analysis(task, run_id: str, job_id: str | None):
    async with _db.async_session() as session:
        # Load the run
        result = await session.execute(
            select(GeoRun).where(GeoRun.id == uuid.UUID(run_id))
        )
        run = result.scalar_one_or_none()
        if not run:
            return {"error": f"GeoRun {run_id} not found"}

        # Update status
        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        await session.commit()

        if job_id:
            await _update_job(session, job_id, status="running")

        # Load prompts — scoped to niche if the run was launched for a specific niche
        prompt_query = select(Prompt).where(
            Prompt.project_id == run.project_id,
            Prompt.is_active.is_(True),
        )
        if run.niche_id:
            prompt_query = prompt_query.where(Prompt.niche_id == run.niche_id)
        prompt_result = await session.execute(prompt_query)
        prompts = prompt_result.scalars().all()
        run.total_prompts = len(prompts)
        await session.commit()

        # Load brands (for response parsing)
        brand_result = await session.execute(
            select(Brand).where(Brand.project_id == run.project_id)
        )
        brands = brand_result.scalars().all()
        brand_names = []
        for b in brands:
            brand_names.append(b.name)
            if b.aliases:
                brand_names.extend(b.aliases)

        # Detect language from first prompt
        language = "es"
        if prompts:
            first_text = prompts[0].text.lower()
            if any(w in first_text for w in ("what", "which", "best", "recommend")):
                language = "en"

        providers = run.providers
        completed = 0
        total = len(prompts) * len(providers)
        all_parsed: list[dict] = []

        for prompt_idx, prompt in enumerate(prompts):
            # Update step info once per prompt (not per provider)
            if job_id:
                await _update_job(
                    session, job_id,
                    step_info={
                        "current_prompt": prompt.text[:80],
                        "step": prompt_idx + 1,
                        "total": len(prompts),
                    },
                )

            # ── Run all providers in parallel for this prompt ──────────────
            # Each provider runs T1, then T2+T3 in parallel internally.
            # No DB writes here — pure LLM calls.
            tasks = [
                _run_llm_only(run, prompt, provider, brand_names, language)
                for provider in providers
            ]
            provider_results = await asyncio.gather(*tasks, return_exceptions=True)

            # ── Write results to DB serially (SQLite-safe) ─────────────────
            for i, result in enumerate(provider_results):
                if isinstance(result, Exception):
                    print(f"[GEO] Error {providers[i]}/{prompt.id}: {result}")
                    continue
                for (p_id, provider_name, turn, resp, parsed_obj) in result:
                    parsed_dict = await _write_turn_to_db(
                        session, run, prompt, provider_name, resp, parsed_obj, turn
                    )
                    if parsed_dict:
                        all_parsed.append(parsed_dict)

            completed += len(providers)
            run.completed_prompts = completed
            progress = completed / total if total else 1.0
            if job_id:
                await _update_job(session, job_id, progress=progress)
            await session.commit()

        # Mark complete
        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)
        await session.commit()

        if job_id:
            agg = aggregate(all_parsed, [b.name for b in brands], len(prompts))
            result_data = {
                "total_prompts": agg.total_prompts,
                "total_responses": agg.total_responses,
                "brands": [
                    {
                        "name": bm.brand_name,
                        "visibility_pct": bm.visibility_pct,
                        "avg_position": bm.avg_position,
                        "sentiment": bm.sentiment_label,
                        "mention_count": bm.mention_count,
                    }
                    for bm in agg.brands
                ],
            }
            await _update_job(session, job_id, status="completed", progress=1.0, result=result_data)

    return {"run_id": run_id, "status": "completed", "completed": completed}


async def _run_llm_only(
    run: GeoRun,
    prompt: Prompt,
    provider_name: str,
    brand_names: list[str],
    language: str,
) -> list[tuple]:
    """Pure LLM calls for one prompt/provider — no DB writes.

    Turn 1: original prompt (sequential, needed to get mentioned brands)
    Turn 2 + Turn 3: run in parallel (both standalone, T3 doesn't need T2)

    Returns list of (prompt_id, provider, turn, resp, parsed_obj).
    """
    is_es = language == "es"
    raw_turns: list[tuple] = []

    # ─── TURN 1: Original prompt ─────────────────────────────────────────
    t1_resp = await _query_single(provider_name, prompt.text)
    native_cit1 = getattr(t1_resp, "citations", []) or []
    t1_parsed = parse_response(t1_resp.text, brand_names, native_citations=native_cit1)
    raw_turns.append((prompt.id, provider_name, 1, t1_resp, t1_parsed))

    mentioned = [m.brand_name for m in t1_parsed.mentions]

    # ─── TURN 2: Why + sources (only if brands mentioned) ────────────────
    turn2_coro = None
    if mentioned:
        brands_str = ", ".join(mentioned[:5])
        short = prompt.text[:200]
        why_text = (
            _FOLLOWUP_WHY_ES.format(original_prompt=short, brands=brands_str)
            if is_es else
            _FOLLOWUP_WHY_EN.format(original_prompt=short, brands=brands_str)
        )
        turn2_coro = _query_single(provider_name, why_text)

    # ─── TURN 3: Editorial media targets (always, standalone) ────────────
    ctx = prompt.text[:150]
    sources_text = (
        _FOLLOWUP_SOURCES_ES.format(context_type=ctx)
        if is_es else
        _FOLLOWUP_SOURCES_EN.format(context_type=ctx)
    )
    turn3_coro = _query_single(provider_name, sources_text)

    # Run T2 and T3 in parallel (both are standalone, no dependency between them)
    if turn2_coro:
        t2_resp, t3_resp = await asyncio.gather(turn2_coro, turn3_coro)
        native_cit2 = getattr(t2_resp, "citations", []) or []
        t2_parsed = parse_response(t2_resp.text, brand_names, native_citations=native_cit2)
        raw_turns.append((prompt.id, provider_name, 2, t2_resp, t2_parsed))
    else:
        t3_resp = await turn3_coro

    native_cit3 = getattr(t3_resp, "citations", []) or []
    t3_parsed = parse_response(t3_resp.text, brand_names, native_citations=native_cit3)
    raw_turns.append((prompt.id, provider_name, 3, t3_resp, t3_parsed))

    return raw_turns


async def _write_turn_to_db(
    session,
    run: GeoRun,
    prompt: Prompt,
    provider_name: str,
    resp,
    parsed_obj,
    turn: int,
) -> dict | None:
    """Store a single GeoResponse turn and its parsed mentions/citations."""
    geo_response = GeoResponse(
        run_id=run.id,
        prompt_id=prompt.id,
        provider=provider_name,
        raw_response=resp.text,
        model_used=resp.model,
        tokens_used=resp.tokens_used,
        latency_ms=resp.latency_ms,
        turn=turn,
    )
    session.add(geo_response)
    await session.flush()

    for m in parsed_obj.mentions:
        brand_id = await _find_brand_id(session, run.project_id, m.brand_name)
        mention = BrandMention(
            response_id=geo_response.id,
            brand_id=brand_id,
            mention_text=m.brand_name,
            position=m.position,
            sentiment=m.sentiment,
            sentiment_score=m.sentiment_score,
            is_recommended=m.is_recommended,
            context=m.context,
        )
        session.add(mention)

    for c in parsed_obj.citations:
        brand_id = await _match_citation_to_brand(session, run.project_id, c.domain)
        citation = SourceCitation(
            response_id=geo_response.id,
            url=c.url,
            domain=c.domain,
            title=c.title,
            position=c.position,
            brand_id=brand_id,
        )
        session.add(citation)

    await session.flush()

    return {
        "prompt_id": str(prompt.id),
        "provider": provider_name,
        "turn": turn,
        "mentions": [
            {
                "brand_name": m.brand_name,
                "position": m.position,
                "sentiment": m.sentiment,
                "sentiment_score": m.sentiment_score,
                "is_recommended": m.is_recommended,
            }
            for m in parsed_obj.mentions
        ],
        "citations": [
            {"url": c.url, "domain": c.domain}
            for c in parsed_obj.citations
        ],
    }


async def _query_single(provider_name: str, prompt_text: str):
    """Send a single standalone query to the LLM."""
    await rate_limiter.acquire(provider_name)
    adapter = get_adapter(provider_name)
    try:
        return await adapter.query(prompt_text, system_prompt=GEO_SYSTEM_PROMPT)
    finally:
        await adapter.close()


# Brand lookup cache (per-session)
_brand_cache: dict[str, uuid.UUID] = {}


async def _find_brand_id(session, project_id: uuid.UUID, brand_name: str) -> uuid.UUID:
    """Find brand ID by name or alias within a project."""
    key = f"{project_id}:{brand_name.lower()}"
    if key in _brand_cache:
        return _brand_cache[key]

    result = await session.execute(
        select(Brand).where(Brand.project_id == project_id)
    )
    brands = result.scalars().all()

    for b in brands:
        if b.name.lower() == brand_name.lower():
            _brand_cache[key] = b.id
            return b.id
        if b.aliases:
            for alias in b.aliases:
                if alias.lower() == brand_name.lower():
                    _brand_cache[key] = b.id
                    return b.id

    if brands:
        _brand_cache[key] = brands[0].id
        return brands[0].id
    raise ValueError(f"No brands found for project {project_id}")


async def _match_citation_to_brand(session, project_id: uuid.UUID, domain: str) -> uuid.UUID | None:
    """Try to match a cited domain to a brand's known domains."""
    if not domain:
        return None

    from app.models.project import BrandDomain

    result = await session.execute(
        select(BrandDomain).where(BrandDomain.domain == domain)
    )
    bd = result.scalar_one_or_none()
    if bd:
        return bd.brand_id
    return None


async def _update_job(
    session, job_id: str, *, status: str | None = None, progress: float | None = None,
    result: dict | None = None, step_info: dict | None = None
):
    """Update a BackgroundJob record."""
    job_result = await session.execute(
        select(BackgroundJob).where(BackgroundJob.id == uuid.UUID(job_id))
    )
    job = job_result.scalar_one_or_none()
    if not job:
        return
    if status:
        job.status = status
        if status == "running" and not job.started_at:
            job.started_at = datetime.now(timezone.utc)
        if status == "completed":
            job.completed_at = datetime.now(timezone.utc)
    if progress is not None:
        job.progress = progress
    if result is not None:
        job.result = result
    if step_info is not None:
        job.step_info = step_info
    await session.commit()
