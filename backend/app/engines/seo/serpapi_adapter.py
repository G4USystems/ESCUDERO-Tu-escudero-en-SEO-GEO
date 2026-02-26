"""SerpAPI adapter for fetching Google SERP results."""

from urllib.parse import urlparse

import httpx

from app.config import settings
from app.engines.seo.base import SerpItem, SerpProvider, SerpResponse

SERPAPI_URL = "https://serpapi.com/search.json"


class SerpAPIAdapter(SerpProvider):
    provider_name = "serpapi"

    def __init__(self):
        self._api_key = settings.serpapi_key

    async def search(
        self,
        keyword: str,
        *,
        location: str = "Spain",
        language: str = "es",
        num_results: int = 20,
    ) -> SerpResponse:
        params = {
            "q": keyword,
            "location": location,
            "hl": language,
            "gl": "es",
            "google_domain": "google.es",
            "num": num_results,
            "api_key": self._api_key,
            "engine": "google",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(SERPAPI_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        items: list[SerpItem] = []

        # Organic results
        for r in data.get("organic_results", []):
            url = r.get("link", "")
            domain = urlparse(url).hostname or ""
            domain = domain.removeprefix("www.")

            items.append(
                SerpItem(
                    url=url,
                    domain=domain,
                    title=r.get("title", ""),
                    snippet=r.get("snippet", ""),
                    position=r.get("position", 0),
                    result_type="organic",
                )
            )

        return SerpResponse(
            keyword=keyword,
            location=location,
            language=language,
            items=items,
            total_results=data.get("search_information", {}).get("total_results"),
        )
