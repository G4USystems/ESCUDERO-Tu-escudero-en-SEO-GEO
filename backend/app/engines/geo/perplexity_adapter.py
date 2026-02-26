"""Perplexity (Sonar) adapter for GEO engine.

Perplexity uses an OpenAI-compatible API but returns native citations.
"""

import time

from openai import AsyncOpenAI

from app.config import settings
from app.engines.geo.base import LLMAdapter, LLMResponse

DEFAULT_MODEL = "sonar-pro"
PERPLEXITY_BASE_URL = "https://api.perplexity.ai"


class PerplexityAdapter(LLMAdapter):
    provider_name = "perplexity"

    def __init__(self, model: str = DEFAULT_MODEL):
        self.model = model
        self._client = AsyncOpenAI(
            api_key=settings.perplexity_api_key,
            base_url=PERPLEXITY_BASE_URL,
        )

    async def query(self, prompt: str, *, system_prompt: str | None = None) -> LLMResponse:
        messages: list[dict] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        start = time.perf_counter()
        resp = await self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.3,
            max_tokens=4096,
        )
        latency = int((time.perf_counter() - start) * 1000)

        choice = resp.choices[0]
        text = choice.message.content or ""

        # Perplexity returns citations in the response metadata
        citations: list[dict] = []
        raw = resp.model_extra or {}
        if "citations" in raw:
            for idx, url in enumerate(raw["citations"]):
                citations.append({"url": url, "position": idx + 1})

        return LLMResponse(
            text=text,
            provider=self.provider_name,
            model=resp.model or self.model,
            tokens_used=resp.usage.total_tokens if resp.usage else None,
            latency_ms=latency,
            citations=citations,
        )

    async def close(self) -> None:
        await self._client.close()
