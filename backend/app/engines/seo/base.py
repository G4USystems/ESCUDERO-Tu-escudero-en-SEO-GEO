"""Abstract base for SERP data providers."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class SerpItem:
    """Single organic SERP result."""

    url: str
    domain: str
    title: str
    snippet: str
    position: int
    result_type: str = "organic"  # organic, featured_snippet, people_also_ask, etc.


@dataclass
class SerpResponse:
    """Response from a SERP query."""

    keyword: str
    location: str
    language: str
    items: list[SerpItem] = field(default_factory=list)
    total_results: int | None = None
    search_engine: str = "google"


class SerpProvider(ABC):
    """Interface every SERP provider must implement."""

    provider_name: str

    @abstractmethod
    async def search(
        self,
        keyword: str,
        *,
        location: str = "Spain",
        language: str = "es",
        num_results: int = 20,
    ) -> SerpResponse:
        """Execute a SERP query and return structured results."""
