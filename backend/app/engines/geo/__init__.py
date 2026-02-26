"""GEO engine: LLM adapters, response parsing, and metrics aggregation."""

from app.engines.geo.base import LLMAdapter, LLMResponse
from app.engines.geo.claude_adapter import ClaudeAdapter
from app.engines.geo.gemini_adapter import GeminiAdapter
from app.engines.geo.openai_adapter import OpenAIAdapter
from app.engines.geo.openrouter_adapter import OpenRouterAdapter, OPENROUTER_MODELS
from app.engines.geo.perplexity_adapter import PerplexityAdapter

# Direct adapters (require individual API keys)
DIRECT_ADAPTERS: dict[str, type[LLMAdapter]] = {
    "openai": OpenAIAdapter,
    "anthropic": ClaudeAdapter,
    "gemini": GeminiAdapter,
    "perplexity": PerplexityAdapter,
}


def get_adapter(provider: str) -> LLMAdapter:
    """Instantiate an LLM adapter by provider name.

    If an OpenRouter API key is configured, ALL providers are routed through
    OpenRouter using a single key.  Otherwise, fall back to direct adapters
    that require individual provider API keys.
    """
    from app.config import settings

    # Prefer OpenRouter when configured (SaaS mode)
    if settings.openrouter_api_key:
        model = OPENROUTER_MODELS.get(provider)
        if model:
            return OpenRouterAdapter(model=model, display_provider=provider)
        # Unknown provider but OpenRouter key exists — try as literal model ID
        return OpenRouterAdapter(model=provider, display_provider=provider)

    # Fallback: direct adapters with individual API keys
    cls = DIRECT_ADAPTERS.get(provider)
    if cls is None:
        raise ValueError(f"Unknown provider: {provider}. Available: {list(DIRECT_ADAPTERS)}")
    return cls()


__all__ = [
    "LLMAdapter",
    "LLMResponse",
    "OpenAIAdapter",
    "ClaudeAdapter",
    "GeminiAdapter",
    "PerplexityAdapter",
    "OpenRouterAdapter",
    "get_adapter",
    "DIRECT_ADAPTERS",
    "OPENROUTER_MODELS",
]
