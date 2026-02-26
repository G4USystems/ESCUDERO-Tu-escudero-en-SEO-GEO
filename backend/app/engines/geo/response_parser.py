"""Parse LLM responses to extract brand mentions, sentiment, and source URLs."""

import re
from dataclasses import dataclass, field
from urllib.parse import urlparse


@dataclass
class ParsedMention:
    brand_name: str
    position: int  # 1-based order of appearance
    sentiment: str  # positive / neutral / negative
    sentiment_score: float  # -1.0 to 1.0
    is_recommended: bool
    context: str  # surrounding sentence


@dataclass
class ParsedCitation:
    url: str
    domain: str
    title: str | None = None
    position: int | None = None


@dataclass
class ParsedResponse:
    mentions: list[ParsedMention] = field(default_factory=list)
    citations: list[ParsedCitation] = field(default_factory=list)


# Recommendation signal words (Spanish + English)
_POSITIVE_SIGNALS = {
    "recomend", "excelente", "líder", "mejor", "destaca", "ideal",
    "recommend", "excellent", "leader", "best", "stands out", "ideal",
    "top", "great", "outstanding", "popular", "trusted",
}
_NEGATIVE_SIGNALS = {
    "problema", "limitad", "desventaja", "caro", "peor", "critic",
    "problem", "limited", "disadvantage", "expensive", "worst", "critic",
    "drawback", "issue", "lacking", "poor",
}

# URL extraction regex
_URL_RE = re.compile(r"https?://[^\s)\]\"'>,]+")
# Markdown link: [title](url)
_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")


def _extract_domain(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    return host.removeprefix("www.")


def _score_sentiment(context: str) -> tuple[str, float]:
    """Return (label, score) based on signal words in context."""
    ctx_lower = context.lower()
    pos = sum(1 for w in _POSITIVE_SIGNALS if w in ctx_lower)
    neg = sum(1 for w in _NEGATIVE_SIGNALS if w in ctx_lower)

    if pos > neg:
        score = min(1.0, 0.5 + 0.15 * (pos - neg))
        return "positive", round(score, 2)
    if neg > pos:
        score = max(-1.0, -0.5 - 0.15 * (neg - pos))
        return "negative", round(score, 2)
    return "neutral", 0.0


def _is_recommended(context: str) -> bool:
    ctx = context.lower()
    return any(w in ctx for w in ("recomend", "recommend", "top pick", "mejor opción", "best option"))


def _surrounding_sentence(text: str, match_start: int, match_end: int) -> str:
    """Extract the sentence surrounding a match."""
    # Walk backwards to sentence start
    start = max(0, text.rfind(".", 0, match_start) + 1)
    # Walk forwards to sentence end
    end = text.find(".", match_end)
    if end == -1:
        end = min(len(text), match_end + 200)
    else:
        end += 1
    return text[start:end].strip()


def parse_response(
    text: str,
    brand_names: list[str],
    *,
    native_citations: list[dict] | None = None,
) -> ParsedResponse:
    """Parse an LLM response text.

    Args:
        text: Raw LLM response.
        brand_names: List of brand names (and aliases) to search for.
        native_citations: Citations returned natively (e.g. Perplexity).

    Returns:
        ParsedResponse with extracted mentions and citations.
    """
    result = ParsedResponse()

    # --- Brand mentions ---
    seen_brands: dict[str, int] = {}  # brand_lower -> position counter
    position_counter = 0

    for brand in brand_names:
        pattern = re.compile(re.escape(brand), re.IGNORECASE)
        for match in pattern.finditer(text):
            brand_lower = brand.lower()
            if brand_lower not in seen_brands:
                position_counter += 1
                seen_brands[brand_lower] = position_counter

            context = _surrounding_sentence(text, match.start(), match.end())
            sentiment, sentiment_score = _score_sentiment(context)

            result.mentions.append(
                ParsedMention(
                    brand_name=brand,
                    position=seen_brands[brand_lower],
                    sentiment=sentiment,
                    sentiment_score=sentiment_score,
                    is_recommended=_is_recommended(context),
                    context=context,
                )
            )

    # Deduplicate: keep first mention per brand (with best position)
    unique: dict[str, ParsedMention] = {}
    for m in result.mentions:
        key = m.brand_name.lower()
        if key not in unique or m.position < unique[key].position:
            unique[key] = m
    result.mentions = sorted(unique.values(), key=lambda m: m.position)

    # --- Citations ---
    # 1. Native citations (Perplexity)
    if native_citations:
        for c in native_citations:
            url = c.get("url", "")
            if url:
                result.citations.append(
                    ParsedCitation(
                        url=url,
                        domain=_extract_domain(url),
                        position=c.get("position"),
                    )
                )

    # 2. Markdown links
    for md_match in _MD_LINK_RE.finditer(text):
        title, url = md_match.group(1), md_match.group(2)
        result.citations.append(
            ParsedCitation(url=url, domain=_extract_domain(url), title=title)
        )

    # 3. Bare URLs (skip duplicates from markdown links)
    existing_urls = {c.url for c in result.citations}
    for url_match in _URL_RE.finditer(text):
        url = url_match.group(0).rstrip(".")
        if url not in existing_urls:
            result.citations.append(
                ParsedCitation(url=url, domain=_extract_domain(url))
            )
            existing_urls.add(url)

    # Assign positions to citations that don't have one
    for idx, c in enumerate(result.citations):
        if c.position is None:
            c.position = idx + 1

    return result
