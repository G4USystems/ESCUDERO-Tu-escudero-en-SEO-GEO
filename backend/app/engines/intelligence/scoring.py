"""Opportunity scoring and prioritization for gap analysis results."""

from dataclasses import dataclass


@dataclass
class PrioritizedOpportunity:
    """An opportunity with priority label and action recommendation."""

    url: str
    domain: str
    opportunity_score: float
    priority: str  # "high", "medium", "low"
    recommended_action: str  # e.g., "pitch_guest_post", "request_review", "submit_listing"
    estimated_impact: str  # "high", "medium", "low"


# Score thresholds
HIGH_PRIORITY_THRESHOLD = 60
MEDIUM_PRIORITY_THRESHOLD = 30


def prioritize(
    opportunities: list[dict],
) -> list[PrioritizedOpportunity]:
    """Take raw gap opportunities and assign priority + recommended action.

    Args:
        opportunities: List of GapOpportunity-like dicts with keys:
            url, domain, opportunity_score, content_type, domain_type,
            found_in_geo, found_in_serp, competitor_brands
    """
    result: list[PrioritizedOpportunity] = []

    for opp in opportunities:
        score = opp.get("opportunity_score", 0)
        content_type = opp.get("content_type", "other")
        domain_type = opp.get("domain_type")
        both_sources = opp.get("found_in_geo") and opp.get("found_in_serp")

        # Priority
        if score >= HIGH_PRIORITY_THRESHOLD:
            priority = "high"
        elif score >= MEDIUM_PRIORITY_THRESHOLD:
            priority = "medium"
        else:
            priority = "low"

        # Recommended action
        action = _recommend_action(content_type, domain_type, both_sources)

        # Estimated impact
        if both_sources and score >= 50:
            impact = "high"
        elif score >= 30:
            impact = "medium"
        else:
            impact = "low"

        result.append(
            PrioritizedOpportunity(
                url=opp["url"],
                domain=opp["domain"],
                opportunity_score=score,
                priority=priority,
                recommended_action=action,
                estimated_impact=impact,
            )
        )

    return result


def _recommend_action(
    content_type: str | None,
    domain_type: str | None,
    both_sources: bool,
) -> str:
    """Determine the best action for a gap opportunity."""

    if domain_type == "editorial":
        if content_type == "ranking":
            return "pitch_inclusion"  # Ask to be added to the ranking
        if content_type == "review":
            return "request_review"  # Pitch a product review
        return "pitch_guest_post"  # Default for editorial

    if domain_type == "ugc":
        return "community_engagement"  # Engage in forums/discussions

    if content_type == "ranking":
        return "pitch_inclusion"

    if content_type == "solution":
        return "content_collaboration"  # Co-create educational content

    if both_sources:
        return "strategic_outreach"  # High-value, multi-channel opportunity

    return "general_outreach"
