"""Key Opportunity Engine — unified scoring that combines SEO + GEO + Backlinks.

Aggregates all intelligence at the DOMAIN level (not URL) to answer:
"Which media outlets should we prioritize for placements?"

Scoring dimensions (0-100 each, then weighted):
  1. SEO Potential      — Does this domain rank for our target keywords?
  2. GEO Influence      — Do LLMs cite this domain? (high authority signal)
  3. Backlink Value      — Is this domain worth getting a backlink from?
  4. Content Gap         — Does this domain cover topics where we're missing?
  5. Competitive Density — How many competitors are already here?

Final Key Opportunity Score = weighted combination → 0-100 scale.
"""

from dataclasses import dataclass, field
import math


@dataclass
class DomainIntelligence:
    """Raw intelligence collected for a single domain."""

    domain: str
    display_name: str | None = None
    domain_type: str | None = None  # editorial, ugc, corporate...
    accepts_sponsored: bool | None = None

    # Domain metrics (from Domain catalog if available)
    domain_authority: int | None = None
    monthly_traffic: int | None = None

    # SERP presence
    serp_urls: list[str] = field(default_factory=list)
    serp_keywords: list[str] = field(default_factory=list)
    serp_positions: list[int] = field(default_factory=list)
    serp_content_types: list[str] = field(default_factory=list)

    # GEO presence (LLM citations)
    geo_citation_count: int = 0
    geo_providers: list[str] = field(default_factory=list)  # which LLMs cite it
    geo_mentioned_brands: list[str] = field(default_factory=list)

    # Competitor data
    competitor_brands_present: list[str] = field(default_factory=list)
    client_present: bool = False

    # Niche association
    niches: list[str] = field(default_factory=list)


@dataclass
class KeyOpportunity:
    """A scored domain-level opportunity with all dimensions."""

    domain: str
    display_name: str | None
    domain_type: str | None
    accepts_sponsored: bool | None

    # Individual dimension scores (0-100)
    seo_score: float
    geo_score: float
    backlink_score: float
    content_gap_score: float
    competitive_density: float

    # Final combined score (0-100)
    key_opportunity_score: float

    # Priority classification
    priority: str  # "critical", "high", "medium", "low"
    estimated_20x_potential: bool  # True if this domain has 20x+ SEO potential

    # Context for action
    competitor_brands: list[str]
    content_types: list[str]
    keywords: list[str]
    top_urls: list[str]
    niches: list[str]
    geo_providers: list[str]

    # Recommended actions
    recommended_actions: list[str]

    # Domain metrics
    domain_authority: int | None
    monthly_traffic: int | None


# ── Weights for final score ──────────────────────────────────────────
WEIGHTS = {
    "seo": 0.25,
    "geo": 0.25,
    "backlink": 0.15,
    "content_gap": 0.15,
    "competitive": 0.20,
}


