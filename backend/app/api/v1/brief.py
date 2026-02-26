"""Brief generation endpoint — aggregates SEO + GEO gaps and generates a narrative via LLM."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.geo import BrandMention, GeoResponse, GeoRun
from app.models.niche import Niche, NicheBrand
from app.models.project import Brand, Project
from app.models.seo import SerpQuery, SerpResult

router = APIRouter(prefix="/projects", tags=["brief"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class SeoGap(BaseModel):
    keyword: str
    top_competitor: str
    competitor_position: int


class GeoGap(BaseModel):
    prompt_text: str
    competitors_mentioned: list[str]


class BriefData(BaseModel):
    project_name: str
    niche_name: str
    client_name: str
    generated_at: str
    seo_gaps: list[SeoGap]
    geo_gaps: list[GeoGap]
    client_seo_keywords: int       # keywords where client appears in top 10
    total_seo_keywords: int
    client_geo_prompts: int        # prompts where client is mentioned
    total_geo_prompts: int
    narrative: str                 # LLM-generated brief text


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean_domain(domain: str) -> str:
    return domain.replace("www.", "").lower().strip("/")


async def _generate_brief_narrative(
    project_name: str,
    niche_name: str,
    client_name: str,
    seo_gaps: list[SeoGap],
    geo_gaps: list[GeoGap],
    client_seo_keywords: int,
    total_seo_keywords: int,
    client_geo_prompts: int,
    total_geo_prompts: int,
) -> str:
    from app.config import settings

    seo_gap_lines = "\n".join(
        f'  - "{g.keyword}" — {g.top_competitor} en #{g.competitor_position}, tú no apareces'
        for g in seo_gaps[:5]
    )
    geo_gap_lines = "\n".join(
        f'  - "{g.prompt_text[:80]}..." — mencionan: {", ".join(g.competitors_mentioned[:2])}'
        for g in geo_gaps[:5]
    )

    user_prompt = f"""Genera un brief semanal de visibilidad SEO+GEO para el cliente.

DATOS:
- Cliente: {client_name} (proyecto: {project_name})
- Nicho: {niche_name}
- SEO: aparece en {client_seo_keywords}/{total_seo_keywords} keywords rastreadas en top 10
- GEO: es mencionado en {client_geo_prompts}/{total_geo_prompts} prompts analizados

GAPS SEO (keywords donde competidores ranquean y el cliente no):
{seo_gap_lines or "  (sin gaps detectados)"}

GAPS GEO (prompts donde se menciona a competidores pero no al cliente):
{geo_gap_lines or "  (sin gaps detectados)"}

