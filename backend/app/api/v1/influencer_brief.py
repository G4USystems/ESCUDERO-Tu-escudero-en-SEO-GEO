"""Influencer campaign brief generator — LLM-generated brief per niche."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.niche import Niche, NicheBrand
from app.models.project import Brand, Project

router = APIRouter(prefix="/projects", tags=["influencer-brief"])


class InfluencerBriefResponse(BaseModel):
    brief: str              # full markdown brief
    generated_at: str
    client_name: str
    niche_name: str


async def _generate_influencer_brief(
    client_name: str,
    company_type: str | None,
    service_description: str | None,
    target_market: str | None,
    about_summary: str | None,
    niche_name: str,
    competitor_names: list[str],
    niche_brief: dict | None = None,
) -> str:
    from app.config import settings

    competitors_str = ", ".join(competitor_names[:6]) if competitor_names else "ninguno identificado"

    brand_context = "\n".join(filter(None, [
        f"- Tipo de empresa: {company_type}" if company_type else None,
        f"- Descripción del servicio: {service_description}" if service_description else None,
        f"- Mercado objetivo: {target_market}" if target_market else None,
        f"- Resumen: {about_summary}" if about_summary else None,
    ])) or "- Sin información adicional disponible"

    # Build niche brief context from A/B/C/D modules
    niche_context_parts = []
    if niche_brief and isinstance(niche_brief, dict):
        labels = {"A": "Contexto de marca", "B": "Objetivos del nicho", "C": "Audiencia target", "D": "Mensajes clave"}
        for key in ["A", "B", "C", "D"]:
            val = str(niche_brief.get(key) or "").strip()
            if val:
                niche_context_parts.append(f"[{labels.get(key, key)}]\n{val[:800]}")
    niche_context = "\n\n".join(niche_context_parts) if niche_context_parts else "(sin brief de nicho)"

    date_str = datetime.utcnow().strftime("%d %b %Y")

    prompt = f"""Genera un brief de campaña de influencer marketing para la siguiente empresa y nicho.

DATOS DE LA EMPRESA:
- Nombre: {client_name}
{brand_context}
- Nicho: {niche_name}
- Competidores principales: {competitors_str}

CONTEXTO DEL NICHO (usa esto para entender la audiencia y los objetivos específicos):
{niche_context}

---

Produce el brief en Markdown siguiendo EXACTAMENTE esta estructura (inspirada en briefs editoriales de alto nivel como los de Monzo, Revolut o N26). NO uses tablas de KPIs ni perfiles demográficos genéricos. El tono es editorial, directo y orientado al influencer, no al departamento de marketing.

---

# {client_name.upper()} INFLUENCER BRIEF: {niche_name.upper()}
## [Escribe un subtítulo que capture el ángulo de la campaña en una frase — máx. 10 palabras]

---

## 1. QUIÉN ES {client_name.upper()} (Lo que vas a presentar)

[3 bullet points. Cada uno empieza con **negrita que resume la idea** seguida de 1-2 frases de explicación. Los 3 puntos deben responder: (1) qué es la empresa de verdad, (2) para qué está construida específicamente, (3) qué resuelve que los competidores no resuelven. Sé específico con {client_name}, no genérico.]

---

## 2. LA CAMPAÑA: POR QUÉ ESTE NICHO

[2-3 frases que expliquen quién es la audiencia de este nicho y por qué es el momento. Conecta el problema concreto de esa audiencia con lo que {client_name} resuelve.]

**El ángulo que lo une todo:**
> *[Una sola frase — el insight central de la campaña. Tiene que ser memorable y específica a este nicho. No una descripción, sino una verdad que hace que la audiencia piense "exacto, eso me pasa a mí".]*

---

## 3. LA AUDIENCIA — Puntos clave para el influencer

**El hook:** *"[Una frase de apertura en primera persona — como empezaría un vídeo real. Específica, concreta, con un momento reconocible.]*"

**Lo que {client_name} hace que la alternativa no hace:**

