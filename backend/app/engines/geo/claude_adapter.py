"""Anthropic (Claude) adapter for GEO engine."""

import time

from anthropic import AsyncAnthropic

from app.config import settings
from app.engines.geo.base import LLMAdapter, LLMResponse

DEFAULT_MODEL = "claude-sonnet-4-5-20250929"


class ClaudeAdapter(LLMAdapter):
    provider_name = "anthropic"

    def __init__(self, model: str = DEFAULT_MODEL):
        self.model = model
        self._client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def query(self, prompt: str, *, system_prompt: str | None = None) -> LLMResponse:
        kwargs: dict = {
            "model": self.model,
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        start = time.perf_counter()
        resp = await self._client.messages.create(**kwargs)
        latency = int((time.perf_counter() - start) * 1000)

        text = resp.content[0].text if resp.content else ""
        tokens = (resp.usage.input_tokens or 0) + (resp.usage.output_tokens or 0) if resp.usage else None

        return LLMResponse(
            text=text,
            provider=self.provider_name,
            model=resp.model,
            tokens_used=tokens,
            latency_ms=latency,
        )

    async def close(self) -> None:
        await self._client.close()
