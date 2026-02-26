"""Google Gemini adapter for GEO engine."""

import time

from google import genai
from google.genai.types import GenerateContentConfig

from app.config import settings
from app.engines.geo.base import LLMAdapter, LLMResponse

DEFAULT_MODEL = "gemini-2.0-flash"


class GeminiAdapter(LLMAdapter):
    provider_name = "gemini"

    def __init__(self, model: str = DEFAULT_MODEL):
        self.model = model
        self._client = genai.Client(api_key=settings.google_ai_api_key)

    async def query(self, prompt: str, *, system_prompt: str | None = None) -> LLMResponse:
        config = GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=4096,
        )
        if system_prompt:
            config.system_instruction = system_prompt

        start = time.perf_counter()
        resp = await self._client.aio.models.generate_content(
            model=self.model,
            contents=prompt,
            config=config,
        )
        latency = int((time.perf_counter() - start) * 1000)

        tokens = None
        if resp.usage_metadata:
            tokens = (resp.usage_metadata.prompt_token_count or 0) + (
                resp.usage_metadata.candidates_token_count or 0
            )

        return LLMResponse(
            text=resp.text or "",
            provider=self.provider_name,
            model=self.model,
            tokens_used=tokens,
            latency_ms=latency,
        )