[4-5 bullet points. Cada uno empieza con **negrita que nombra el beneficio** seguida de 1-2 frases concretas que explican POR QUÉ importa a esta audiencia específica. No listes features — explica la consecuencia real para el usuario. Menciona alternativas (no marcas concretas de competidores) para dar contexto: "sin {client_name}, tendrías que..."]

**La frase que no puede faltar:**
> *"[Una frase memorable que el influencer puede usar literalmente en su contenido — directa, sin jerga de marketing.]*"

---

## 4. POR QUÉ AHORA

- **[Título del motivo 1].** [1-2 frases explicando por qué este momento específico es relevante para este nicho y audiencia.]
- **[Título del motivo 2].** [1-2 frases.]
- **[Título del motivo 3].** [1-2 frases.]

---

## 5. LO QUE NO PUEDE FALTAR (Non-negotiables)

Cada pieza de contenido debe incluir:

- ✅ **#Ad** o **#Publicidad** — visible al inicio, no al final
- ✅ [Elemento obligatorio específico del sector/producto — ej. mencionar limitaciones, regulación, etc.]
- ✅ [Otro elemento obligatorio real para este tipo de producto]

**Frases que puedes usar — frases que no:**
- "[Afirmación honesta y verificable]" ✅ — "[Versión exagerada o no verificable de lo mismo]" ❌
- "[Otra afirmación correcta]" ✅ — "[Versión problemática]" ❌
- "[Otra más]" ✅ — "[Versión que prometería demasiado]" ❌

**Nunca:**
- [Cosa concreta que no se puede hacer — específica para {client_name} y el sector]
- [Otra restricción real — comparaciones, promesas, etc.]
- [Obligación legal — etiquetado publicitario según ley española]

---

## 6. FORMATOS QUE FUNCIONAN

**TikTok / Reels:**
[Describe el arco narrativo específico: cuál es el momento de conflicto o reconocimiento, cómo evoluciona, cuál es el contraste con {client_name}. Sé concreto — "empieza con X, muestra Y, termina con Z".]

**YouTube / Contenido largo:**
[Cómo integrar de forma natural en un vídeo existente. Qué momento del vídeo es el más natural para la mención.]

**Stories / Contenido efímero:**
[Mecánica específica: qué mostrar, cuántas stories, qué acción se pide al espectador.]

---

## 7. EL RESUMEN (Lo que hay que contar)

**Para la audiencia de {niche_name}:**
> *[Un párrafo de 3-4 frases que lo resume todo. Empieza con el problema real de la audiencia, explica cómo {client_name} lo resuelve de forma específica, y termina con por qué es mejor que la alternativa que ya usan. Este párrafo debe poder leerse como el guión de los últimos 20 segundos de un vídeo.]*

---

*Brief generado por Escudero - SEO+GEO Intelligence — {date_str}*

---

