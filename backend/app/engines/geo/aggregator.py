"""Aggregate GEO results into visibility metrics per brand."""

from dataclasses import dataclass, field


@dataclass
class BrandMetrics:
    brand_name: str
    visibility_pct: float  # 0-100: share of total mentions across all brands (sums to 100%)
    avg_position: float | None  # avg first-mention position across prompts
    avg_sentiment_score: float  # -1.0 to 1.0
    sentiment_label: str  # positive / neutral / negative
    mention_count: int  # total mentions across all responses
    recommendation_count: int  # times marked as recommended
    provider_breakdown: dict[str, "ProviderStats"] = field(default_factory=dict)


@dataclass
class ProviderStats:
    provider: str
    mention_count: int = 0
    avg_position: float | None = None
    avg_sentiment_score: float = 0.0
    visibility_pct: float = 0.0


@dataclass
class AggregatedResult:
    total_prompts: int
    total_responses: int  # prompts * providers
    brands: list[BrandMetrics] = field(default_factory=list)
    top_cited_domains: list[dict] = field(default_factory=list)


@dataclass
class _MentionAccum:
    """Internal accumulator for a single brand."""

    positions: list[int] = field(default_factory=list)
    sentiments: list[float] = field(default_factory=list)
    recommendations: int = 0
    prompts_seen: set[str] = field(default_factory=set)  # prompt_ids
    per_provider: dict[str, list[dict]] = field(default_factory=dict)


