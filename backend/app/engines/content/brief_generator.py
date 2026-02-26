"""Generate content briefs optimized for marketing skill invocation.

Creates formatted markdown briefs that can be copied into Claude Code CLI
when invoking skills like /copywriting, /content-strategy, /programmatic-seo,
/schema-markup, /seo-audit, /competitor-alternatives, /marketing-ideas.
"""

from app.models.content import ContentBrief
from app.models.project import Project, Brand, Niche


# ── Skill definitions (description + usage hint) ────────────────────────────
SKILL_DESCRIPTIONS: dict[str, dict] = {
    "programmatic-seo": {
        "label": "Programmatic SEO",
        "command": "/programmatic-seo",
        "use": "Crear páginas SEO a escala: Top N lists, comparativas, templates repetibles.",
    },
    "copywriting": {
        "label": "Copywriting",
        "command": "/copywriting",
        "use": "Escribir artículos de blog, landing pages, guías y contenido editorial completo.",
    },
    "content-strategy": {
        "label": "Content Strategy",
        "command": "/content-strategy",
        "use": "Planificar pilares de contenido, topic clusters y calendario editorial.",
    },
    "seo-audit": {
        "label": "SEO Audit",
        "command": "/seo-audit",
        "use": "Auditar contenido existente de competidores antes de escribir el tuyo.",
    },
    "schema-markup": {
        "label": "Schema Markup",
        "command": "/schema-markup",
        "use": "Generar JSON-LD para rich results (Article, FAQ, HowTo, ItemList).",
    },
    "competitor-alternatives": {
        "label": "Competitor Alternatives",
        "command": "/competitor-alternatives",
        "use": "Crear páginas 'vs competidor' y 'alternativas a X' para capturar tráfico comparativo.",
    },
    "marketing-ideas": {
        "label": "Marketing Ideas",
        "command": "/marketing-ideas",
        "use": "Generar ideas de marketing para el nicho: free tools, campaigns, content formats.",
    },
    "referral-program": {
        "label": "Referral Program",
        "command": "/referral-program",
        "use": "Diseñar programa de referidos/afiliados para distribuir contenido y crecer.",
    },
}


# ── Primary + secondary skill mapping per category ──────────────────────────
CATEGORY_SKILLS: dict[str, tuple[str, list[str]]] = {
    # (primary_skill, [secondary_skills])
    "ranking":        ("programmatic-seo",       ["schema-markup", "copywriting"]),
    "comparison":     ("copywriting",             ["competitor-alternatives", "schema-markup"]),
    "guide":          ("copywriting",             ["schema-markup", "seo-audit"]),
    "solution":       ("copywriting",             ["schema-markup"]),
    "authority":      ("content-strategy",        ["marketing-ideas", "copywriting"]),
    "trend":          ("copywriting",             ["marketing-ideas"]),
    "discovery":      ("content-strategy",        ["marketing-ideas", "copywriting"]),
    "recommendation": ("copywriting",             ["referral-program"]),
    "content_gap":    ("programmatic-seo",        ["copywriting"]),
    "influencer":     ("marketing-ideas",         ["referral-program"]),
}

_DEFAULT_SKILLS = ("copywriting", ["schema-markup"])


def _get_skills(category: str) -> tuple[str, list[str]]:
    return CATEGORY_SKILLS.get(category, _DEFAULT_SKILLS)


