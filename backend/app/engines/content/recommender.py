"""Recommend content keywords using a brief-driven approach.

Primary   : LLM reads the niche brief → generates relevant keywords → DataForSEO validates volume
Secondary : Gap analysis — SERP queries where competitors appear and client doesn't
Tertiary  : Configured SERP queries for this niche (always present as fallback)

Filtered out: comparison keywords AND any keyword containing a competitor brand name.
"""

import json
import logging
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analysis import GapAnalysis, GapItem
from app.models.niche import Niche, NicheBrand
from app.models.project import Brand, Project as ProjectModel
from app.models.seo import SerpQuery

log = logging.getLogger(__name__)

# ─── Pattern helpers ─────────────────────────────────────────────────────────

_COMPARISON_RE = re.compile(
    r"\b(vs\.?|versus|alternativa(s)?|comparativa(s)?|comparar|alternative(s)?|mejor\s+que|frente\s+a)\b",
    re.IGNORECASE,
)
_RANKING_RE = re.compile(
    r"\b(mejor(es)?|top\s*\d*|ranking|best|mejores)\b",
    re.IGNORECASE,
)
_GUIDE_RE = re.compile(
    r"\b(c[oó]mo|gu[ií]a|tutorial|qu[eé]\s+es|paso\s+a\s+paso|how\s+to)\b",
    re.IGNORECASE,
)
_SOLUTION_RE = re.compile(
    r"\b(precio(s)?|comprar|gratis|free|descarga|download|coste|cost)\b",
    re.IGNORECASE,
)
_JARGON_RE = re.compile(
    r"\b(b2b|b2c|benchmark|ecosistema|medios\s+especializados|vertical(es)?|"
    r"startup(s)?|scaleup(s)?|unicornio(s)?|fintech\s+\w+\s+(en|de)\s+(colombia|argentina|m[eé]xico|chile|per[uú]|latam|latinoam[eé]rica)|"
    r"\w+\s+(en|de)\s+(colombia|argentina|per[uú]|chile|latam)\b)\b",
    re.IGNORECASE,
)

_TRUST_RE = re.compile(
    r"\b(confianza|confiable|fiable|seguro|seguridad|regulad[ao]|regulaci[oó]n|garantía|garantia|"
    r"estafa|legitimo|legítimo|es\s+seguro|es\s+fiable|opinione?s|rese[ñn]as?|"
    r"c[oó]mo\s+gana\s+dinero|modelo\s+de\s+negocio|transparencia|comisione?s|coste[s]?\s+oculto[s]?|"
    r"sin\s+comisione?s|c[oó]mo\s+funciona|de\s+d[oó]nde\s+saca|rentabilidad\s+real)\b",
    re.IGNORECASE,
)


def _detect_category(keyword: str) -> str | None:
    """Return content category for keyword, or None to skip."""
    if _COMPARISON_RE.search(keyword):
        return None
    if _JARGON_RE.search(keyword):
        return None
    if _TRUST_RE.search(keyword):
        return "authority"
    if _RANKING_RE.search(keyword):
        return "ranking"
    if _GUIDE_RE.search(keyword):
        return "guide"
    if _SOLUTION_RE.search(keyword):
        return "solution"
    return "guide"


def _build_competitor_filter(competitor_names: list[str]):
    """Return a function that returns True if the keyword contains a competitor brand name.

    Matches the FULL brand name as a phrase (not individual words) to avoid
    blocking unrelated keywords that happen to share a common word.
    E.g. "Flat 101" matches "flat 101 opiniones" but NOT "tarifa flat" or "101 días".
    Single-word names (≥4 chars) use word boundaries.
    """
    if not competitor_names:
        return lambda kw: False

    patterns = []
    for name in competitor_names:
        name = name.strip()
        if not name:
            continue
        words = name.split()
        if len(words) == 1 and len(name) >= 4:
            # Single meaningful word — use word boundary
            patterns.append(r"\b" + re.escape(name) + r"\b")
        elif len(words) > 1:
            # Multi-word brand: match the full phrase
            patterns.append(re.escape(name))

    if not patterns:
        return lambda kw: False

    combined = re.compile("(" + "|".join(patterns) + ")", re.IGNORECASE)
    return lambda kw: bool(combined.search(kw))


# ─── LLM helper ──────────────────────────────────────────────────────────────

