"""OpenRouter adapter for GEO engine.

OpenRouter provides a unified OpenAI-compatible API to access multiple LLM
providers with a single API key.  This is the preferred adapter for SaaS
deployments where end-users don't have their own LLM keys.

Usage:
    adapter = OpenRouterAdapter(model="openai/gpt-4o")
    resp = await adapter.query("What are the best neobanks in Spain?")
"""

import time

from openai import AsyncOpenAI

from app.config import settings
from app.engines.geo.base import LLMAdapter, LLMResponse

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Map friendly provider names to OpenRouter model IDs
OPENROUTER_MODELS: dict[str, str] = {
    "openai": "openai/gpt-4o",
    "anthropic": "anthropic/claude-sonnet-4.5",
    "gemini": "google/gemini-2.5-flash",
    "perplexity": "perplexity/sonar-pro",
}


class OpenRouterAdapter(LLMAdapter):
    """Routes queries through OpenRouter's unified API."""

    provider_name = "openrouter"

    def __init__(self, model: str = "openai/gpt-4o", *, display_provider: str | None = None):
        self.model = model
        self.display_provider = display_provider or model.split("/")[0]
        self._client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=OPENROUTER_BASE_URL,
            default_headers={
                "HTTP-Referer": settings.cors_origins.split(",")[0] if settings.cors_origins else "http://localhost:3000",
                "X-Title": "Escudero - SEO+GEO Intelligence",
            },
        )

    async def query(self, prompt: str, *, system_prompt: str | None = None) -> LLMResponse:
        messages: list[dict] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        return await self._send(messages)

    async def converse(
        self,
        messages: list[dict],
        *,
        system_prompt: str | None = None,
    ) -> LLMResponse:
        """Multi-turn conversation with full message history."""
        all_msgs: list[dict] = []
        if system_prompt:
            all_msgs.append({"role": "system", "content": system_prompt})
        all_msgs.extend(messages)
        return await self._send(all_msgs)

    async def _send(self, messages: list[dict]) -> LLMResponse:
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

        return LLMResponse(
            text=text,
            provider=self.display_provider,
            model=resp.model or self.model,
            tokens_used=resp.usage.total_tokens if resp.usage else None,
            latency_ms=latency,
        )

    async def close(self) -> None:
        await self._client.close()
