"""Generate full blog articles / content drafts using LLM.

Produces publication-ready markdown articles (1500–2500 words) based on
the brief context: keyword/prompt, niche, project, competitors.
"""

import logging
from typing import Any

from app.config import settings
from app.models.content import ContentBrief
from app.models.project import Brand, Niche, Project

log = logging.getLogger(__name__)

# ── LLM adapter selection ────────────────────────────────────────────────────

async def _call_llm(prompt: str, system_prompt: str, max_tokens: int = 6000) -> str:
    """Call best available LLM. Priority: Anthropic → OpenAI → OpenRouter."""
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

    raise RuntimeError("No LLM API key configured (ANTHROPIC_API_KEY, OPENAI_API_KEY or OPENROUTER_API_KEY required).")


# ── Article type descriptions ─────────────────────────────────────────────────

_ARTICLE_TYPE: dict[str, dict[str, str]] = {
    "ranking": {
        "format": "ranking article (Top N list)",
        "structure": "Intro → tabla comparativa o lista numerada con descripciones → criterios de selección → análisis de cada opción → conclusión con recomendación",
        "style": "Objetivo, factual, con datos cuando sea posible. Enumera pros y contras.",
    },
    "comparison": {
        "format": "comparativa detallada (X vs Y)",
        "structure": "Intro → tabla comparativa lado a lado → análisis por dimensión (precio, funciones, soporte) → casos de uso ideales → veredicto final",
        "style": "Equilibrado, sin sesgo obvio. Recomienda según el perfil del usuario.",
    },
    "guide": {
        "format": "guía práctica paso a paso",
        "structure": "Intro con el problema → qué necesitas → pasos numerados con H3 → errores comunes → FAQ → conclusión con siguientes pasos",
        "style": "Educativo, concreto. Cada paso tiene instrucciones accionables.",
    },
    "solution": {
        "format": "artículo de solución (problema → solución)",
        "structure": "Describe el problema → por qué ocurre → soluciones disponibles → solución recomendada paso a paso → resultado esperado → CTA suave",
        "style": "PAS (Problema-Agitación-Solución). Urgente pero no exagerado.",
    },
    "authority": {
        "format": "artículo de autoridad / thought leadership",
        "structure": "Tesis provocadora → contexto y datos → argumentación con evidencia → implicaciones para el lector → conclusión con perspectiva única",
        "style": "Experto, con opinión propia. Cita datos reales o estudios si los conoces.",
    },
    "discovery": {
        "format": "artículo de descubrimiento (¿Qué es X? + mejores opciones)",
        "structure": "Definición clara → para qué sirve → tipos o categorías → las mejores opciones del mercado → cómo elegir → FAQ",
        "style": "Informativo y neutral. Responde la intención de búsqueda directamente.",
    },
    "recommendation": {
        "format": "artículo de recomendación personalizada",
        "structure": "Por qué esta pregunta importa → criterios de evaluación → recomendaciones por perfil de usuario → tabla resumen → conclusión",
        "style": "Empático. Habla directamente al lector según su situación.",
    },
    "trend": {
        "format": "artículo de tendencias",
        "structure": "La tendencia en contexto → por qué importa ahora → datos que la respaldan → implicaciones prácticas → cómo adaptarse → conclusión con perspectiva futura",
        "style": "Actual, dinámico. Conecta la tendencia con la realidad del lector.",
    },
    "content_gap": {
        "format": "artículo de contenido profundo (pilar o cluster)",
        "structure": "Panorama completo del tema → subtemas principales (H2 extensos) → recursos, herramientas o ejemplos → FAQ completo → recursos adicionales",
        "style": "Exhaustivo. Este artículo debe ser la referencia definitiva sobre el tema.",
    },
    "influencer": {
        "format": "artículo de validación social / expertos",
        "structure": "Intro → voces expertas del sector (citas o perspectivas) → análisis de tendencias colectivas → implicaciones → conclusión",
        "style": "Citaciones y perspectivas múltiples. Establece credibilidad por asociación.",
    },
}

_DEFAULT_TYPE = {
    "format": "artículo de blog completo",
    "structure": "Intro → desarrollo por secciones con H2/H3 → ejemplos prácticos → FAQ → conclusión con CTA",
    "style": "Claro, útil, orientado a resolver la necesidad del lector.",
}