async def _call_llm(prompt: str, system_prompt: str) -> str:
    """Call best available LLM (OpenRouter → Anthropic → OpenAI)."""
    from app.config import settings

    if settings.openrouter_api_key:
        from app.engines.geo.openrouter_adapter import OpenRouterAdapter
        adapter = OpenRouterAdapter()
        resp = await adapter.query(prompt, system_prompt=system_prompt)
        await adapter.close()
        return resp.text

    if settings.anthropic_api_key:
        from app.engines.geo.claude_adapter import ClaudeAdapter
        adapter = ClaudeAdapter()
        resp = await adapter.query(prompt, system_prompt=system_prompt)
        await adapter.close()
        return resp.text

    if settings.openai_api_key:
        from app.engines.geo.openai_adapter import OpenAIAdapter
        adapter = OpenAIAdapter()
        resp = await adapter.query(prompt, system_prompt=system_prompt)
        await adapter.close()
        return resp.text

    raise RuntimeError("No LLM API key configured")


_MARKET_LABELS = {
    "es": "Spain (España)",
    "us": "United States",
    "uk": "United Kingdom",
    "de": "Germany",
    "fr": "France",
    "it": "Italy",
    "mx": "Mexico",
    "latam": "Latin America",
}


async def _generate_keywords_from_brief(
    niche_name: str,
    brief: dict | None,
    language: str,
    market: str = "es",
    count: int = 80,
) -> list[str]:
    """Use LLM to generate keyword ideas from the niche brief.

    Returns a list of keyword strings, topically relevant by construction.
    """
    # Build brief context (truncate each section to avoid excessive tokens)
    brief_context = ""
    if brief and isinstance(brief, dict):
        parts = []
        for key in sorted(brief.keys()):
            val = str(brief.get(key) or "").strip()
            if val:
                parts.append(f"[{key}] {val[:600]}")
        brief_context = "\n\n".join(parts)

    market_label = _MARKET_LABELS.get(market, market)
    lang_instruction = "in Spanish (castellano)" if language == "es" else f"in {language}"

    system_prompt = (
        "You are an expert SEO keyword researcher specializing in user-intent keywords. "
        "Your task is to generate specific, searchable keywords that real users type into Google. "
        "Return ONLY a valid JSON array of strings. No explanations, no markdown, no code blocks."
    )

    user_prompt = f"""Target market: {market_label}
Niche: "{niche_name}"

Brief context (use this to understand the specific product/service and audience):
{brief_context or "(no brief provided — base keywords strictly on the niche name)"}

Generate {count} SEO keywords {lang_instruction} following these STRICT rules:

MUST follow:
1. Keywords must be things a real person types into Google — NOT industry jargon or insider terms
2. Specific to {market_label} — NEVER generate keywords for other countries/regions
3. 2–6 words long, natural search phrases
4. Reflect what the TARGET AUDIENCE searches, not what marketers write about
5. NO brand names (neither client nor competitors), NO "vs" comparisons
6. NO pure B2B/industry terms like "benchmark", "b2c", "medios especializados", "ecosistema"

Good keyword types to include:
- How-to and educational: "cómo [do something specific to this product/service]"
- Trust/safety: "es seguro [specific product type]", "regulación [specific sector in {market_label}]"
- Transparency: "cómo gana dinero [platform type]", "comisiones [specific service]"
- Reputation: "opiniones [product type]", "es fiable [service type]"
- Problems the audience faces (concrete, not abstract)
- Informational queries the specific target audience uses

BAD examples (do NOT generate these):
- "[sector] en colombia" (wrong country)
- "[sector] b2c" (industry jargon)
- "benchmark [sector]" (insider term)
- "medios especializados [sector]" (not a user search)
- "ecosistema [sector]" (abstract jargon)

Return ONLY a JSON array:
["keyword one", "keyword two", "keyword three"]"""

    try:
        raw = await _call_llm(user_prompt, system_prompt)
        # Extract JSON array from response
        match = re.search(r'\[[\s\S]*?\]', raw)
        if match:
            keywords = json.loads(match.group())
            if isinstance(keywords, list):
                clean = [str(k).strip() for k in keywords if k and len(str(k).strip()) > 3]
                log.info("_generate_keywords_from_brief: got %d keywords for %r", len(clean), niche_name)
                return clean
    except Exception as e:
        log.warning("LLM keyword generation failed: %s", e)

    return []


