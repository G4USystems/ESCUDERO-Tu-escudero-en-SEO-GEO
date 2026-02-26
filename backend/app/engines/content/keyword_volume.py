"""Fetch keyword search volume + CPC data via DataForSEO.

Falls back to heuristic estimates when credentials are absent.
"""

import base64
import logging
from typing import Any

import httpx

from app.config import settings

log = logging.getLogger(__name__)

_DATAFORSEO_BASE = "https://api.dataforseo.com/v3"

# Map our language codes to DataForSEO location/language codes
_LOCALE_MAP: dict[str, tuple[int, str]] = {
    "es": (2724, "es"),   # Spain, Spanish
    "en": (2840, "en"),   # US, English
    "fr": (2250, "fr"),   # France, French
    "de": (2276, "de"),   # Germany, German
    "pt": (2620, "pt"),   # Portugal, Portuguese
    "it": (2380, "it"),   # Italy, Italian
}
_DEFAULT_LOCALE = (2724, "es")


def _auth_headers() -> dict[str, str]:
    credentials = base64.b64encode(
        f"{settings.dataforseo_login}:{settings.dataforseo_password}".encode()
    ).decode()
    return {"Authorization": f"Basic {credentials}", "Content-Type": "application/json"}


def _has_credentials() -> bool:
    return bool(settings.dataforseo_login and settings.dataforseo_password)


# ── Keyword Ideas (topic-first, always relevant) ──────────────────────────────

async def get_keyword_ideas(
    seeds: list[str],
    language: str = "es",
    limit: int = 300,
) -> list[dict[str, Any]]:
    """Get keyword ideas from seed terms via DataForSEO Labs keyword_ideas endpoint.

    Returns topically related keywords — always relevant because seeds come from
    the niche topic itself (not competitor domains).

    Returns list of {keyword, volume, cpc, kd, ev, position, found_on_domains}
    sorted by volume desc.
    """
    if not seeds or not _has_credentials():
        return []

    location_code, lang_code = _LOCALE_MAP.get(language, _DEFAULT_LOCALE)

    async with httpx.AsyncClient(timeout=30.0) as client:
        payload = [
            {
                "keywords": seeds[:200],
                "location_code": location_code,
                "language_code": lang_code,
                "limit": limit,
            }
        ]
        try:
            resp = await client.post(
                f"{_DATAFORSEO_BASE}/dataforseo_labs/google/keyword_ideas/live",
                headers=_auth_headers(),
                json=payload,
            )
            if resp.status_code != 200:
                log.warning("keyword_ideas returned %d: %s", resp.status_code, resp.text[:200])
                return []

            data = resp.json()
            results = []
            for task in (data.get("tasks") or []):
                status_code = task.get("status_code")
                if status_code != 20000:
                    log.warning("keyword_ideas task error %s: %s", status_code, task.get("status_message"))
                    continue
                for result in (task.get("result") or []):
                    for item in (result.get("items") or []):
                        kw = (item.get("keyword") or "").strip()
                        if not kw:
                            continue
                        kw_info = item.get("keyword_info") or {}
                        vol = kw_info.get("search_volume") or 0
                        if vol < 30:
                            continue  # skip near-zero volume keywords
                        cpc = round(kw_info.get("cpc") or 0.0, 2)
                        kd = (item.get("keyword_properties") or {}).get("keyword_difficulty")
                        results.append({
                            "keyword": kw,
                            "volume": vol,
                            "cpc": cpc,
                            "kd": kd,
                            "ev": None,
                            "position": None,
                            "found_on_domains": [],
                        })

            log.info("keyword_ideas: %d results for seeds %s", len(results), seeds[:5])
            return results

        except Exception as e:
            log.warning("keyword_ideas failed: %s", e)
            return []


async def get_keyword_volumes(
    keywords: list[str],
    language: str = "es",
) -> dict[str, dict]:
    """Return {keyword: {volume, cpc, competition}} for each keyword.

    Uses DataForSEO if credentials are configured, otherwise returns estimates.
    """
    if not keywords:
        return {}

    if _has_credentials():
        try:
            return await _fetch_from_dataforseo(keywords, language)
        except Exception as e:
            log.warning("DataForSEO volume fetch failed, using heuristic: %s", e)

    return _heuristic_volumes(keywords)