def generate_brief(
    brief: ContentBrief,
    project: Project,
    niche: Niche,
    competitors: list[Brand],
) -> str:
    """Generate a complete content brief for skill invocation.

    Args:
        brief: ContentBrief with keyword/prompt and category
        project: Project context
        niche: Niche with brief modules A-D
        competitors: List of competitor brands

    Returns:
        Formatted markdown brief optimized for Claude CLI skills
    """
    # Extract niche brief sections
    niche_brief = niche.brief or {}
    brand_context = niche_brief.get("A", "")
    objectives = niche_brief.get("B", "")
    target_audience = niche_brief.get("C", "")
    key_messages = niche_brief.get("D", "")

    # Determine topic text and skills
    topic_type = "Keyword" if brief.recommendation_type == "keyword" else "GEO Prompt"
    topic = brief.keyword  # prompt text is stored in keyword field
    buyer_stage = _infer_buyer_stage(brief.category)
    primary_skill, secondary_skills = _get_skills(brief.category)

    # ── Build markdown brief ─────────────────────────────────────────────────
    lines = [
        f"# Content Brief: {topic}",
        "",
        "## Business Context",
        f"- **Product/Service**: {project.name}",
        f"- **Market**: {project.market}, {project.language}",
    ]

    if brand_context:
        lines.append(f"- **Brand Context**: {brand_context}")
    if target_audience:
        lines.append(f"- **Target Audience**: {target_audience}")

    lines.extend([
        "",
        "## Topic",
        f"**{topic_type}**: {topic}",
        "",
        "## Objective",
        f"- **Content Category**: {brief.category}",
        f"- **Buyer Stage**: {buyer_stage}",
    ])

    if objectives:
        lines.append(f"- **Niche Objectives**: {objectives}")

    lines.extend([
        "",
        "## Competitive Context",
    ])

    if competitors:
        lines.append("Competitors to research and potentially mention:")
        for comp in competitors:
            lines.append(f"- **{comp.name}**")
            if comp.domain:
                lines.append(f"  - Domain: {comp.domain}")
            if comp.service_description:
                lines.append(f"  - Service: {comp.service_description}")
    else:
        lines.append("*(No competitors defined)*")

    lines.extend([
        "",
        "## Target Publication",
    ])

    if brief.target_domain:
        lines.append(f"**Suggested Site**: {brief.target_domain}")
        if brief.target_domain_rationale:
            lines.append(f"**Rationale**: {brief.target_domain_rationale}")
    else:
        lines.append("*(To be determined based on research)*")

    lines.extend([
        "",
        "## Key Messages",
    ])

    if key_messages:
        lines.append(key_messages)
    else:
        lines.append("*(No specific key messages defined)*")

    lines.extend([
        "",
        "## Search Intent & Funnel Stage",
        f"- **Buyer Stage**: {buyer_stage.upper()} ({_funnel_label(buyer_stage)})",
        f"- **Search Intent**: {_search_intent(brief.category)}",
        f"- **Keyword Type**: {_keyword_type(brief.keyword)}",
    ])

    lines.extend([
        "",
        "## Suggested Approach",
    ])

    approach = _suggest_approach(brief.category, buyer_stage, brief.recommendation_type)
    lines.append(approach)

    # ── Recommended Skills section ───────────────────────────────────────────
    lines.extend([
        "",
        "## Recommended Skills (Claude Code CLI)",
        "",
        f"**Primary → `{SKILL_DESCRIPTIONS[primary_skill]['command']}`**",
        f"{SKILL_DESCRIPTIONS[primary_skill]['use']}",
    ])

    if secondary_skills:
        lines.extend([
            "",
            "**Secondary skills to use after:**",
        ])
        for sk in secondary_skills:
            if sk in SKILL_DESCRIPTIONS:
                d = SKILL_DESCRIPTIONS[sk]
                lines.append(f"- `{d['command']}` — {d['use']}")

    lines.extend([
        "",
        "### How to invoke in CLI:",
        f"```",
        f"# Step 1: Invoke primary skill",
        f"{SKILL_DESCRIPTIONS[primary_skill]['command']}",
        f"# Then paste this entire brief as context",
        f"```",
    ])

    if secondary_skills and secondary_skills[0] in SKILL_DESCRIPTIONS:
        first_secondary = SKILL_DESCRIPTIONS[secondary_skills[0]]
        lines.extend([
            f"```",
            f"# Step 2: After writing the content, enhance with secondary skill",
            f"{first_secondary['command']}",
            f"# Provide the generated content + this brief",
            f"```",
        ])

    lines.extend([
        "",
        "---",
        "",
        f"*Generated by SEO/GEO Partner AI for {project.name}*",
    ])

    return "\n".join(lines)


def _funnel_label(buyer_stage: str) -> str:
    """Return funnel label for buyer stage."""
    mapping = {
        "awareness": "TOFU — usuario quiere aprender",
        "consideration": "MOFU — usuario está comparando opciones",
        "decision": "BOFU — usuario listo para comprar/contratar",
    }
    return mapping.get(buyer_stage, "TOFU")


