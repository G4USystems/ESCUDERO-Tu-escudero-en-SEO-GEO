"""Abstract base for LLM adapters used by the GEO engine."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class LLMResponse:
    """Standardised response from any LLM provider."""

    text: str
    provider: str
    model: str
    tokens_used: int | None = None
    latency_ms: int | None = None
    citations: list[dict] = field(default_factory=list)  # Perplexity-native citations


class LLMAdapter(ABC):
    """Interface every LLM adapter must implement."""

    provider_name: str  # e.g. "openai", "anthropic"

    @abstractmethod
    async def query(self, prompt: str, *, system_prompt: str | None = None) -> LLMResponse:
        """Send a prompt and return a standardised response."""

    async def converse(
        self,
        messages: list[dict],
        *,
        system_prompt: str | None = None,
    ) -> LLMResponse:
        """Multi-turn conversation. Default: use last user message as single query."""
        last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        return await self.query(last_user, system_prompt=system_prompt)

    async def close(self) -> None:  # noqa: B027
        """Release resources (override if needed)."""
