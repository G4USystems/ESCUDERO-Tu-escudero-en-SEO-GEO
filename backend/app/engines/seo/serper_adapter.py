"""Serper.dev adapter for fetching Google SERP results.

Serper.dev provides a free tier (2,500 queries) and is a cheap alternative
to SerpAPI. API docs: https://serper.dev/

Usage:
    adapter = SerperAdapter()
    resp = await adapter.search("mejores agencias growth hacking España")
"""

from urllib.parse import urlparse

import httpx

from app.config import settings
from app.engines.seo.base import SerpItem, SerpProvider, SerpResponse

SERPER_URL = "https://google.serper.dev/search"


class SerperAdapter(SerpProvider):
    provider_name = "serper"

    def __init__(self):
        self._api_key = settings.serper_api_key

    async def search(
        self,
        keyword: str,
        *,
        location: str = "Spain",
        language: str = "es",
        num_results: int = 20,
    ) -> SerpResponse:
        headers = {
            "X-API-KEY": self._api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "q": keyword,
            "gl": "es",
            "hl": language,
            "num": num_results,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(SERPER_URL, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        items: list[SerpItem] = []

        for r in data.get("organic", []):
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
            total_results=data.get("searchParameters", {}).get("totalResults"),
        )
