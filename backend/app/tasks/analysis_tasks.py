"""Celery tasks for Gap Analysis."""

import asyncio
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.celery_app import celery
import app.database as _db
from app.engines.domain.exclusion_engine import is_excluded
from app.engines.domain.rules_engine import classify_by_rules
from app.engines.intelligence.brief_generator import generate_briefs
from app.engines.intelligence.gap_analyzer import analyze_gaps
from app.engines.intelligence.scoring import prioritize
from app.models.analysis import ActionBrief, GapAnalysis, GapItem
from app.models.geo import GeoResponse, GeoRun, SourceCitation
from app.models.job import BackgroundJob
from app.models.niche import NicheBrand
from app.models.project import Brand, BrandDomain
from app.models.seo import ContentClassification, SerpQuery, SerpResult


def _is_domain_only_url(url: str) -> bool:
    """Return True if the URL is just a domain homepage (no article path)."""
    try:
        path = urlparse(url).path.rstrip("/")
        return path == ""
    except Exception:
        return False


def _run_async(coro):
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


@_celery_task(bind=True, name="analysis.run_gap_analysis")
def run_gap_analysis(self, analysis_id: str, job_id: str | None = None):
    """Run a complete gap analysis."""
    return _run_async(_run_gap_analysis(analysis_id, job_id))


