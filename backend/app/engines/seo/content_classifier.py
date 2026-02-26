"""3-tier content classifier: URL patterns -> Title keywords -> LLM fallback.

Classifies SERP results into: review, ranking, solution, news, forum, other.
~80% of results classified without any LLM cost.
"""

import re
from dataclasses import dataclass

# -----------------------------------------------------------------
# Tier 1: URL patterns (fastest, free)
# -----------------------------------------------------------------
_URL_PATTERNS: list[tuple[str, str, float]] = [
    # Reviews
    (r"/review[s]?/", "review", 0.9),
    (r"/rese[ñn]a[s]?/", "review", 0.9),
    (r"/opinion[es]*/", "review", 0.85),
    (r"/analisis/", "review", 0.85),
    (r"/test[-/]", "review", 0.8),
    # Rankings
    (r"/mejor[es]?[-/]", "ranking", 0.9),
    (r"/top[-/]?\d+", "ranking", 0.9),
    (r"/best[-/]", "ranking", 0.9),
    (r"/comparativ[ao]s?/", "ranking", 0.85),
    (r"/ranking[s]?/", "ranking", 0.9),
    (r"/alternativ[ao]s?/", "ranking", 0.8),
    # Solution / How-to
    (r"/como[-/]", "solution", 0.85),
    (r"/how[-/]to[-/]", "solution", 0.85),
    (r"/guia[-/]", "solution", 0.85),
    (r"/guide[-/]", "solution", 0.85),
    (r"/tutorial[s]?/", "solution", 0.85),
    (r"/que[-/]es[-/]", "solution", 0.8),
    # Forums
    (r"(reddit\.com|forobeta|rankia\.com)", "forum", 0.95),
    (r"/foro[s]?/", "forum", 0.9),
    (r"/thread/", "forum", 0.9),
    # News
    (r"/noticias?/", "news", 0.85),
    (r"/news/", "news", 0.85),
    (r"/actualidad/", "news", 0.8),
]

# -----------------------------------------------------------------
# Tier 2: Title keywords (fast, free)
# -----------------------------------------------------------------
_TITLE_KEYWORDS: list[tuple[list[str], str, float]] = [
    # Reviews
    (["reseña", "review", "opinión", "análisis de", "test de", "probamos"], "review", 0.8),
    # Rankings
    (["mejores", "top ", "ranking", "comparativa", "alternativas a", "vs ", " vs."], "ranking", 0.8),
    (["best ", "alternatives to"], "ranking", 0.8),
    # Solution
    (["cómo ", "como ", "guía ", "qué es ", "tutorial", "paso a paso", "how to"], "solution", 0.75),
    (["método ", "estrategia ", "consejos para", "tips para"], "solution", 0.7),
    # News
    (["noticia", "anuncia", "lanza", "nueva versión", "actualización"], "news", 0.7),
]


@dataclass
class ClassificationResult:
    content_type: str  # review, ranking, solution, news, forum, other
    confidence: float  # 0.0 to 1.0
    classified_by: str  # "url_pattern", "title_keyword", "llm", "manual"


def classify(url: str, title: str) -> ClassificationResult:
    """Classify a SERP result using tiers 1 and 2. Returns 'other' if no match."""

    url_lower = url.lower()
    title_lower = title.lower()

    # Tier 1: URL patterns
    for pattern, content_type, confidence in _URL_PATTERNS:
        if re.search(pattern, url_lower):
            return ClassificationResult(content_type, confidence, "url_pattern")

    # Tier 2: Title keywords
    for keywords, content_type, confidence in _TITLE_KEYWORDS:
        for kw in keywords:
            if kw in title_lower:
                return ClassificationResult(content_type, confidence, "title_keyword")

    # Tier 3 placeholder (LLM fallback handled elsewhere)
    return ClassificationResult("other", 0.0, "unclassified")


async def classify_with_llm(url: str, title: str, snippet: str) -> ClassificationResult:
    """Tier 3: Use LLM to classify when tiers 1-2 fail."""
    from app.engines.geo import get_adapter

    prompt = (
        f"Classify the following SERP result into exactly one category: "
        f"review, ranking, solution, news, forum, or other.\n\n"
        f"URL: {url}\n"
        f"Title: {title}\n"
        f"Snippet: {snippet}\n\n"
        f"Reply with ONLY the category name, nothing else."
    )

    adapter = get_adapter("openai")
    try:
        resp = await adapter.query(prompt)
        category = resp.text.strip().lower()
        valid = {"review", "ranking", "solution", "news", "forum", "other"}
        if category in valid:
            return ClassificationResult(category, 0.7, "llm")
    finally:
        await adapter.close()

    return ClassificationResult("other", 0.3, "llm")
