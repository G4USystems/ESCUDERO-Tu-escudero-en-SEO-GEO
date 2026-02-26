"""Generate actionable briefs from gap analysis results.

Each brief = a concrete action: "contact this media outlet with this approach".
"""

from dataclasses import dataclass


@dataclass
class Brief:
    """An actionable brief for the team."""

    target_url: str
    target_domain: str
    recommended_content_type: str  # review, ranking, guest_post, listing...
    recommended_keyword: str | None
    recommended_approach: str  # human-readable action description
    priority: str  # high, medium, low
    competitor_context: str  # who's already there


# Action templates (Spanish, since the primary market is Spain)
_TEMPLATES = {
    "pitch_inclusion": (
        "Contactar a {domain} para solicitar inclusión en su artículo de ranking. "
        "Competidores ya presentes: {competitors}. "
        "Enfoque: enviar datos diferenciadores del producto y ofrecer acceso gratuito para test."
    ),
    "request_review": (
        "Proponer a {domain} una reseña del producto. "
        "Competidores ya tienen review: {competitors}. "
        "Enfoque: ofrecer acceso demo + datos exclusivos del mercado español."
    ),
    "pitch_guest_post": (
        "Proponer artículo de invitado a {domain} sobre el tema '{keyword}'. "
        "Competidores mencionados: {competitors}. "
        "Enfoque: contenido educativo con mención natural de la marca."
    ),
    "community_engagement": (
        "Participar activamente en {domain} en hilos sobre '{keyword}'. "
        "Competidores ya participan: {competitors}. "
        "Enfoque: aportar valor real, no spam. Respuestas útiles con mención orgánica."
    ),
    "content_collaboration": (
        "Proponer colaboración de contenido con {domain} sobre '{keyword}'. "
        "Competidores tienen presencia: {competitors}. "
        "Enfoque: co-crear guía o tutorial con datos del sector."
    ),
    "strategic_outreach": (
        "Outreach estratégico a {domain} — presente tanto en LLMs como en SERPs. "
        "Competidores: {competitors}. "
        "Enfoque: propuesta de valor única que diferencie de competidores ya presentes."
    ),
    "general_outreach": (
        "Contactar {domain} para explorar opciones de presencia. "
        "Competidores presentes: {competitors}. "
        "Enfoque: propuesta personalizada según el tipo de contenido del medio."
    ),
}


def generate_briefs(
    prioritized_opportunities: list[dict],
) -> list[Brief]:
    """Generate concrete action briefs from prioritized opportunities.

    Args:
        prioritized_opportunities: List of dicts with keys:
            url, domain, opportunity_score, priority, recommended_action,
            content_type, keyword, competitor_brands
    """
    briefs: list[Brief] = []

    for opp in prioritized_opportunities:
        action = opp.get("recommended_action", "general_outreach")
        domain = opp.get("domain", "")
        keyword = opp.get("keyword") or opp.get("niche") or "tu sector"
        competitors = ", ".join(opp.get("competitor_brands", []))
        content_type = opp.get("content_type", "general")

        template = _TEMPLATES.get(action, _TEMPLATES["general_outreach"])
        approach = template.format(
            domain=domain,
            keyword=keyword,
            competitors=competitors or "no identificados",
        )

        briefs.append(
            Brief(
                target_url=opp.get("url", ""),
                target_domain=domain,
                recommended_content_type=_map_content_type(action, content_type),
                recommended_keyword=keyword,
                recommended_approach=approach,
                priority=opp.get("priority", "medium"),
                competitor_context=competitors,
            )
        )

    return briefs


def _map_content_type(action: str, content_type: str | None) -> str:
    """Map action + content_type to a recommended content type for the brief."""
    if action == "pitch_inclusion":
        return "ranking"
    if action == "request_review":
        return "review"
    if action == "pitch_guest_post":
        return "guest_post"
    if action == "community_engagement":
        return "forum_post"
    if action == "content_collaboration":
        return "collaboration"
    return content_type or "general"
