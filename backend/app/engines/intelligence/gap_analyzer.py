"""Gap Analyzer: cross-references GEO + SEO data to find opportunities.

A "gap" = a URL/domain where competitors appear but the client does not.
Sources: LLM citations (GEO) + SERP results (SEO).
"""

import uuid
from dataclasses import dataclass, field


@dataclass
class GapOpportunity:
    """A single gap opportunity found."""

    url: str
    domain: str
    competitor_brands: list[str]  # brands that appear here
    client_present: bool
    found_in_geo: bool  # cited by LLMs
    found_in_serp: bool  # found in Google SERPs
    content_type: str | None  # review, ranking, solution...
    domain_type: str | None  # editorial, ugc, corporate...
    opportunity_score: float  # 0-100
    keyword: str | None  # SERP keyword (if from SEO)
    niche: str | None  # niche category


@dataclass
class GapAnalysisResult:
    """Complete gap analysis output."""

    total_urls_analyzed: int
    gaps_found: int
    opportunities: list[GapOpportunity] = field(default_factory=list)


def analyze_gaps(
    *,
    geo_citations: list[dict],
    serp_results: list[dict],
    client_brand_names: list[str],
    competitor_brand_names: list[str],
    client_domains: list[str],
    excluded_domains: set[str] | None = None,
) -> GapAnalysisResult:
    """Cross-reference GEO citations and SERP results to find gaps.

    Args:
        geo_citations: List of dicts with keys: url, domain, brand_name (if matched)
        serp_results: List of dicts with keys: url, domain, title, position, keyword, niche,
                      content_type, domain_type
        client_brand_names: Brand names for the client
        competitor_brand_names: Brand names for competitors
        client_domains: Domains owned by the client
        excluded_domains: Domains to exclude from analysis

    Returns:
        GapAnalysisResult with scored opportunities.
    """
    excluded = excluded_domains or set()

    # Build a map of all URLs/domains with who appears there
    url_map: dict[str, dict] = {}  # url -> metadata

    # Process GEO citations
    for c in geo_citations:
        url = c.get("url", "")
        domain = c.get("domain", "")
        if not url or domain in excluded:
            continue

        if url not in url_map:
            url_map[url] = {
                "domain": domain,
                "competitors": set(),
                "client_present": False,
                "found_in_geo": False,
                "found_in_serp": False,
                "content_type": None,
                "domain_type": c.get("domain_type"),
                "keyword": None,
                "niche": None,
            }

        url_map[url]["found_in_geo"] = True

        brand = c.get("brand_name", "")
        if brand:
            if brand.lower() in {n.lower() for n in client_brand_names}:
                url_map[url]["client_present"] = True
            elif brand.lower() in {n.lower() for n in competitor_brand_names}:
                url_map[url]["competitors"].add(brand)

    # Process SERP results
    for s in serp_results:
        url = s.get("url", "")
        domain = s.get("domain", "")
        if not url or domain in excluded:
            continue

        # Check if this domain belongs to client
        is_client_domain = domain in {d.lower() for d in client_domains}

        if url not in url_map:
            url_map[url] = {
                "domain": domain,
                "competitors": set(),
                "client_present": is_client_domain,
                "found_in_geo": False,
                "found_in_serp": False,
                "content_type": s.get("content_type"),
                "domain_type": s.get("domain_type"),
                "keyword": s.get("keyword"),
                "niche": s.get("niche"),
            }
        else:
            if is_client_domain:
                url_map[url]["client_present"] = True

        url_map[url]["found_in_serp"] = True
        if s.get("content_type"):
            url_map[url]["content_type"] = s["content_type"]
        if s.get("keyword"):
            url_map[url]["keyword"] = s["keyword"]
        if s.get("niche"):
            url_map[url]["niche"] = s["niche"]
        if s.get("domain_type"):
            url_map[url]["domain_type"] = s["domain_type"]

    # Build gap opportunities (where competitors appear but client doesn't)
    opportunities: list[GapOpportunity] = []

    for url, data in url_map.items():
        # Skip client-owned pages
        if data["domain"] in {d.lower() for d in client_domains}:
            continue

        has_competitors = len(data["competitors"]) > 0
        client_absent = not data["client_present"]

        if has_competitors and client_absent:
            score = _score_opportunity(data)
            opportunities.append(
                GapOpportunity(
                    url=url,
                    domain=data["domain"],
                    competitor_brands=sorted(data["competitors"]),
                    client_present=False,
                    found_in_geo=data["found_in_geo"],
                    found_in_serp=data["found_in_serp"],
                    content_type=data["content_type"],
                    domain_type=data["domain_type"],
                    opportunity_score=score,
                    keyword=data["keyword"],
                    niche=data["niche"],
                )
            )

    # Sort by opportunity score desc
    opportunities.sort(key=lambda o: o.opportunity_score, reverse=True)

    return GapAnalysisResult(
        total_urls_analyzed=len(url_map),
        gaps_found=len(opportunities),
        opportunities=opportunities,
    )


def _score_opportunity(data: dict) -> float:
    """Score a gap opportunity from 0-100.

    Higher score = more valuable opportunity.
    """
    score = 0.0

    # Competitor presence (more competitors = more important)
    n_competitors = len(data["competitors"])
    score += min(30, n_competitors * 10)

    # Source diversity (found in both GEO + SEO = high value)
    if data["found_in_geo"] and data["found_in_serp"]:
        score += 25
    elif data["found_in_geo"]:
        score += 15
    elif data["found_in_serp"]:
        score += 10

    # Content type (editorial content > others for outreach)
    content_type = data.get("content_type")
    if content_type == "ranking":
        score += 20  # ranking articles are prime territory
    elif content_type == "review":
        score += 15
    elif content_type == "solution":
        score += 10

    # Domain type (editorial domains accept sponsored content)
    domain_type = data.get("domain_type")
    if domain_type == "editorial":
        score += 15
    elif domain_type == "ugc":
        score += 5

    return min(100, score)
