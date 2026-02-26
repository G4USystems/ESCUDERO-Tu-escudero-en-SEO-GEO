"""SEO engine: SERP providers and content classification."""

from app.engines.seo.base import SerpProvider
from app.engines.seo.serpapi_adapter import SerpAPIAdapter
from app.engines.seo.serper_adapter import SerperAdapter


def get_serp_provider() -> SerpProvider:
    """Return the configured SERP provider."""
    from app.config import settings

    if settings.serp_provider == "serper" and settings.serper_api_key:
        return SerperAdapter()
    if settings.serpapi_key:
        return SerpAPIAdapter()
    if settings.serper_api_key:
        return SerperAdapter()
    raise ValueError(
        "No SERP provider configured. Set SERPER_API_KEY or SERPAPI_KEY in .env"
    )


__all__ = ["SerpAPIAdapter", "SerperAdapter", "get_serp_provider"]
