"""Suggest new keyword opportunities using LLM + DataForSEO.

Generates keyword ideas based on niche + competitors, then optionally
enriches with real search volume data.
"""

import json
import logging

from app.config import settings
from app.models.project import Brand, Niche, Project

log = logging.getLogger(__name__)


async def _call_llm(prompt: str, system_prompt: str) -> str:
    if settings.anthropic_api_key:
        from app.engines.geo.claude_adapter import ClaudeAdapter
        adapter = ClaudeAdapter(model="claude-sonnet-4-5-20250929")
        resp = await adapter.query(prompt, system_prompt=system_prompt)
        await adapter.close()
        return resp.text

    if settings.openai_api_key:
        from app.engines.geo.openai_adapter import OpenAIAdapter
        adapter = OpenAIAdapter()
        resp = await adapter.query(prompt, system_prompt=system_prompt)
        await adapter.close()
        return resp.text

    if settings.openrouter_api_key:
        from app.engines.geo.openrouter_adapter import OpenRouterAdapter
        adapter = OpenRouterAdapter()
        resp = await adapter.query(prompt, system_prompt=system_prompt)
        await adapter.close()
        return resp.text

    raise RuntimeError("No LLM API key configured.")


_CATEGORY_MAP = {
    "ranking": "ranking",
    "comparison": "comparison",
    "guide": "guide",
    "solution": "solution",
    "authority": "authority",
    "discovery": "discovery",
}

SYSTEM_PROMPT = """Eres un experto en investigación de keywords SEO.
Tu tarea es sugerir keywords de alto valor para un negocio específico.
Responde ÚNICAMENTE con un array JSON válido. Ningún texto adicional.

Formato exacto:
[
  {"keyword": "...", "category": "ranking|comparison|guide|solution|authority|discovery", "rationale": "..."},
  ...
]"""


async def suggest_keywords(
    project: Project,
    niche: Niche,
    competitors: list[Brand],
    existing_keywords: list[str],
    count: int = 20,
) -> list[dict]:
    """Generate keyword suggestions using LLM.

    Returns list of {keyword, category, rationale, volume, cpc}
    """
    niche_brief = niche.brief or {}
    brand_context = niche_brief.get("A", "")
    target_audience = niche_brief.get("C", "")

    comp_names = [c.name for c in competitors if not c.is_client]
    comp_domains = [c.domain for c in competitors if not c.is_client and c.domain]
    existing_sample = existing_keywords[:20]  # show first 20 to avoid duplicates

    prompt = f"""Sugiere {count} keywords SEO de alto valor para:

Empresa/producto: {project.name}
Mercado: {project.market}
Idioma: {project.language}
Nicho: {niche.name}
{f"Contexto: {brand_context}" if brand_context else ""}
{f"Audiencia: {target_audience}" if target_audience else ""}
Competidores: {", ".join(comp_names) if comp_names else "No especificados"}
{f"Dominios: {', '.join(comp_domains)}" if comp_domains else ""}

Keywords que YA existen (NO repetir):
{chr(10).join(f"- {kw}" for kw in existing_sample) if existing_sample else "Ninguna todavía"}

Criterios para tus sugerencias:
1. Mezcla keywords de distintas etapas del funnel (TOFU/MOFU/BOFU)
2. Incluye variaciones long-tail de alta conversión
3. Incluye keywords comparativas ("X vs Y", "alternativas a X")
4. Incluye keywords de solución de problemas específicos
5. Prioriza keywords con intención comercial (el usuario quiere comprar/contratar)
6. Usa el idioma del mercado objetivo ({project.language})

Recuerda: responde SOLO con el JSON array, sin texto adicional."""

    try:
        raw = await _call_llm(prompt, SYSTEM_PROMPT)
        # Extract JSON array even if surrounded by markdown
        raw = raw.strip()
        if raw.startswith("```"):
            lines = raw.splitlines()
            raw = "\n".join(lines[1:-1])
        suggestions = json.loads(raw)
        if not isinstance(suggestions, list):
            return []
    except Exception as e:
        log.warning("Keyword suggestion LLM failed: %s", e)
        return []

    # Normalize and deduplicate
    seen = {kw.lower() for kw in existing_keywords}
    result = []
    for item in suggestions:
        if not isinstance(item, dict):
            continue
        kw = (item.get("keyword") or "").strip()
        if not kw or kw.lower() in seen:
            continue
        seen.add(kw.lower())
        category = item.get("category", "guide")
        if category not in _CATEGORY_MAP:
            category = "guide"
        result.append({
            "keyword": kw,
            "category": category,
            "rationale": item.get("rationale", ""),
            "source": "ai_suggested",
            "volume": None,
            "cpc": None,
        })

    # Optionally enrich with real volumes
    if result:
        try:
            from app.engines.content.keyword_volume import get_keyword_volumes
            volume_data = await get_keyword_volumes(
                [r["keyword"] for r in result],
                language=project.language,
            )
            for r in result:
                vol_info = volume_data.get(r["keyword"].lower(), {})
                r["volume"] = vol_info.get("volume")
                r["cpc"] = vol_info.get("cpc")
        except Exception as e:
            log.warning("Volume enrichment failed: %s", e)

    return result