REGLAS DE GENERACIÓN:
- Todo el brief en español
- Nada de placeholders entre corchetes en el output final — rellena todo con contenido real
- El tono es directo y editorial, escrito para el influencer, no para el departamento de marketing
- Cada punto debe ser específico a {client_name} y al nicho {niche_name}, nunca genérico
- Las frases entre comillas (hooks, taglines, resumen) deben poder usarse literalmente en un vídeo"""

    system = (
        "Eres un experto en influencer marketing con más de 10 años trabajando con marcas fintech, "
        "inversión y servicios digitales en el mercado español. "
        "Escribes briefs editoriales de alto nivel — directos, narrativos, accionables. "
        "Tu referencia de estilo es Monzo, Revolut o N26: marcas que comunican con claridad y sin jerga corporativa. "
        "Produces el markdown completo con todo relleno. Cero placeholders en el output."
    )

    async def _call_llm(p: str, s: str) -> str:
        if settings.anthropic_api_key:
            from app.engines.geo.claude_adapter import ClaudeAdapter
            adapter = ClaudeAdapter(model="claude-sonnet-4-6")
            resp = await adapter.query(p, system_prompt=s)
            await adapter.close()
            return resp.text

        if settings.openai_api_key:
            from app.engines.geo.openai_adapter import OpenAIAdapter
            adapter = OpenAIAdapter()
            resp = await adapter.query(p, system_prompt=s)
            await adapter.close()
            return resp.text

        if settings.openrouter_api_key:
            from app.engines.geo.openrouter_adapter import OpenRouterAdapter
            adapter = OpenRouterAdapter()
            resp = await adapter.query(p, system_prompt=s)
            await adapter.close()
            return resp.text

        return "⚠️ No hay API key configurada para generar el brief."

    try:
        return await _call_llm(prompt, system)
    except Exception as e:
        return f"❌ Error generando el brief: {e}"


_BRIEF_KEY = "influencer_brief_md"
_BRIEF_DATE_KEY = "influencer_brief_generated_at"


async def _load_niche_and_project(project_id: uuid.UUID, slug: str, db: AsyncSession):
    project_result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.brands))
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    niche_result = await db.execute(
        select(Niche).where(Niche.project_id == project_id, Niche.slug == slug)
    )
    niche = niche_result.scalar_one_or_none()
    if not niche:
        raise HTTPException(404, "Niche not found")

    return project, niche


@router.get("/{project_id}/niches/{slug}/influencer-brief", response_model=InfluencerBriefResponse)
async def get_influencer_brief(
    project_id: uuid.UUID,
    slug: str,
    regenerate: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Return saved brief or generate a new one via LLM (use ?regenerate=true to force)."""
    project, niche = await _load_niche_and_project(project_id, slug, db)

    client_brand: Brand | None = next((b for b in project.brands if b.is_client), None)
    client_name = client_brand.name if client_brand else project.name

    # Return saved version unless regenerate is requested
    saved = (niche.brief or {}).get(_BRIEF_KEY) if not regenerate else None
    if saved:
        return InfluencerBriefResponse(
            brief=saved,
            generated_at=(niche.brief or {}).get(_BRIEF_DATE_KEY, datetime.utcnow().isoformat()),
            client_name=client_name,
            niche_name=niche.name,
        )

    # Load competitors
    nb_result = await db.execute(
        select(NicheBrand)
        .where(NicheBrand.niche_id == niche.id)
        .options(selectinload(NicheBrand.brand))
    )
    competitor_names = [
        nb.brand.name for nb in nb_result.scalars().all()
        if not nb.brand.is_client
    ]

    brief_markdown = await _generate_influencer_brief(
        client_name=client_name,
        company_type=client_brand.company_type if client_brand else None,
        service_description=client_brand.service_description if client_brand else None,
        target_market=client_brand.target_market if client_brand else None,
        about_summary=client_brand.about_summary if client_brand else None,
        niche_name=niche.name,
        competitor_names=competitor_names,
        niche_brief=niche.brief,
    )

    # Persist
    generated_at = datetime.utcnow().isoformat()
    niche.brief = {**(niche.brief or {}), _BRIEF_KEY: brief_markdown, _BRIEF_DATE_KEY: generated_at}
    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(Niche).where(Niche.id == niche.id).values(brief=niche.brief)
    )
    await db.commit()

    return InfluencerBriefResponse(
        brief=brief_markdown,
        generated_at=generated_at,
        client_name=client_name,
        niche_name=niche.name,
    )


class InfluencerBriefSave(BaseModel):
    brief: str


@router.put("/{project_id}/niches/{slug}/influencer-brief", response_model=InfluencerBriefResponse)
async def save_influencer_brief(
    project_id: uuid.UUID,
    slug: str,
    data: InfluencerBriefSave,
    db: AsyncSession = Depends(get_db),
):
    """Save an edited influencer brief."""
    project, niche = await _load_niche_and_project(project_id, slug, db)

    client_brand: Brand | None = next((b for b in project.brands if b.is_client), None)
    client_name = client_brand.name if client_brand else project.name

    saved_at = datetime.utcnow().isoformat()
    niche.brief = {**(niche.brief or {}), _BRIEF_KEY: data.brief, _BRIEF_DATE_KEY: saved_at}
    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(Niche).where(Niche.id == niche.id).values(brief=niche.brief)
    )
    await db.commit()

    return InfluencerBriefResponse(
        brief=data.brief,
        generated_at=saved_at,
        client_name=client_name,
        niche_name=niche.name,
    )