def score_key_opportunities(
    domain_intel: list[DomainIntelligence],
) -> list[KeyOpportunity]:
    """Score all domains and return ranked Key Opportunities.

    Args:
        domain_intel: Pre-collected intelligence per domain.

    Returns:
        Sorted list of KeyOpportunity (highest score first).
    """
    opportunities: list[KeyOpportunity] = []

    for d in domain_intel:
        # Skip client-owned domains
        if d.client_present:
            continue

        # Skip if no competitor presence (not a gap)
        if not d.competitor_brands_present:
            continue

        seo = _score_seo(d)
        geo = _score_geo(d)
        backlink = _score_backlink(d)
        content_gap = _score_content_gap(d)
        competitive = _score_competitive_density(d)

        # Weighted combination
        combined = (
            seo * WEIGHTS["seo"]
            + geo * WEIGHTS["geo"]
            + backlink * WEIGHTS["backlink"]
            + content_gap * WEIGHTS["content_gap"]
            + competitive * WEIGHTS["competitive"]
        )

        # 20x potential: domains that score well across ALL dimensions
        has_20x = (
            seo >= 40
            and geo >= 30
            and backlink >= 40
            and competitive >= 40
        )

        # Priority
        if combined >= 70 or has_20x:
            priority = "critical"
        elif combined >= 50:
            priority = "high"
        elif combined >= 30:
            priority = "medium"
        else:
            priority = "low"

        actions = _recommend_actions(d, seo, geo, backlink)

        opportunities.append(
            KeyOpportunity(
                domain=d.domain,
                display_name=d.display_name,
                domain_type=d.domain_type,
                accepts_sponsored=d.accepts_sponsored,
                seo_score=round(seo, 1),
                geo_score=round(geo, 1),
                backlink_score=round(backlink, 1),
                content_gap_score=round(content_gap, 1),
                competitive_density=round(competitive, 1),
                key_opportunity_score=round(combined, 1),
                priority=priority,
                estimated_20x_potential=has_20x,
                competitor_brands=d.competitor_brands_present,
                content_types=list(set(d.serp_content_types)),
                keywords=list(set(d.serp_keywords))[:10],
                top_urls=d.serp_urls[:5] + ([f"(+{len(d.serp_urls)-5} more)"] if len(d.serp_urls) > 5 else []),
                niches=list(set(d.niches)),
                geo_providers=list(set(d.geo_providers)),
                recommended_actions=actions,
                domain_authority=d.domain_authority,
                monthly_traffic=d.monthly_traffic,
            )
        )

    # Sort by key_opportunity_score descending
    opportunities.sort(key=lambda o: o.key_opportunity_score, reverse=True)
    return opportunities


# ── Dimension Scorers ────────────────────────────────────────────────

def _score_seo(d: DomainIntelligence) -> float:
    """SEO Potential: does this domain rank for relevant keywords?"""
    score = 0.0

    # Number of SERP appearances
    n_urls = len(d.serp_urls)
    if n_urls >= 5:
        score += 30
    elif n_urls >= 3:
        score += 20
    elif n_urls >= 1:
        score += 10

    # Average SERP position (lower = better)
    if d.serp_positions:
        avg_pos = sum(d.serp_positions) / len(d.serp_positions)
        if avg_pos <= 3:
            score += 30
        elif avg_pos <= 5:
            score += 20
        elif avg_pos <= 10:
            score += 15
        else:
            score += 5

    # Keyword diversity
    n_keywords = len(set(d.serp_keywords))
    if n_keywords >= 5:
        score += 25
    elif n_keywords >= 3:
        score += 15
    elif n_keywords >= 1:
        score += 10

    # Content type bonus
    if "ranking" in d.serp_content_types:
        score += 15
    if "review" in d.serp_content_types:
        score += 10

    return min(100, score)


def _score_geo(d: DomainIntelligence) -> float:
    """GEO Influence: do LLMs cite this domain? Very high authority signal."""
    score = 0.0

    if d.geo_citation_count == 0:
        return 0.0

    # Citation count
    if d.geo_citation_count >= 5:
        score += 40
    elif d.geo_citation_count >= 3:
        score += 30
    elif d.geo_citation_count >= 1:
        score += 15

    # Provider diversity (cited by multiple LLMs = authoritative)
    n_providers = len(set(d.geo_providers))
    if n_providers >= 3:
        score += 30
    elif n_providers >= 2:
        score += 20
    elif n_providers >= 1:
        score += 10

    # Brands mentioned (more brands mentioned = active in the niche)
    n_brands = len(set(d.geo_mentioned_brands))
    if n_brands >= 3:
        score += 20
    elif n_brands >= 1:
        score += 10

    # Bonus: also in SERP (cross-validation)
    if d.serp_urls:
        score += 10

    return min(100, score)


