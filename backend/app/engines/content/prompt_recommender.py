"""Recommend GEO prompts by analyzing GEO run results.

Identifies high-opportunity prompts where:
- Competitors are frequently mentioned
- Client brand has low visibility
- High engagement/mention counts
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.geo import GeoRun, GeoResponse
from app.models.project import Brand
from app.models.prompt import Prompt, PromptTopic


async def recommend_prompts(
    project_id: str,
    niche_slug: str,
    db: AsyncSession,
) -> list[dict]:
    """Analyze GEO results and return prompt recommendations.

    Returns list of dicts:
        {prompt_text, topic, category, score, competitor_mentions, source}
    """
    recommendations: list[dict] = []

    # Load brands
    brand_result = await db.execute(
        select(Brand).where(Brand.project_id == project_id)
    )
    brands = brand_result.scalars().all()
    client_brand = next((b for b in brands if b.is_client), None)
    competitor_names = [b.name for b in brands if not b.is_client]

    if not client_brand or not competitor_names:
        return []

    # Load latest completed GEO run
    run_result = await db.execute(
        select(GeoRun)
        .where(GeoRun.project_id == project_id, GeoRun.status == "completed")
        .order_by(GeoRun.created_at.desc())
        .limit(1)
    )
    latest_run = run_result.scalar_one_or_none()
    if not latest_run:
        return []

    # Load GEO responses with mentions and citations
    responses_result = await db.execute(
        select(GeoResponse)
        .where(GeoResponse.run_id == latest_run.id)
        .options(selectinload(GeoResponse.mentions))
        .options(selectinload(GeoResponse.citations))
    )
    responses = responses_result.scalars().all()

    # Load all prompts for this project (keyed by ID) to avoid N+1 queries
    prompt_result = await db.execute(
        select(Prompt)
        .where(Prompt.project_id == project_id)
        .options(selectinload(Prompt.topic))
    )
    prompts_by_id = {str(p.id): p for p in prompt_result.scalars().all()}

    # Aggregate by prompt_id (across providers and turns)
    prompt_stats: dict[str, dict] = {}

    for resp in responses:
        if not resp.prompt_id:
            continue
        pid = str(resp.prompt_id)

        if pid not in prompt_stats:
            prompt_stats[pid] = {
                "competitor_mentions": 0,
                "client_mentions": 0,
                "citation_count": 0,
                "mentioned_competitors": set(),
            }

        stats = prompt_stats[pid]
        stats["citation_count"] += len(resp.citations or [])

        for mention in resp.mentions or []:
            name = mention.mention_text or ""
            if name == client_brand.name or any(
                alias.lower() == name.lower()
                for alias in (client_brand.aliases or [])
            ):
                stats["client_mentions"] += 1
            elif name in competitor_names:
                stats["competitor_mentions"] += 1
                stats["mentioned_competitors"].add(name)

    # Build recommendations from aggregated stats
    for pid, stats in prompt_stats.items():
        prompt = prompts_by_id.get(pid)
        if not prompt:
            continue

        competitor_count = stats["competitor_mentions"]
        client_count = stats["client_mentions"]
        citation_count = stats["citation_count"]

        # Calculate opportunity score
        score = 0.0
        if client_count == 0 and competitor_count > 0:
            # Great opportunity: competitors visible, client invisible
            score += 0.5
        elif client_count < competitor_count:
            score += 0.3

        # More competitor mentions = higher score
        score += min(competitor_count * 0.1, 0.3)

        # More citations = more authoritative/engaging prompt
        if citation_count > 5:
            score += 0.2

        # Only include prompts with meaningful opportunity
        if score < 0.3:
            continue

        # Map topic to category
        topic_name = prompt.topic.name if prompt.topic else "general"
        category = _topic_to_category(topic_name)

        competitors_list = list(stats["mentioned_competitors"])

        recommendations.append({
            "prompt_text": prompt.text,
            "prompt_id": str(prompt.id),
            "topic": topic_name,
            "category": category,
            "score": round(score, 2),
            "competitor_mentions": {
                "count": competitor_count,
                "brands": competitors_list,
            },
            "source": "geo_analysis",
        })

    # Sort by score descending, limit to top 20
    recommendations.sort(key=lambda x: x["score"], reverse=True)
    return recommendations[:20]


def _topic_to_category(topic_name: str) -> str:
    """Map GEO topic name to content category."""
    topic_lower = topic_name.lower()

    if "descubrimiento" in topic_lower or "discovery" in topic_lower:
        return "discovery"
    elif "recomendacion" in topic_lower or "recommendation" in topic_lower:
        return "recommendation"
    elif "comparacion" in topic_lower or "comparison" in topic_lower or "alternativa" in topic_lower or "alternatives" in topic_lower:
        return "comparison"
    elif "problema" in topic_lower or "problem" in topic_lower:
        return "problem"
    elif "autoridad" in topic_lower or "authority" in topic_lower:
        return "authority"
    elif "content_gap" in topic_lower or "gap" in topic_lower:
        return "content_gap"
    elif "influencer" in topic_lower:
        return "influencer"
    else:
        return "discovery"  # default