# ─── Main recommender ────────────────────────────────────────────────────────


async def recommend_keywords(
    project_id: str,
    niche_slug: str,
    db: AsyncSession,
) -> list[dict]:
    """Return keyword recommendations for a niche.

    Returns list of dicts with keys:
        keyword, category, score, competitor_coverage, source,
        recommendation_type, suggested_skill,
        search_volume, cpc, ev, kd, competitor_position
    """
    recommendations: list[dict] = []
    seen: set[str] = set()

    # ── Load project ─────────────────────────────────────────────────────────
    proj_result = await db.execute(select(ProjectModel).where(ProjectModel.id == project_id))
    project = proj_result.scalar_one_or_none()
    language = project.language if project else "es"
    market = project.market if project else "es"

    # ── Load niche ────────────────────────────────────────────────────────────
    niche_result = await db.execute(
        select(Niche).where(Niche.project_id == project_id, Niche.slug == niche_slug)
    )
    niche = niche_result.scalar_one_or_none()
    niche_name = niche.name if niche else niche_slug.replace("-", " ").title()
    brief = niche.brief if niche else None

    # ── Load competitor brand names (to filter keywords mentioning them) ──────
    competitor_names: list[str] = []
    try:
        if niche:
            # Single JOIN — avoids IN(list_of_UUIDs) type issues with PortableUUID
            comp_result = await db.execute(
                select(Brand)
                .join(NicheBrand, NicheBrand.brand_id == Brand.id)
                .where(
                    NicheBrand.niche_id == niche.id,
                    Brand.is_client.is_(False),
                )
            )
            competitor_names = [b.name for b in comp_result.scalars().all() if b.name]
        else:
            comp_result = await db.execute(
                select(Brand).where(
                    Brand.project_id == project_id,
                    Brand.is_client.is_(False),
                )
            )
            competitor_names = [b.name for b in comp_result.scalars().all() if b.name]
    except Exception as e:
        log.warning("Failed to load competitor names for filtering: %s", e)

    is_competitor_keyword = _build_competitor_filter(competitor_names)
    log.info("recommend_keywords: filtering competitor names: %s", competitor_names)

    # ── 1. PRIMARY: LLM generates keywords from niche brief → DataForSEO validates ──
    # Always topically relevant because LLM reads the actual brief context.
    try:
        llm_keywords = await _generate_keywords_from_brief(
            niche_name=niche_name,
            brief=brief,
            language=language,
            market=market,
            count=80,
        )

        if llm_keywords:
            # Validate with real search volume data
            from app.engines.content.keyword_volume import get_keyword_volumes, get_bulk_keyword_difficulty

            vol_data = await get_keyword_volumes(llm_keywords, language=language)
            kd_data = await get_bulk_keyword_difficulty(llm_keywords, language=language)

            for kw in llm_keywords:
                if kw.lower() in seen:
                    continue

                category = _detect_category(kw)
                if category is None:
                    continue

                if is_competitor_keyword(kw):
                    log.debug("Skipping competitor-branded keyword: %r", kw)
                    continue

                seen.add(kw.lower())
                info = vol_data.get(kw.lower(), {})
                vol = info.get("volume") or 0
                cpc = info.get("cpc") or 0.0
                kd = kd_data.get(kw.lower())

                # Opportunity score: volume × commercial intent × ease (1 - kd/100)
                kd_factor = (100 - kd) / 100 if kd is not None else 0.5
                commercial = min(1.0, (vol * max(cpc, 0.1)) / 5_000)
                score = round(0.2 + commercial * 0.5 + kd_factor * 0.3, 2)

                recommendations.append({
                    "keyword": kw,
                    "category": category,
                    "score": score,
                    "competitor_coverage": {},
                    "source": "brief_llm",
                    "recommendation_type": "keyword",
                    "suggested_skill": "copywriting",
                    "search_volume": vol if vol else None,
                    "cpc": cpc if cpc else None,
                    "ev": None,
                    "kd": kd,
                    "competitor_position": None,
                })

    except Exception as exc:
        log.warning("LLM keyword recommendation failed: %s", exc)

    # ── 2. SECONDARY: Gap analysis (SERP queries where competitors appear) ────
    gap_result = await db.execute(
        select(GapItem)
        .join(GapAnalysis)
        .where(
            GapAnalysis.project_id == project_id,
            GapItem.niche == niche_slug,
            GapItem.client_present.is_(False),
        )
        .order_by(GapItem.opportunity_score.desc().nullslast())
    )
    for item in gap_result.scalars().all():
        kw = (item.keyword or "").strip()
        if not kw or kw.lower() in seen:
            continue

        category = _detect_category(kw)
        if category is None:
            continue

        if is_competitor_keyword(kw):
            log.debug("Skipping competitor-branded gap keyword: %r", kw)
            continue

        seen.add(kw.lower())
        comp_data = (item.competitor_brands or {}).get("brands", {})

        recommendations.append({
            "keyword": kw,
            "category": category,
            "score": item.opportunity_score or 0.5,
            "competitor_coverage": comp_data,
            "source": "gap_analysis",
            "recommendation_type": "keyword",
            "suggested_skill": "copywriting",
            "search_volume": None,
            "cpc": None,
            "ev": None,
            "kd": None,
            "competitor_position": None,
        })

    # ── 3. TERTIARY: Configured SERP queries ─────────────────────────────────
    serp_result = await db.execute(
        select(SerpQuery).where(
            SerpQuery.project_id == project_id,
            SerpQuery.niche == niche_slug,
        )
    )
    for sq in serp_result.scalars().all():
        kw = (sq.keyword or "").strip()
        if not kw or kw.lower() in seen:
            continue

        category = _detect_category(kw)
        if category is None:
            continue

        if is_competitor_keyword(kw):
            log.debug("Skipping competitor-branded SERP keyword: %r", kw)
            continue

        seen.add(kw.lower())
        recommendations.append({
            "keyword": kw,
            "category": category,
            "score": 0.4,
            "competitor_coverage": {},
            "source": "serp_query",
            "recommendation_type": "keyword",
            "suggested_skill": "copywriting",
            "search_volume": None,
            "cpc": None,
            "ev": None,
            "kd": None,
            "competitor_position": None,
        })

    # ── Enrich sources without volume data ────────────────────────────────────
    needs_volume = [r for r in recommendations if r["search_volume"] is None]
    if needs_volume:
        try:
            from app.engines.content.keyword_volume import get_keyword_volumes

            vol_data = await get_keyword_volumes(
                [r["keyword"] for r in needs_volume], language=language
            )
            for rec in needs_volume:
                info = vol_data.get(rec["keyword"].lower(), {})
                v = info.get("volume") or 0
                c = info.get("cpc") or 0.0
                rec["search_volume"] = v if v else None
                rec["cpc"] = c if c else None
                if c > 2.0:
                    rec["score"] = min(1.0, rec["score"] + 0.15)
                elif c > 1.0:
                    rec["score"] = min(1.0, rec["score"] + 0.08)
        except Exception:
            pass

    # ── Enrich KD for sources without it ─────────────────────────────────────
    needs_kd = [r for r in recommendations if r["kd"] is None]
    if needs_kd:
        try:
            from app.engines.content.keyword_volume import get_bulk_keyword_difficulty

            kd_data = await get_bulk_keyword_difficulty(
                [r["keyword"] for r in needs_kd], language=language
            )
            for rec in needs_kd:
                kd = kd_data.get(rec["keyword"].lower())
                if kd is not None:
                    rec["kd"] = kd
        except Exception:
            pass

    # ── Sort: brief_llm first (by commercial value), then gap, then serp ─────
    def _sort_key(r: dict):
        source_rank = {"brief_llm": 3, "gap_analysis": 2, "serp_query": 1}.get(r["source"], 0)
        commercial = (r["search_volume"] or 0) * max(r["cpc"] or 0.0, 0.01)
        return (source_rank, commercial, r["score"])

    recommendations.sort(key=_sort_key, reverse=True)
    log.info(
        "recommend_keywords: niche=%r → %d total (%d llm, %d gap, %d serp)",
        niche_slug,
        len(recommendations),
        sum(1 for r in recommendations if r["source"] == "brief_llm"),
        sum(1 for r in recommendations if r["source"] == "gap_analysis"),
        sum(1 for r in recommendations if r["source"] == "serp_query"),
    )
    return recommendations