def _score_backlink(d: DomainIntelligence) -> float:
    """Backlink Value: is this domain worth getting a backlink from?"""
    score = 0.0

    # Domain authority
    da = d.domain_authority
    if da is not None:
        if da >= 60:
            score += 40
        elif da >= 40:
            score += 30
        elif da >= 20:
            score += 20
        elif da >= 10:
            score += 10

    # Monthly traffic (logarithmic scale)
    traffic = d.monthly_traffic
    if traffic is not None and traffic > 0:
        log_traffic = math.log10(max(1, traffic))
        if log_traffic >= 6:  # 1M+
            score += 30
        elif log_traffic >= 5:  # 100k+
            score += 25
        elif log_traffic >= 4:  # 10k+
            score += 15
        elif log_traffic >= 3:  # 1k+
            score += 10

    # Domain type bonus
    if d.domain_type == "editorial":
        score += 20  # editorial links carry SEO weight
    elif d.domain_type == "reference":
        score += 15  # reference sites (Wikipedia-like)
    elif d.domain_type == "ugc":
        score += 5  # usually nofollow

    # Accepts sponsored content (easier to get link)
    if d.accepts_sponsored:
        score += 10

    # If no DA/traffic data, estimate from other signals
    if da is None and traffic is None:
        # Use proxy: if cited by LLMs, likely authoritative
        if d.geo_citation_count >= 2:
            score += 25
        elif d.geo_citation_count >= 1:
            score += 15
        # If ranks well in SERP, likely has decent DA
        if d.serp_positions and min(d.serp_positions) <= 5:
            score += 20
        elif d.serp_positions:
            score += 10

    return min(100, score)


def _score_content_gap(d: DomainIntelligence) -> float:
    """Content Gap: does this domain have content opportunities for us?"""
    score = 0.0

    # Variety of content types on this domain
    types = set(d.serp_content_types)
    if "ranking" in types:
        score += 25  # We can pitch to be included
    if "review" in types:
        score += 20  # We can request a review
    if "solution" in types:
        score += 15  # We can contribute educational content

    # Multiple niches = broad coverage = more opportunities
    n_niches = len(set(d.niches))
    if n_niches >= 3:
        score += 20
    elif n_niches >= 2:
        score += 15
    elif n_niches >= 1:
        score += 10

    # Multiple keywords = the domain covers many topics
    n_keywords = len(set(d.serp_keywords))
    score += min(20, n_keywords * 5)

    # Accepts sponsored → easier to place content
    if d.accepts_sponsored:
        score += 10

    return min(100, score)


def _score_competitive_density(d: DomainIntelligence) -> float:
    """Competitive Density: how many competitors are on this domain?

    More competitors = more important to be there too.
    """
    score = 0.0

    n_comps = len(d.competitor_brands_present)
    if n_comps >= 4:
        score += 50  # critical mass — everyone's there except you
    elif n_comps >= 3:
        score += 40
    elif n_comps >= 2:
        score += 30
    elif n_comps >= 1:
        score += 20

    # Both in SEO + GEO = domain is a key player
    if d.serp_urls and d.geo_citation_count > 0:
        score += 25

    # Domain is editorial = competitors are getting coverage
    if d.domain_type == "editorial":
        score += 15
    elif d.domain_type == "ugc":
        score += 10

    return min(100, score)


# ── Action Recommendations ───────────────────────────────────────────

def _recommend_actions(
    d: DomainIntelligence,
    seo_score: float,
    geo_score: float,
    backlink_score: float,
) -> list[str]:
    """Recommend concrete actions for this domain."""
    actions: list[str] = []

    types = set(d.serp_content_types)

    # Priority actions based on content types found
    if "ranking" in types:
        actions.append("pitch_inclusion")
    if "review" in types:
        actions.append("request_review")
    if d.domain_type == "editorial":
        actions.append("pitch_guest_post")
    if "solution" in types:
        actions.append("content_collaboration")
    if d.domain_type == "ugc":
        actions.append("community_engagement")

    # GEO-specific: if LLMs cite it, it's a high-authority signal
    if geo_score >= 40:
        actions.append("strategic_partnership")

    # Backlink-specific
    if backlink_score >= 50:
        actions.append("backlink_outreach")

    # If nothing specific, general outreach
    if not actions:
        actions.append("general_outreach")

    return actions