def aggregate(
    responses: list[dict],
    brand_names: list[str],
    total_prompts: int,
) -> AggregatedResult:
    """Aggregate parsed GEO responses into per-brand metrics.

    Args:
        responses: List of dicts with keys:
            - prompt_id: str
            - provider: str
            - mentions: list of ParsedMention-like dicts
            - citations: list of ParsedCitation-like dicts
        brand_names: All brand names being tracked.
        total_prompts: Number of unique prompts in the run.

    Returns:
        AggregatedResult with per-brand visibility, sentiment, positions.
    """
    accum: dict[str, _MentionAccum] = {b.lower(): _MentionAccum() for b in brand_names}
    domain_counts: dict[str, int] = {}
    domain_providers: dict[str, set[str]] = {}
    domain_urls: dict[str, set[str]] = {}
    domain_url_titles: dict[str, dict[str, str]] = {}  # domain -> {url: title}
    providers_set: set[str] = set()
    prompts_per_provider: dict[str, set[str]] = {}

    for resp in responses:
        provider = resp["provider"]
        prompt_id = resp["prompt_id"]
        providers_set.add(provider)
        prompts_per_provider.setdefault(provider, set()).add(prompt_id)

        # Mentions
        for m in resp.get("mentions", []):
            key = m["brand_name"].lower()
            if key not in accum:
                continue
            a = accum[key]
            a.positions.append(m["position"])
            a.sentiments.append(m["sentiment_score"])
            a.recommendations += int(m.get("is_recommended", False))
            a.prompts_seen.add(prompt_id)

            a.per_provider.setdefault(provider, []).append(m)

        # Citations
        for c in resp.get("citations", []):
            domain = c.get("domain", "")
            if domain:
                domain_counts[domain] = domain_counts.get(domain, 0) + 1
                domain_providers.setdefault(domain, set()).add(provider)
                url = c.get("url", "")
                if url:
                    domain_urls.setdefault(domain, set()).add(url)
                    # Keep LLM-provided titles (from markdown links)
                    title = c.get("title", "")
                    if title:
                        domain_url_titles.setdefault(domain, {})[url] = title

    # Compute total mentions across all brands (for share-of-voice)
    total_mentions = sum(len(accum[b.lower()].positions) for b in brand_names)

    # Compute total mentions per provider across all brands
    total_mentions_per_provider: dict[str, int] = {}
    for prov in providers_set:
        total_mentions_per_provider[prov] = sum(
            len(accum[b.lower()].per_provider.get(prov, []))
            for b in brand_names
        )

    # Build brand metrics
    brands: list[BrandMetrics] = []
    for brand in brand_names:
        a = accum[brand.lower()]
        mention_count = len(a.positions)

        avg_pos = round(sum(a.positions) / len(a.positions), 1) if a.positions else None
        avg_sent = round(sum(a.sentiments) / len(a.sentiments), 2) if a.sentiments else 0.0
        # Share of voice: this brand's mentions / total mentions across all brands
        vis_pct = round((mention_count / total_mentions) * 100, 1) if total_mentions else 0.0

        if avg_sent > 0.2:
            sent_label = "positive"
        elif avg_sent < -0.2:
            sent_label = "negative"
        else:
            sent_label = "neutral"

        # Per-provider stats
        provider_breakdown: dict[str, ProviderStats] = {}
        for prov in providers_set:
            prov_mentions = a.per_provider.get(prov, [])
            prov_positions = [m["position"] for m in prov_mentions]
            prov_sentiments = [m["sentiment_score"] for m in prov_mentions]
            prov_total = total_mentions_per_provider.get(prov, 0)

            provider_breakdown[prov] = ProviderStats(
                provider=prov,
                mention_count=len(prov_mentions),
                avg_position=round(sum(prov_positions) / len(prov_positions), 1) if prov_positions else None,
                avg_sentiment_score=round(sum(prov_sentiments) / len(prov_sentiments), 2) if prov_sentiments else 0.0,
                # Share of voice per provider: this brand's mentions for this provider / total mentions for this provider
                visibility_pct=round(
                    (len(prov_mentions) / prov_total) * 100, 1
                ) if prov_total else 0.0,
            )

        brands.append(
            BrandMetrics(
                brand_name=brand,
                visibility_pct=vis_pct,
                avg_position=avg_pos,
                avg_sentiment_score=avg_sent,
                sentiment_label=sent_label,
                mention_count=mention_count,
                recommendation_count=a.recommendations,
                provider_breakdown=provider_breakdown,
            )
        )

    # Sort brands: client first (highest visibility), then by visibility desc
    brands.sort(key=lambda b: b.visibility_pct, reverse=True)

    # Top cited domains (enriched with providers, URLs, content type, and domain classification)
    from app.engines.seo.content_classifier import classify as classify_url
    from app.engines.domain.rules_engine import classify_by_rules
    from urllib.parse import urlparse, unquote

    def _has_article_path(url: str) -> bool:
        """Return True if URL has a meaningful path (not just the domain homepage)."""
        path = urlparse(url).path.strip("/")
        # A homepage URL has empty or very short path (e.g., "/" or "en")
        return len(path) > 4

    def _title_from_url(url: str) -> str:
        """Extract a readable title from a URL path."""
        path = urlparse(url).path.rstrip("/")
        if not path or path == "/":
            return ""
        # Get the last meaningful segment
        slug = path.split("/")[-1]
        # Remove file extensions
        for ext in (".html", ".htm", ".php", ".aspx"):
            slug = slug.removesuffix(ext)
        # Convert slug to readable title
        slug = unquote(slug)
        title = slug.replace("-", " ").replace("_", " ").strip()
        if len(title) < 3:
            return ""
        return title[:80].title()

    top_domains = sorted(domain_counts.items(), key=lambda x: x[1], reverse=True)[:50]
    top_cited = []
    for d, c in top_domains:
        all_urls = list(domain_urls.get(d, set()))
        # Prefer article URLs (with meaningful path) over homepage URLs
        article_urls = sorted(u for u in all_urls if _has_article_path(u))
        homepage_urls = sorted(u for u in all_urls if not _has_article_path(u))
        urls = (article_urls or homepage_urls)[:5]
        # Content type from URL patterns (review/ranking/solution)
        content_type = "other"
        for url in urls:
            cl = classify_url(url, "")
            if cl.content_type != "other":
                content_type = cl.content_type
                break
        # Also try classifying from LLM-provided titles and URL paths
        if content_type == "other":
            url_titles_for_domain = domain_url_titles.get(d, {})
            # Check LLM titles first (more reliable than URL paths)
            for url in urls:
                check_text = url_titles_for_domain.get(url, "").lower()
                if not check_text:
                    check_text = url.lower()
                if any(kw in check_text for kw in ("mejores", "top ", "top-", "best", "ranking", "comparativ")):
                    content_type = "ranking"
                    break
                elif any(kw in check_text for kw in ("review", "opinión", "opinion", "reseña", "resena", "análisis", "analisis")):
                    content_type = "review"
                    break
                elif any(kw in check_text for kw in ("cómo", "como ", "como-", "how to", "how-to", "guía", "guia", "guide", "tutorial")):
                    content_type = "solution"
                    break
        # Extract title: prefer URL-derived slug (actual article title) over LLM
        # anchor text, because LLMs often use company names as anchors instead
        # of article titles (e.g. [We Are Marketing](puromarketing.com/article)).
        title = ""
        url_titles = domain_url_titles.get(d, {})
        # First: try to derive title from article URL slugs (most reliable)
        for url in urls:
            if _has_article_path(url):
                t = _title_from_url(url)
                if t:
                    title = t
                    break
        # Fallback: use LLM-provided anchor text only if we couldn't derive
        # a title from a URL slug (e.g. when only homepage URLs were cited)
        if not title:
            for url in urls:
                if url in url_titles:
                    title = url_titles[url]
                    break
        # Domain classification (editorial, corporate, competitor, etc.)
        dom_class = classify_by_rules(d)
        top_cited.append({
            "domain": d,
            "count": c,
            "providers": sorted(domain_providers.get(d, set())),
            "urls": urls,
            "title": title,
            "content_type": content_type,
            "domain_type": dom_class.domain_type,       # editorial, corporate, ugc, etc.
            "accepts_sponsored": dom_class.accepts_sponsored,
            "is_excluded": dom_class.is_excluded_fintech,
        })

    return AggregatedResult(
        total_prompts=total_prompts,
        total_responses=len(responses),
        brands=brands,
        top_cited_domains=top_cited,
    )