async def _run_gap_analysis(analysis_id: str, job_id: str | None) -> dict:
    async with _db.async_session() as session:
        # Load analysis
        result = await session.execute(
            select(GapAnalysis).where(GapAnalysis.id == uuid.UUID(analysis_id))
        )
        analysis = result.scalar_one_or_none()
        if not analysis:
            return {"error": "Analysis not found"}

        analysis.status = "running"
        await session.commit()

        if job_id:
            await _update_job(session, job_id, status="running")

        project_id = analysis.project_id
        niche_id = analysis.niche_id
        niche_slug = analysis.niche_slug

        # Load client brand (always project-level)
        all_brand_result = await session.execute(
            select(Brand).where(Brand.project_id == project_id)
        )
        all_brands = all_brand_result.scalars().all()
        client_brands = [b for b in all_brands if b.is_client]

        # Load competitors scoped to this niche (via NicheBrand), fallback to all if no niche
        if niche_id:
            niche_brand_result = await session.execute(
                select(NicheBrand)
                .where(NicheBrand.niche_id == niche_id)
                .options(selectinload(NicheBrand.brand))
            )
            competitor_brands = [
                nb.brand for nb in niche_brand_result.scalars().all()
                if not nb.brand.is_client
            ]
            brands = client_brands + competitor_brands
        else:
            brands = all_brands
            competitor_brands = [b for b in all_brands if not b.is_client]

        client_brand_names = []
        for b in client_brands:
            client_brand_names.append(b.name)
            if b.aliases:
                client_brand_names.extend(b.aliases)

        competitor_brand_names = []
        for b in competitor_brands:
            competitor_brand_names.append(b.name)
            if b.aliases:
                competitor_brand_names.extend(b.aliases)

        # Load client domains
        client_domain_result = await session.execute(
            select(BrandDomain).where(
                BrandDomain.brand_id.in_([b.id for b in client_brands])
            )
        )
        client_domains = [bd.domain for bd in client_domain_result.scalars().all()]

        # Collect GEO citations
        geo_citations = []
        if analysis.geo_run_id:
            citation_result = await session.execute(
                select(SourceCitation)
                .join(GeoResponse)
                .where(GeoResponse.run_id == analysis.geo_run_id)
            )
            for c in citation_result.scalars().all():
                brand_name = ""
                if c.brand_id:
                    for b in brands:
                        if b.id == c.brand_id:
                            brand_name = b.name
                            break

                geo_citations.append({
                    "url": c.url,
                    "domain": c.domain or "",
                    "brand_name": brand_name,
                    "domain_type": classify_by_rules(c.domain or "").domain_type,
                })

        if job_id:
            await _update_job(session, job_id, progress=0.3)

        # Collect SERP results — filter by niche if set
        serp_data = []
        serp_filter = [SerpQuery.project_id == project_id]
        if niche_slug:
            serp_filter.append(SerpQuery.niche == niche_slug)
        serp_query_result = await session.execute(
            select(SerpQuery)
            .where(*serp_filter)
            .options(
                selectinload(SerpQuery.results)
                .selectinload(SerpResult.classification)
            )
        )
        for sq in serp_query_result.scalars().all():
            for sr in sq.results:
                ct = sr.classification
                serp_data.append({
                    "url": sr.url,
                    "domain": sr.domain or "",
                    "title": sr.title or "",
                    "position": sr.position,
                    "keyword": sq.keyword,
                    "niche": sq.niche,
                    "content_type": ct.content_type if ct else None,
                    "domain_type": classify_by_rules(sr.domain or "").domain_type,
                })

        if job_id:
            await _update_job(session, job_id, progress=0.5)

        # ── Enrich GEO citations with specific article URLs ───────────────────
        # LLMs often cite just domain names (e.g. "techcrunch.com") instead of
        # specific article URLs. We use two strategies to find articles:
        #   1. Cross-reference with already-fetched SERP results (free, instant)
        #   2. Targeted site:domain search for any domain still missing (uses API)
        domain_to_best_article: dict[str, str] = {}

        # Strategy 1: cross-reference with existing SERP data
        _domain_articles: dict[str, list[dict]] = {}
        for sr in serp_data:
            d = sr["domain"]
            if d:
                _domain_articles.setdefault(d, []).append(sr)
        for d, items in _domain_articles.items():
            domain_to_best_article[d] = min(items, key=lambda x: x["position"] or 999)["url"]

        # Strategy 2: targeted site: searches for GEO-cited domains still missing
        if geo_citations:
            missing_domains = {
                cit["domain"] for cit in geo_citations
                if cit["domain"] and _is_domain_only_url(cit["url"])
                and cit["domain"] not in domain_to_best_article
            }
            if missing_domains:
                search_keywords = list({sr["keyword"] for sr in serp_data if sr.get("keyword")})
                if not search_keywords and niche_slug:
                    search_keywords = [niche_slug.replace("-", " ")]
                if search_keywords:
                    from app.engines.seo import get_serp_provider
                    from app.utils import rate_limiter
                    try:
                        provider = get_serp_provider()
                        kw = search_keywords[0]
                        for domain in list(missing_domains)[:8]:  # cap to avoid too many calls
                            await rate_limiter.acquire("serp")
                            try:
                                resp = await provider.search(
                                    f"site:{domain} {kw}",
                                    location="Spain",
                                    language="es",
                                    num_results=3,
                                )
                                if resp.items:
                                    domain_to_best_article[domain] = resp.items[0].url
                            except Exception:
                                pass
                    except Exception:
                        pass  # No SERP provider configured — skip targeted search

        # Apply enrichment: replace domain-only URLs with specific article URLs
        for cit in geo_citations:
            if _is_domain_only_url(cit["url"]) and cit["domain"] in domain_to_best_article:
                cit["url"] = domain_to_best_article[cit["domain"]]

        # Build excluded domains set
        excluded: set[str] = set()
        for d in client_domains:
            excluded.add(d.lower())
        # Check exclusion rules for each unique domain
        all_domains = {c["domain"] for c in geo_citations} | {s["domain"] for s in serp_data}
        for d in all_domains:
            if await is_excluded(session, project_id, d):
                excluded.add(d)

        if job_id:
            await _update_job(session, job_id, progress=0.6)

        # Run gap analyzer
        gap_result = analyze_gaps(
            geo_citations=geo_citations,
            serp_results=serp_data,
            client_brand_names=client_brand_names,
            competitor_brand_names=competitor_brand_names,
            client_domains=client_domains,
            excluded_domains=excluded,
        )

        if job_id:
            await _update_job(session, job_id, progress=0.7)

        # Store gap items in DB
        for opp in gap_result.opportunities:
            gap_item = GapItem(
                analysis_id=analysis.id,
                url=opp.url,
                domain=opp.domain,
                competitor_brands={"brands": opp.competitor_brands},
                client_present=opp.client_present,
                found_in_geo=opp.found_in_geo,
                found_in_serp=opp.found_in_serp,
                content_type=opp.content_type,
                domain_type=opp.domain_type,
                opportunity_score=opp.opportunity_score,
                keyword=opp.keyword,
                niche=opp.niche,
            )
            session.add(gap_item)

        await session.flush()

        if job_id:
            await _update_job(session, job_id, progress=0.8)

        # Prioritize and generate briefs
        opp_dicts = [
            {
                "url": o.url,
                "domain": o.domain,
                "opportunity_score": o.opportunity_score,
                "content_type": o.content_type,
                "domain_type": o.domain_type,
                "found_in_geo": o.found_in_geo,
                "found_in_serp": o.found_in_serp,
                "competitor_brands": o.competitor_brands,
                "keyword": o.keyword,
                "niche": o.niche,
            }
            for o in gap_result.opportunities
        ]

        prioritized = prioritize(opp_dicts)
        brief_inputs = []
        for p, o in zip(prioritized, opp_dicts):
            brief_inputs.append({**o, "priority": p.priority, "recommended_action": p.recommended_action})

        briefs = generate_briefs(brief_inputs)

        # Store briefs
        gap_items_result = await session.execute(
            select(GapItem).where(GapItem.analysis_id == analysis.id)
        )
        gap_items_list = gap_items_result.scalars().all()
        gap_items_by_url = {gi.url: gi.id for gi in gap_items_list}

        for brief in briefs:
            ab = ActionBrief(
                project_id=project_id,
                gap_item_id=gap_items_by_url.get(brief.target_url),
                target_url=brief.target_url,
                target_domain=brief.target_domain,
                recommended_content_type=brief.recommended_content_type,
                recommended_keyword=brief.recommended_keyword,
                recommended_approach=brief.recommended_approach,
                priority=brief.priority,
            )
            session.add(ab)

        # Complete
        analysis.status = "completed"
        analysis.completed_at = datetime.now(timezone.utc)
        analysis.results = {
            "total_urls_analyzed": gap_result.total_urls_analyzed,
            "gaps_found": gap_result.gaps_found,
            "briefs_generated": len(briefs),
        }
        await session.commit()

        if job_id:
            await _update_job(
                session, job_id,
                status="completed",
                progress=1.0,
                result=analysis.results,
            )

    return {"analysis_id": analysis_id, "gaps": gap_result.gaps_found, "briefs": len(briefs)}


async def _update_job(session, job_id: str, **kwargs):
    result = await session.execute(
        select(BackgroundJob).where(BackgroundJob.id == uuid.UUID(job_id))
    )
    job = result.scalar_one_or_none()
    if not job:
        return
    for k, v in kwargs.items():
        if k == "status":
            setattr(job, k, v)
            if v == "running" and not job.started_at:
                job.started_at = datetime.now(timezone.utc)
            if v == "completed":
                job.completed_at = datetime.now(timezone.utc)
        elif k == "progress":
            job.progress = v
        elif k == "result":
            job.result = v
    await session.commit()
