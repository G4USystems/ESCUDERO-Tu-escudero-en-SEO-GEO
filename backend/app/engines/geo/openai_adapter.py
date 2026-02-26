"""OpenAI (ChatGPT) adapter for GEO engine."""

import time

from openai import AsyncOpenAI

from app.config import settings
from app.engines.geo.base import LLMAdapter, LLMResponse

DEFAULT_MODEL = "gpt-4o"


class OpenAIAdapter(LLMAdapter):
    provider_name = "openai"

    def __init__(self, model: str = DEFAULT_MODEL):
        self.model = model
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)

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
        return LLMResponse(
            text=choice.message.content or "",
            provider=self.provider_name,
            model=resp.model,
            tokens_used=resp.usage.total_tokens if resp.usage else None,
            latency_ms=latency,
        )

    async def close(self) -> None:
        await self._client.close()
