"""Domain Analyzer — scrape a website and extract business intelligence via LLM.

Usage:
    result = await analyze_domain("https://producthackers.com")
    print(result.company_type)  # "Agencia de growth hacking"
"""

import json
import logging
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

from app.engines.geo.openrouter_adapter import OpenRouterAdapter

logger = logging.getLogger(__name__)

# Use Gemini Flash — fast and cheap for extraction tasks
_EXTRACTION_MODEL = "google/gemini-2.5-flash"

_SYSTEM_PROMPT = """\
Eres un analista de negocios. Se te proporcionará el texto extraído de una página web corporativa.
Tu tarea es analizar la empresa y extraer información estructurada en JSON.

Responde ÚNICAMENTE con un JSON válido, sin explicaciones ni markdown. El JSON debe tener estos campos:

{
  "company_type": "Tipo de empresa en 3-6 palabras (ej: 'Agencia de growth marketing', 'Consultora de transformación digital', 'Plataforma SaaS de analytics')",
  "services": ["servicio 1", "servicio 2", "servicio 3"],
  "target_market": "A quién sirven (ej: 'Startups fintech y tecnología en España', 'PYMEs del sector retail en Europa')",
  "summary": "Resumen de 1-2 frases sobre qué hace la empresa y qué la diferencia."
}

Reglas:
- company_type debe ser GENÉRICO y descriptivo del tipo de empresa, NO el nombre de la empresa.
- Si la web está en español, responde en español. Si está en inglés, responde en español igualmente.
- Si no puedes determinar un campo, usa null.
- NO inventes información que no esté en el texto.
"""


@dataclass
class DomainAnalysis:
    company_type: str | None
    services: list[str]
    target_market: str | None
    summary: str | None


async def _fetch_page_text(url: str) -> str:
    """Fetch a URL and extract readable text from HTML."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    }

    async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    # Remove noise elements
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "svg", "iframe"]):
        tag.decompose()

    # Extract structured pieces
    parts: list[str] = []

    # Title
    title_tag = soup.find("title")
    if title_tag and title_tag.string:
        parts.append(f"Título: {title_tag.string.strip()}")

    # Meta description
    meta = soup.find("meta", attrs={"name": "description"})
    if meta and meta.get("content"):
        parts.append(f"Descripción: {meta['content'].strip()}")

    # H1 headings
    for h1 in soup.find_all("h1")[:3]:
        text = h1.get_text(strip=True)
        if text:
            parts.append(f"H1: {text}")

    # Body text (first 3000 chars)
    body_text = soup.get_text(separator=" ", strip=True)
    # Collapse whitespace
    body_text = " ".join(body_text.split())
    if body_text:
        parts.append(f"Contenido: {body_text[:3000]}")

    return "\n\n".join(parts)


_KNOWLEDGE_PROMPT = """\
Eres un analista de negocios con amplio conocimiento del ecosistema digital.
No tienes acceso a la web de la empresa en este momento, pero conoces muchas empresas por su dominio.

Basándote en tu conocimiento sobre el dominio "{domain}", extrae la información de la empresa en JSON.

Responde ÚNICAMENTE con un JSON válido, sin explicaciones ni markdown:

{{
  "company_type": "Tipo de empresa en 3-6 palabras (ej: 'Agencia de growth marketing', 'Consultora de transformación digital')",
  "services": ["servicio 1", "servicio 2", "servicio 3"],
  "target_market": "A quién sirven (ej: 'Startups fintech y tecnología en España')",
  "summary": "Resumen de 1-2 frases sobre qué hace la empresa."
}}

Si no reconoces la empresa, rellena los campos con tu mejor estimación basada en el nombre del dominio.
Responde siempre en español.
"""


async def analyze_domain(url: str) -> DomainAnalysis:
    """Scrape a domain and extract business intelligence via LLM.
    Falls back to LLM knowledge if scraping fails (e.g. 403 Forbidden).

    Args:
        url: Full URL or domain to analyze (e.g. "producthackers.com")

    Returns:
        DomainAnalysis with company_type, services, target_market, summary.
    """
    # Ensure URL has protocol
    if not url.startswith("http"):
        url = f"https://{url}"

    domain = url.replace("https://", "").replace("http://", "").split("/")[0]

    # Step 1: Try to fetch and extract text
    page_text = None
    try:
        page_text = await _fetch_page_text(url)
        if len(page_text) < 50:
            page_text = None
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)

    # Step 2: Send to LLM — with web content or with knowledge fallback
    adapter = OpenRouterAdapter(model=_EXTRACTION_MODEL, display_provider="gemini")
    try:
        if page_text:
            prompt = f"Analiza esta web y extrae la información de la empresa:\n\n{page_text[:4000]}"
            system = _SYSTEM_PROMPT
        else:
            logger.info("Using knowledge fallback for %s", domain)
            prompt = _KNOWLEDGE_PROMPT.format(domain=domain)
            system = None

        resp = await adapter.query(prompt=prompt, system_prompt=system)
    finally:
        await adapter.close()

    # Step 3: Parse JSON response
    text = resp.text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Failed to parse LLM response as JSON: %s", text[:200])
        return DomainAnalysis(company_type=None, services=[], target_market=None, summary=None)

    return DomainAnalysis(
        company_type=data.get("company_type"),
        services=data.get("services", []),
        target_market=data.get("target_market"),
        summary=data.get("summary"),
    )