Escribe el brief en español. Sé directo y accionable. Máximo 200 palabras.
Formato: párrafo de situación → top 3 oportunidades priorizadas → acción concreta esta semana.
No uses bullet points, escribe en prosa natural."""

    system = (
        "Eres un consultor de marketing digital experto en SEO y GEO (visibilidad en LLMs). "
        "Tu estilo es directo, específico y orientado a resultados. No uses frases genéricas."
    )

    async def _call_llm(prompt: str, sys: str) -> str:
        if settings.anthropic_api_key:
            from app.engines.geo.claude_adapter import ClaudeAdapter
            adapter = ClaudeAdapter(model="claude-haiku-4-5-20251001")
            resp = await adapter.query(prompt, system_prompt=sys)
            await adapter.close()
            return resp.text

        if settings.openai_api_key:
            from app.engines.geo.openai_adapter import OpenAIAdapter
            adapter = OpenAIAdapter()
            resp = await adapter.query(prompt, system_prompt=sys)
            await adapter.close()
            return resp.text

        if settings.openrouter_api_key:
            from app.engines.geo.openrouter_adapter import OpenRouterAdapter
            adapter = OpenRouterAdapter()
            resp = await adapter.query(prompt, system_prompt=sys)
            await adapter.close()
            return resp.text

        return "No hay API key configurada para generar el brief narrativo."

    try:
        return await _call_llm(user_prompt, system)
    except Exception as e:
        return f"Error generando narrativa: {e}"


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/{project_id}/niches/{slug}/brief", response_model=BriefData)
async def get_niche_brief(
    project_id: uuid.UUID,
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Generate a SEO+GEO brief for a niche: gaps, opportunities, and LLM narrative."""

    # ── 1. Load project + niche ───────────────────────────────────────────────
    project_result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.brands))
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    niche_result = await db.execute(
        select(Niche)
        .where(Niche.project_id == project_id, Niche.slug == slug)
    )
    niche = niche_result.scalar_one_or_none()
    if not niche:
        raise HTTPException(404, "Niche not found")

    # ── 2. Identify client brand and competitors ──────────────────────────────
    client_brand = next((b for b in project.brands if b.is_client), None)
    client_domain = _clean_domain(client_brand.domain) if client_brand and client_brand.domain else ""
    client_name = client_brand.name if client_brand else project.name

    # Load niche competitors
    nb_result = await db.execute(
        select(NicheBrand)
        .where(NicheBrand.niche_id == niche.id)
        .options(selectinload(NicheBrand.brand))
    )
    niche_brands = nb_result.scalars().all()
    competitor_brands: list[Brand] = [
        nb.brand for nb in niche_brands
        if not nb.brand.is_client and nb.brand.domain
    ]
    competitor_domains = {_clean_domain(b.domain): b.name for b in competitor_brands}

    # ── 3. SEO gaps ───────────────────────────────────────────────────────────
    queries_result = await db.execute(
        select(SerpQuery)
        .where(SerpQuery.project_id == project_id, SerpQuery.niche == slug)
        .options(selectinload(SerpQuery.results))
    )
    queries = queries_result.scalars().all()

    seo_gaps: list[SeoGap] = []
    client_seo_keywords = 0

    for q in queries:
        results_sorted = sorted(q.results, key=lambda r: r.position)
        top10 = [r for r in results_sorted if r.position <= 10]

        client_in_top10 = any(
            client_domain and r.domain and _clean_domain(r.domain) == client_domain
            for r in top10
        )
        if client_in_top10:
            client_seo_keywords += 1
            continue

        # Find top competitor in this keyword
        top_competitor: tuple[str, int] | None = None
        for r in top10:
            if r.domain:
                d = _clean_domain(r.domain)
                if d in competitor_domains:
                    top_competitor = (competitor_domains[d], r.position)
                    break

        if top_competitor:
            seo_gaps.append(SeoGap(
                keyword=q.keyword,
                top_competitor=top_competitor[0],
                competitor_position=top_competitor[1],
            ))

    # Sort gaps by competitor position (closest to #1 first)
    seo_gaps.sort(key=lambda g: g.competitor_position)

    # ── 4. GEO gaps ───────────────────────────────────────────────────────────
    # Get the latest completed GEO run for this niche
    run_result = await db.execute(
        select(GeoRun)
        .where(
            GeoRun.project_id == project_id,
            GeoRun.niche_id == niche.id,
            GeoRun.status == "completed",
        )
        .order_by(GeoRun.created_at.desc())
        .limit(1)
    )
    latest_run = run_result.scalar_one_or_none()

    geo_gaps: list[GeoGap] = []
    client_geo_prompts = 0
    total_geo_prompts = 0

    if latest_run:
        from app.models.prompt import Prompt

        responses_result = await db.execute(
            select(GeoResponse).where(GeoResponse.run_id == latest_run.id)
        )
        responses = responses_result.scalars().all()

        for resp in responses:
            # Load prompt text
            prompt_result = await db.execute(
                select(Prompt).where(Prompt.id == resp.prompt_id)
            )
            prompt = prompt_result.scalar_one_or_none()
            if not prompt:
                continue

            total_geo_prompts += 1

            # Load mentions for this response
            mentions_result = await db.execute(
                select(BrandMention).where(BrandMention.response_id == resp.id)
            )
            mentions = mentions_result.scalars().all()

            mentioned_brand_ids = {str(m.brand_id) for m in mentions}

            client_mentioned = client_brand and str(client_brand.id) in mentioned_brand_ids
            if client_mentioned:
                client_geo_prompts += 1

            competitors_here = [
                b.name for b in competitor_brands
                if str(b.id) in mentioned_brand_ids
            ]

            if not client_mentioned and competitors_here:
                geo_gaps.append(GeoGap(
                    prompt_text=prompt.text,
                    competitors_mentioned=competitors_here,
                ))

    # ── 5. Generate LLM narrative ─────────────────────────────────────────────
    narrative = await _generate_brief_narrative(
        project_name=project.name,
        niche_name=niche.name,
        client_name=client_name,
        seo_gaps=seo_gaps,
        geo_gaps=geo_gaps,
        client_seo_keywords=client_seo_keywords,
        total_seo_keywords=len(queries),
        client_geo_prompts=client_geo_prompts,
        total_geo_prompts=total_geo_prompts,
    )

    return BriefData(
        project_name=project.name,
        niche_name=niche.name,
        client_name=client_name,
        generated_at=datetime.utcnow().isoformat(),
        seo_gaps=seo_gaps[:10],
        geo_gaps=geo_gaps[:10],
        client_seo_keywords=client_seo_keywords,
        total_seo_keywords=len(queries),
        client_geo_prompts=client_geo_prompts,
        total_geo_prompts=total_geo_prompts,
        narrative=narrative,
    )