def _search_intent(category: str) -> str:
    """Return search intent description for a category."""
    mapping = {
        "guide":          "Informacional — aprender cómo hacer algo",
        "authority":      "Informacional — buscar perspectiva experta",
        "discovery":      "Informacional — descubrir opciones",
        "trend":          "Informacional — enterarse de novedades",
        "ranking":        "Comercial/Investigación — comparar las mejores opciones",
        "comparison":     "Comercial/Investigación — evaluar alternativas",
        "recommendation": "Comercial/Investigación — buscar recomendaciones",
        "content_gap":    "Comercial/Investigación — profundizar en tema",
        "influencer":     "Comercial/Investigación — buscar validación social",
        "solution":       "Transaccional — resolver un problema concreto",
    }
    return mapping.get(category, "Informacional")


def _keyword_type(keyword: str) -> str:
    """Classify keyword by length as short/middle/long-tail."""
    words = keyword.split()
    n = len(words)
    if n <= 2:
        return f"Short-tail ({n} palabras) — alto volumen, alta competencia"
    elif n <= 4:
        return f"Middle-tail ({n} palabras) — volumen medio, competencia media"
    else:
        return f"Long-tail ({n} palabras) — bajo volumen, baja competencia, alta conversión"


def _infer_buyer_stage(category: str) -> str:
    """Map content category to buyer stage."""
    mapping = {
        "discovery": "awareness",
        "recommendation": "consideration",
        "comparison": "consideration",
        "ranking": "consideration",
        "problem": "awareness",
        "guide": "awareness",
        "solution": "decision",
        "authority": "awareness",
        "content_gap": "awareness",
        "influencer": "consideration",
        "trend": "awareness",
    }
    return mapping.get(category, "awareness")