def _build_system_prompt(project: Project, niche: Niche, language: str) -> str:
    niche_brief = niche.brief or {}
    brand_context = niche_brief.get("A", "")
    target_audience = niche_brief.get("C", "")
    key_messages = niche_brief.get("D", "")

    parts = [
        f"Eres un redactor experto en SEO y marketing de contenidos para {project.market}, escribiendo en {language}.",
        f"Empresa/producto: {project.name}.",
    ]
    if brand_context:
        parts.append(f"Contexto de marca: {brand_context}")
    if target_audience:
        parts.append(f"Audiencia objetivo: {target_audience}")
    if key_messages:
        parts.append(f"Mensajes clave a transmitir: {key_messages}")

    parts.extend([
        "",
        "INSTRUCCIONES DE ESCRITURA:",
        "- Escribe en markdown con H2 y H3 claros y descriptivos",
        "- Usa listas, tablas o ejemplos donde aporten valor",
        "- Incluye el keyword principal de forma natural (sin sobreoptimizar)",
        "- El tono debe ser experto pero accesible, no corporativo",
        "- NO incluyas meta-comentarios sobre el artículo ('Este artículo cubre...')",
        "- NO incluyas una sección de fuentes/referencias inventadas",
        "- El artículo debe tener entre 1500 y 2500 palabras",
        "- Comienza directamente con el H1 (# Título)",
    ])
    return "\n".join(parts)


def _build_article_prompt(
    brief: ContentBrief,
    article_type: dict,
    competitors: list[Brand],
    is_prompt_type: bool,
) -> str:
    topic = brief.keyword
    category = brief.category

    lines = []

    if is_prompt_type:
        lines.append(f"Escribe un artículo optimizado para aparecer cuando los usuarios preguntan a IAs:")
        lines.append(f'"{topic}"')
        lines.append("")
        lines.append("Este artículo debe estar optimizado tanto para SEO como para GEO (Generative Engine Optimization):")
        lines.append("- Responde la pregunta directamente al inicio (respuesta concisa de 2-3 oraciones)")
        lines.append("- Luego desarrolla el tema en profundidad")
        lines.append("- Usa estructura clara con listas y tablas (los LLMs las prefieren para citar)")
        lines.append("- Incluye datos, cifras y comparativas cuando sea posible")
    else:
        lines.append(f"Escribe un {article_type['format']} sobre el tema:")
        lines.append(f'**"{topic}"**')

    lines.extend([
        "",
        f"Formato y estructura: {article_type['structure']}",
        f"Estilo: {article_type['style']}",
    ])

    if competitors:
        comp_names = [c.name for c in competitors[:5]]
        comp_domains = [c.domain for c in competitors[:5] if c.domain]
        lines.extend([
            "",
            f"Competidores principales del sector (menciónalos de forma natural y objetiva cuando sea relevante): {', '.join(comp_names)}",
        ])
        if comp_domains:
            lines.append(f"Sus dominios: {', '.join(comp_domains)}")

    lines.extend([
        "",
        "RECUERDA:",
        "- Escribe en el idioma del mercado objetivo",
        "- El artículo debe ser listo para publicar (no incluyas placeholders como '[INSERTAR DATO]')",
        "- Empieza directamente con el título H1 del artículo",
        "- Sé específico y útil, no genérico",
    ])

    return "\n".join(lines)


# ── Main generation function ─────────────────────────────────────────────────

async def generate_article(
    brief: ContentBrief,
    project: Project,
    niche: Niche,
    competitors: list[Brand],
) -> dict[str, Any]:
    """Generate a complete blog article for the given brief.

    Returns:
        {content: str, title: str, word_count: int}
    """
    language_map = {"es": "español", "en": "inglés", "fr": "francés", "de": "alemán", "pt": "portugués"}
    language = language_map.get(project.language, project.language)

    is_prompt_type = brief.recommendation_type == "prompt"
    article_type = _ARTICLE_TYPE.get(brief.category, _DEFAULT_TYPE)

    system_prompt = _build_system_prompt(project, niche, language)
    user_prompt = _build_article_prompt(brief, article_type, competitors, is_prompt_type)

    log.info("Generating article for: %s (category: %s)", brief.keyword[:60], brief.category)
    content = await _call_llm(user_prompt, system_prompt, max_tokens=6000)

    # Extract title from first H1 line
    title = brief.keyword
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("# "):
            title = line[2:].strip()
            break

    word_count = len(content.split())

    return {
        "content": content,
        "title": title,
        "word_count": word_count,
    }