async def _fetch_from_dataforseo(
    keywords: list[str],
    language: str,
) -> dict[str, dict]:
    """Fetch keyword volumes via DataForSEO Keyword Data API."""
    location_code, lang_code = _LOCALE_MAP.get(language, _DEFAULT_LOCALE)

    # DataForSEO allows max 700 keywords per request; chunk if needed
    results: dict[str, dict] = {}
    chunk_size = 100

    async with httpx.AsyncClient(timeout=30.0) as client:
        for i in range(0, len(keywords), chunk_size):
            chunk = keywords[i : i + chunk_size]
            payload = [
                {
                    "keywords": chunk,
                    "location_code": location_code,
                    "language_code": lang_code,
                }
            ]
            resp = await client.post(
                f"{_DATAFORSEO_BASE}/keywords_data/google_ads/search_volume/live",
                headers=_auth_headers(),
                json=payload,
            )
            if resp.status_code != 200:
                log.warning("DataForSEO returned %d: %s", resp.status_code, resp.text[:200])
                continue

            data = resp.json()
            tasks = (data.get("tasks") or [])
            for task in tasks:
                task_result = task.get("result") or []
                for item in task_result:
                    kw = item.get("keyword", "")
                    if not kw:
                        continue
                    results[kw.lower()] = {
                        "volume": item.get("search_volume") or 0,
                        "cpc": round(item.get("cpc") or 0.0, 2),
                        "competition": item.get("competition") or 0.0,
                        "trend": item.get("monthly_searches") or [],
                    }

    # Fill missing keywords with 0
    for kw in keywords:
        if kw.lower() not in results:
            results[kw.lower()] = {"volume": 0, "cpc": 0.0, "competition": 0.0, "trend": []}

    return results


def _heuristic_volumes(keywords: list[str]) -> dict[str, dict]:
    """Estimate volumes based on keyword length when no API is available."""
    results: dict[str, dict] = {}
    for kw in keywords:
        n = len(kw.split())
        if n <= 2:
            vol = 2000
        elif n <= 4:
            vol = 500
        else:
            vol = 100
        results[kw.lower()] = {
            "volume": vol,
            "cpc": 0.0,
            "competition": 0.0,
            "trend": [],
        }
    return results


# ── Competitor gap analysis via DataForSEO Labs ──────────────────────────────

# CTR curve by organic position (approximate industry average for Spain)
_CTR_BY_POS: dict[int, float] = {
    1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.07,
    6: 0.05, 7: 0.04, 8: 0.03, 9: 0.03, 10: 0.02,
}


def _estimate_ev(search_volume: int, position: int | None) -> int | None:
    """Estimate monthly traffic (EV) from search volume × CTR at given position."""
    if not position or not search_volume:
        return None
    if position <= 10:
        ctr = _CTR_BY_POS.get(position, 0.02)
    elif position <= 20:
        ctr = 0.01
    elif position <= 30:
        ctr = 0.005
    else:
        return None  # beyond page 3 — not worth showing
    return max(1, int(search_volume * ctr))


