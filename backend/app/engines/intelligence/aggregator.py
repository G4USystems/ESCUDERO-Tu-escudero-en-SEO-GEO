"""Aggregator: collects DomainIntelligence from all database sources.

Pulls data from:
  - GapItem         → domains with competitor presence, content types, geo/serp flags
  - SourceCitation  → which domains LLMs cite, which providers
  - SerpResult      → SERP positions, keywords, content classifications
  - Domain catalog  → DA, traffic, domain_type, accepts_sponsored
  - BrandMention    → which brands are mentioned in LLM responses
  - Brand           → client vs competitor, brand names

Produces a list[DomainIntelligence] ready for score_key_opportunities().
"""

import uuid
from collections import defaultdict
from urllib.parse import urlparse

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.intelligence.key_opportunity import DomainIntelligence
from app.models.analysis import GapAnalysis, GapItem
from app.models.domain import Domain
from app.models.geo import GeoResponse, GeoRun, SourceCitation, BrandMention
from app.models.project import Brand
from app.models.seo import ContentClassification, SerpQuery, SerpResult


def _extract_domain(url: str) -> str:
    """Extract clean domain from URL."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
        return host.removeprefix("www.").lower()
    except Exception:
        return ""


async def collect_domain_intelligence(
    db: AsyncSession,
    project_id: uuid.UUID,
) -> list[DomainIntelligence]:
    """Aggregate all intelligence for a project into DomainIntelligence objects.

    Returns one DomainIntelligence per unique domain found across all sources.
    """
    # ── Load project brands ─────────────────────────────────────────
    brand_result = await db.execute(
        select(Brand).where(Brand.project_id == project_id)
    )
    brands = brand_result.scalars().all()

    client_domains: set[str] = set()
    competitor_names: dict[uuid.UUID, str] = {}
    brand_id_to_name: dict[uuid.UUID, str] = {}

    for b in brands:
        brand_id_to_name[b.id] = b.name
        if b.is_client:
            if b.domain:
                client_domains.add(b.domain.lower().removeprefix("www."))
        else:
            competitor_names[b.id] = b.name

    # ── Accumulator per domain ──────────────────────────────────────
    intel: dict[str, DomainIntelligence] = {}

    def _get(domain: str) -> DomainIntelligence:
        if domain not in intel:
            intel[domain] = DomainIntelligence(domain=domain)
        return intel[domain]

    # ── 1. Gap Items (from latest gap analysis) ─────────────────────
    latest_gap = await db.execute(
        select(GapAnalysis)
        .where(GapAnalysis.project_id == project_id, GapAnalysis.status == "completed")
        .order_by(GapAnalysis.created_at.desc())
        .limit(1)
    )
    gap_analysis = latest_gap.scalar_one_or_none()

    if gap_analysis:
        gap_items_result = await db.execute(
            select(GapItem).where(GapItem.analysis_id == gap_analysis.id)
        )
        for gi in gap_items_result.scalars().all():
            domain = gi.domain or _extract_domain(gi.url)
            if not domain:
                continue

            d = _get(domain)
            d.serp_urls.append(gi.url)

            if gi.content_type:
                d.serp_content_types.append(gi.content_type)
            if gi.domain_type and not d.domain_type:
                d.domain_type = gi.domain_type
            if gi.keyword:
                d.serp_keywords.append(gi.keyword)
            if gi.niche and gi.niche not in d.niches:
                d.niches.append(gi.niche)

            # Competitor brands from gap item
            if gi.competitor_brands and isinstance(gi.competitor_brands, dict):
                brands_list = gi.competitor_brands.get("brands", [])
                for b in brands_list:
                    if b not in d.competitor_brands_present:
                        d.competitor_brands_present.append(b)

            if gi.client_present:
                d.client_present = True

    # ── 2. GEO Source Citations (from latest geo run) ───────────────
    latest_geo = await db.execute(
        select(GeoRun)
        .where(GeoRun.project_id == project_id, GeoRun.status == "completed")
        .order_by(GeoRun.created_at.desc())
        .limit(1)
    )
    geo_run = latest_geo.scalar_one_or_none()

    if geo_run:
        citations_result = await db.execute(
            select(SourceCitation, GeoResponse.provider)
            .join(GeoResponse, SourceCitation.response_id == GeoResponse.id)
            .where(GeoResponse.run_id == geo_run.id)
        )
        for citation, provider in citations_result.all():
            domain = citation.domain or _extract_domain(citation.url)
            if not domain:
                continue

            d = _get(domain)
            d.geo_citation_count += 1
            if provider not in d.geo_providers:
                d.geo_providers.append(provider)

            # Track which brands are mentioned alongside this citation
            if citation.brand_id and citation.brand_id in brand_id_to_name:
                bname = brand_id_to_name[citation.brand_id]
                if bname not in d.geo_mentioned_brands:
                    d.geo_mentioned_brands.append(bname)

        # Also check brand mentions to enrich competitor info
        mentions_result = await db.execute(
            select(BrandMention, GeoResponse.provider)
            .join(GeoResponse, BrandMention.response_id == GeoResponse.id)
            .where(GeoResponse.run_id == geo_run.id)
        )
        # Track which domains are associated with brand mentions
        # via the source citations in the same response
        response_brands: dict[uuid.UUID, list[str]] = defaultdict(list)
        for mention, provider in mentions_result.all():
            if mention.brand_id in brand_id_to_name:
                response_brands[mention.response_id].append(
                    brand_id_to_name[mention.brand_id]
                )

        # Cross-reference: for each citation, add brands from same response
        for domain_key, d in intel.items():
            # Already handled via brand_id on citations above
            pass

    # ── 3. SERP Results (all queries for this project) ──────────────
    serp_queries_result = await db.execute(
        select(SerpQuery).where(SerpQuery.project_id == project_id)
    )
    query_ids = [q.id for q in serp_queries_result.scalars().all()]
    keyword_map: dict[uuid.UUID, str] = {}
    niche_map: dict[uuid.UUID, str | None] = {}

    serp_queries_result2 = await db.execute(
        select(SerpQuery).where(SerpQuery.project_id == project_id)
    )
    for q in serp_queries_result2.scalars().all():
        keyword_map[q.id] = q.keyword
        niche_map[q.id] = q.niche

    if query_ids:
        serp_results = await db.execute(
            select(SerpResult)
            .where(SerpResult.query_id.in_(query_ids))
        )
        for sr in serp_results.scalars().all():
            domain = sr.domain or _extract_domain(sr.url)
            if not domain:
                continue

            d = _get(domain)
            if sr.url not in d.serp_urls:
                d.serp_urls.append(sr.url)
            d.serp_positions.append(sr.position)

            kw = keyword_map.get(sr.query_id)
            if kw and kw not in d.serp_keywords:
                d.serp_keywords.append(kw)

            niche = niche_map.get(sr.query_id)
            if niche and niche not in d.niches:
                d.niches.append(niche)

        # Content classifications
        classifications_result = await db.execute(
            select(ContentClassification)
            .join(SerpResult, ContentClassification.serp_result_id == SerpResult.id)
            .where(SerpResult.query_id.in_(query_ids))
        )
        serp_result_domains: dict[uuid.UUID, str] = {}
        serp_results2 = await db.execute(
            select(SerpResult.id, SerpResult.domain, SerpResult.url)
            .where(SerpResult.query_id.in_(query_ids))
        )
        for sr_id, sr_domain, sr_url in serp_results2.all():
            serp_result_domains[sr_id] = sr_domain or _extract_domain(sr_url)

        for cc in classifications_result.scalars().all():
            domain = serp_result_domains.get(cc.serp_result_id, "")
            if domain and domain in intel:
                d = intel[domain]
                if cc.content_type not in d.serp_content_types:
                    d.serp_content_types.append(cc.content_type)

    # ── 4. Domain catalog (DA, traffic, type, sponsored) ────────────
    all_domains = list(intel.keys())
    if all_domains:
        domain_catalog_result = await db.execute(
            select(Domain).where(Domain.domain.in_(all_domains))
        )
        for dom in domain_catalog_result.scalars().all():
            if dom.domain in intel:
                d = intel[dom.domain]
                d.display_name = dom.display_name
                if dom.domain_type:
                    d.domain_type = dom.domain_type
                if dom.accepts_sponsored is not None:
                    d.accepts_sponsored = dom.accepts_sponsored
                d.domain_authority = dom.domain_authority
                d.monthly_traffic = dom.monthly_traffic_estimate

    # ── 5. Mark client domains ──────────────────────────────────────
    for domain_key in client_domains:
        if domain_key in intel:
            intel[domain_key].client_present = True

    # ── 6. Deduplicate URLs per domain ──────────────────────────────
    for d in intel.values():
        d.serp_urls = list(dict.fromkeys(d.serp_urls))  # preserve order, remove dupes

    return list(intel.values())