def _suggest_approach(category: str, buyer_stage: str, rec_type: str) -> str:
    """Generate suggested approach based on category and stage."""

    if rec_type == "prompt":
        if category in ["discovery", "recommendation"]:
            return (
                "**Para GEO Discovery/Recommendation**: Crea contenido que responda directamente la pregunta del prompt. "
                "Estructura con headings claros. Menciona a los competidores con naturalidad. "
                "Incluye listas estructuradas y posicionamiento autoritativo. "
                "Usa `/content-strategy` para planificar el cluster temático, luego `/copywriting` para escribir. "
                "**Optimización GEO**: Respuestas concisas al inicio, luego desarrollo. Los LLMs prefieren "
                "contenido estructurado con listas, tablas y respuestas directas."
            )
        elif category == "comparison":
            return (
                "**Para Comparison Prompts**: Estructura como tabla comparativa o análisis sección-por-sección. "
                "Incluye pros/contras, precios, casos de uso. Menciona competidores de forma objetiva. "
                "Usa `/copywriting` para el contenido y `/schema-markup` para añadir ComparisonTable o FAQ schema. "
                "**Optimización GEO**: Las tablas comparativas son muy citadas por LLMs — estructura clara, sin sesgo obvio."
            )
        else:
            return (
                "**Para GEO Prompts**: Responde la pregunta específica de forma exhaustiva. "
                "Usa estructura clara con headings, incluye menciones relevantes de competidores, "
                "y optimiza para parseo de LLMs con datos estructurados y headings descriptivos. "
                "Usa `/copywriting` para el draft y `/schema-markup` para structured data."
            )

    # ── Keyword-based approaches ─────────────────────────────────────────────
    if category == "ranking":
        return (
            "**Ranking Article (Top N)**: Crea un artículo con lista numerada o categorizada (ej: 'Top 10 herramientas de...'). "
            "Incluye descripción, pros/contras y tabla comparativa. Optimiza para featured snippets. "
            "\n\n"
            "**Con `/programmatic-seo`**: Define el template base (URL pattern, meta template, estructura de sección), "
            "luego escala a múltiples variantes (por ciudad, industria, caso de uso). "
            "\n\n"
            "**Con `/schema-markup`**: Añade `ItemList` schema para aparecer como rich result en Google. "
            "También añade `FAQPage` schema para las preguntas frecuentes al final."
        )
    elif category == "comparison":
        return (
            "**Comparison / Vs Article**: Estructura con formato vs-comparativo. Tabla side-by-side de features, "
            "análisis detallado, recomendación por caso de uso. "
            "\n\n"
            "**Con `/copywriting`**: Draft completo del artículo con copy persuasivo y equilibrado. "
            "\n\n"
            "**Con `/competitor-alternatives`**: Genera también páginas 'Alternativas a [Competidor]' y "
            "'[Tu Marca] vs [Competidor]' para capturar todo el tráfico comparativo. "
            "\n\n"
            "**Con `/schema-markup`**: Añade `FAQPage` schema para las preguntas del tipo '¿Cuál es mejor?'"
        )
    elif category == "guide":
        return (
            "**Guía / How-To**: Estructura con pasos claros. H2 para pasos principales, H3 para subpasos. "
            "Incluye ejemplos, casos reales y un FAQ al final. "
            "\n\n"
            "**Con `/copywriting`**: Draft completo de la guía con tono educativo y ejemplos concretos. "
            "\n\n"
            "**Con `/schema-markup`**: Añade `HowTo` schema (pasos structured data) para rich results en Google. "
            "También `FAQPage` para las preguntas frecuentes. "
            "\n\n"
            "**Con `/seo-audit`**: Antes de escribir, audita los artículos de competidores que ya rankean "
            "para entender qué cubren y qué les falta — tu artículo debe ser claramente superior."
        )
    elif category == "solution":
        return (
            "**Solution Article**: Lidera con el problema, luego la solución. Usa estructura 'Qué, Por qué, Cómo'. "
            "Incluye templates, checklists o herramientas. CTA fuerte hacia el producto/servicio. "
            "\n\n"
            "**Con `/copywriting`**: Draft con estructura problema→agitación→solución (PAS formula). "
            "\n\n"
            "**Con `/schema-markup`**: Añade `HowTo` o `FAQPage` schema para decision-stage keywords. "
            "Los artículos de solución con schema tienen más CTR desde featured snippets."
        )
    elif category == "authority":
        return (
            "**Thought Leadership / Autoridad**: Comparte insights únicos, datos originales o perspectiva experta. "
            "Cuestiona la sabiduría convencional con evidencia. Estructura para shareabilidad. "
            "\n\n"
            "**Con `/content-strategy`**: Primero planifica el cluster temático completo — este artículo de "
            "autoridad debe ser el pilar central de un topic cluster con artículos satélite. "
            "\n\n"
            "**Con `/marketing-ideas`**: Genera ideas de distribución y amplificación para este contenido "
            "de autoridad: PR, social, newsletter, outreach a influencers del nicho."
        )
    elif category in ["discovery", "recommendation"]:
        return (
            "**Discovery/Recommendation Content**: Contenido diseñado para aparecer cuando usuarios buscan "
            "recomendaciones o están en fase de descubrimiento. "
            "\n\n"
            "**Con `/content-strategy`**: Define el cluster de discovery — este artículo debe responder "
            "'¿Qué es X?' y 'Las mejores opciones de X'. "
            "\n\n"
            "**Con `/marketing-ideas`**: Explora canales de distribución adicionales: "
            "newsletters del sector, influencers, comunidades online. "
            "\n\n"
            "**Con `/referral-program`**: Si el contenido recomienda tu producto, diseña un referral program "
            "que convierta a lectores en embajadores."
        )
    elif category == "influencer":
        return (
            "**Influencer / Co-Marketing Content**: Contenido diseñado para ser creado con o distribuido por "
            "influencers del nicho. "
            "\n\n"
            "**Con `/marketing-ideas`**: Identifica los mejores formatos y canales para este tipo de contenido "
            "(guest posts, co-webinars, expert roundups, entrevistas). "
            "\n\n"
            "**Con `/referral-program`**: Estructura un programa de embajadores o afiliados que incentive "
            "a influencers a crear y compartir contenido sobre tu marca."
        )
    else:
        return (
            "**General Content**: Estructura con headings claros que coincidan con el search intent. "
            "Párrafos concisos, bullet points y ejemplos. Incluye enlaces internos. "
            "\n\n"
            "**Con `/copywriting`**: Draft completo con tono y estructura optimizados. "
            "**Con `/schema-markup`**: Añade structured data apropiado para el tipo de contenido."
        )