async def get_competitor_keywords(
    competitor_domains: list[str],
    client_domain: str | None,
    language: str = "es",
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Get top keywords for competitor domains and identify gaps.

    Only includes keywords where competitor ranks in top 30.
    EV is estimated from search_volume × CTR(position).

    Returns list of {keyword, volume, cpc, competition, kd, ev, position, found_on_domains}
    sorted by ev desc (actual estimated traffic value).
    """
    if not competitor_domains or not _has_credentials():
        return []

    location_code, lang_code = _LOCALE_MAP.get(language, _DEFAULT_LOCALE)
    keywords_found: dict[str, dict] = {}

    async with httpx.AsyncClient(timeout=60.0) as client:
        for domain in competitor_domains[:10]:  # max 10 competitors
            try:
                payload = [
                    {
                        "target": domain,
                        "location_code": location_code,
                        "language_code": lang_code,
                        "order_by": ["ranked_serp_element.serp_item.rank_group,asc"],
                        "limit": 200,
                        "filters": [
                            ["keyword_data.keyword_info.search_volume", ">", 10],
                            "and",
                            ["ranked_serp_element.serp_item.rank_group", "<=", 30],
                        ],
                    }
                ]
                resp = await client.post(
                    f"{_DATAFORSEO_BASE}/dataforseo_labs/google/ranked_keywords/live",
                    headers=_auth_headers(),
                    json=payload,
                )
                if resp.status_code != 200:
                    log.warning("ranked_keywords returned %d for %s: %s", resp.status_code, domain, resp.text[:200])
                    continue

                data = resp.json()
                tasks = data.get("tasks") or []
                for task in tasks:
                    for result in (task.get("result") or []):
                        items = result.get("items") or []
                        for item in items:
                            kw_data = item.get("keyword_data", {})
                            kw = (kw_data.get("keyword") or "").strip()
                            if not kw or len(kw) < 3:
                                continue
                            kw_info = kw_data.get("keyword_info", {})
                            vol = kw_info.get("search_volume") or 0
                            cpc = round(kw_info.get("cpc") or 0.0, 2)
                            comp = kw_info.get("competition") or 0.0

                            kd = (kw_data.get("keyword_properties") or {}).get("keyword_difficulty")
                            rank_pos = (item.get("ranked_serp_element") or {}).get("serp_item", {}).get("rank_group")
                            ev = _estimate_ev(vol, rank_pos)

                            if kw not in keywords_found:
                                keywords_found[kw] = {
                                    "keyword": kw,
                                    "volume": vol,
                                    "cpc": cpc,
                                    "competition": comp,
                                    "kd": kd,
                                    "ev": ev,
                                    "position": rank_pos,
                                    "found_on_domains": [],
                                }
                            else:
                                # Keep best position across domains; recalculate EV
                                existing_pos = keywords_found[kw].get("position")
                                if rank_pos and (not existing_pos or rank_pos < existing_pos):
                                    keywords_found[kw]["position"] = rank_pos
                                    keywords_found[kw]["ev"] = _estimate_ev(vol, rank_pos)
                            keywords_found[kw]["found_on_domains"].append(domain)

            except Exception as e:
                log.warning("Failed to fetch keywords for %s: %s", domain, e)

    if not keywords_found:
        return []

    log.info("get_competitor_keywords: found %d unique keywords across %d domains", len(keywords_found), len(competitor_domains))
    # Sort by EV desc (estimated traffic = the real opportunity), then volume as tiebreaker
    results = list(keywords_found.values())
    results.sort(key=lambda x: (x["ev"] or 0, x["volume"] or 0), reverse=True)
    return results[:limit]


# ── Bulk keyword difficulty ───────────────────────────────────────────────────

async def get_bulk_keyword_difficulty(
    keywords: list[str],
    language: str = "es",
) -> dict[str, int | None]:
    """Fetch keyword difficulty scores via DataForSEO Labs bulk endpoint.

    Returns {keyword_lower: kd_score} for each keyword.
    Returns empty dict when credentials are absent.
    """
    if not keywords or not _has_credentials():
        return {}

    location_code, lang_code = _LOCALE_MAP.get(language, _DEFAULT_LOCALE)
    results: dict[str, int | None] = {}
    chunk_size = 100

    async with httpx.AsyncClient(timeout=30.0) as client:
        for i in range(0, len(keywords), chunk_size):
            chunk = keywords[i : i + chunk_size]
            payload = [
                {
                    "keywords": chunk,
                    "location_code": location_code,
                    "language_code": lang_code,
                }
            ]
            try:
                resp = await client.post(
                    f"{_DATAFORSEO_BASE}/dataforseo_labs/google/bulk_keyword_difficulty/live",
                    headers=_auth_headers(),
                    json=payload,
                )
                if resp.status_code != 200:
                    log.warning("Bulk KD returned %d: %s", resp.status_code, resp.text[:200])
                    continue

                data = resp.json()
                for task in (data.get("tasks") or []):
                    for result in (task.get("result") or []):
                        for item in (result.get("items") or []):
                            kw = (item.get("keyword") or "").lower()
                            kd = item.get("keyword_difficulty")
                            if kw:
                                results[kw] = kd
            except Exception as e:
                log.warning("Bulk KD chunk failed: %s", e)

    return results
