"""Sancho AI assistant — context-aware chat for the SEO/GEO tool."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.niche import Niche, NicheBrand
from app.models.project import Brand, Project

router = APIRouter(tags=["sancho"])


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class SanchoRequest(BaseModel):
    messages: list[ChatMessage]
    current_page: str | None = None   # e.g. "niches/fintech/configure"


class SanchoResponse(BaseModel):
    reply: str


def _build_system_prompt(project: Project, niches: list[Niche]) -> str:
    client_brand: Brand | None = next((b for b in project.brands if b.is_client), None)
    brand_info = ""
    if client_brand:
        parts = [f"Marca cliente: {client_brand.name}"]
        if client_brand.domain:
            parts.append(f"Dominio: {client_brand.domain}")
        if client_brand.company_type:
            parts.append(f"Tipo de empresa: {client_brand.company_type}")
        if client_brand.service_description:
            parts.append(f"Servicio: {client_brand.service_description[:200]}")
        if client_brand.target_market:
            parts.append(f"Mercado: {client_brand.target_market}")
        brand_info = "\n".join(parts)
    else:
        brand_info = "Marca cliente: no configurada aún"

    niche_lines = ""
    if niches:
        niche_lines = "Nichos configurados:\n" + "\n".join(
            f"  - {n.name} ({n.slug})" for n in niches[:8]
        )
    else:
        niche_lines = "Nichos: ninguno configurado aún"

    return f"""Eres Sancho, el asistente de IA de Escudero - SEO+GEO Intelligence. Eres sabio, directo y un poco irónico — como el verdadero Sancho Panza que cuida a su amo Don Quijote de los molinos de viento del marketing.

Tu función es ayudar al usuario a sacar el máximo provecho de la herramienta Escudero - SEO+GEO Intelligence:
- Explicar qué hace cada sección y por qué es importante
- Ayudar a completar formularios cuando el usuario pega texto (por ejemplo, descripción de una empresa)
- Guiar por el flujo de trabajo: Campaña → Nichos → Keywords/Prompts → Análisis → Resultados → Influencers
- Interpretar datos y resultados de análisis
- Sugerir acciones concretas basadas en el estado actual del proyecto

FLUJO COMPLETO DE LA HERRAMIENTA (para saber qué recomendar y cuándo):
1. Campaña — Configurar marca, competidores, mercado
2. Nichos — Definir segmentos de audiencia y sus briefs (A: contexto de marca, B: objetivos, C: audiencia, D: mensajes)
3. Configurar — Seleccionar keywords SEO y prompts GEO para el nicho
4. Analizar — Ejecutar análisis SERP + GEO contra competidores
5. Resultados — Ver gap analysis: dónde están los competidores y la marca no está
6. Influencers — Buscar y gestionar influencers para el nicho
   → BRIEF DE INFLUENCER: En "Influencers > Brief de Campaña" se genera automáticamente con IA un brief
     editorial completo (estructura: quién es la marca, la campaña, talking points, non-negotiables,
     formatos por plataforma, resumen). Recomendar cuando el usuario esté listo para activar influencers.
7. Dominar SEO — Generar keywords y artículos SEO con IA para el nicho

CUÁNDO RECOMENDAR EL BRIEF DE INFLUENCER:
- Cuando el usuario pregunta cómo activar influencers o qué hacer en la sección Influencers
- Cuando el análisis ya está hecho y el usuario quiere pasar a acción
- Cuando el usuario pregunta cómo comunicar la marca a través de creadores de contenido
- Cuando el usuario menciona TikTok, Instagram, YouTube o campañas de contenido

CONTEXTO DEL PROYECTO ACTUAL:
Proyecto: {project.name}
Mercado: {project.market} | Idioma: {project.language}
{brand_info}
{niche_lines}

REGLAS:
- Responde SIEMPRE en español
- Sé conciso (máx 3-4 frases salvo que te pidan más detalle)
- Si el usuario pega texto de una empresa/web, extrae: nombre, dominio, tipo de empresa, descripción del servicio, mercado objetivo, y díselo claramente para que lo copie en los campos del formulario
- Si no sabes algo del proyecto, dilo y guía al usuario hacia donde puede encontrarlo
- No inventes datos de análisis — di al usuario que ejecute el análisis primero
- NUNCA sugieras keywords, prompts o palabras clave específicas. Para eso está el recomendador de la sección "Dominar SEO". Guía al usuario a usar esa sección en su lugar.
- NUNCA listes ejemplos de keywords aunque te los pidan. Di al usuario que las genere con la herramienta.
- NUNCA escribas un brief de influencer tú mismo. Guía al usuario a generarlo en "Influencers > Brief de Campaña".
- Puedes usar algún refrán o expresión de Sancho Panza ocasionalmente, sin abusar"""


@router.post("/projects/{project_id}/sancho", response_model=SanchoResponse)
async def chat_with_sancho(
    project_id: uuid.UUID,
    request: SanchoRequest,
    db: AsyncSession = Depends(get_db),
):
    """Chat with Sancho, the AI assistant for the project."""
    from app.config import settings

    # Load project context
    project_result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.brands))
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    niches_result = await db.execute(
        select(Niche).where(Niche.project_id == project_id).order_by(Niche.sort_order)
    )
    niches = niches_result.scalars().all()

    system = _build_system_prompt(project, list(niches))

    # Build message list for the LLM
    messages_text = "\n".join(
        f"{'Usuario' if m.role == 'user' else 'Sancho'}: {m.content}"
        for m in request.messages[-10:]   # keep last 10 turns
    )

    # Append current page context if provided
    if request.current_page:
        page_hint = f"\n\n[El usuario está en la sección: {request.current_page}]"
        messages_text += page_hint

    # Get last user message
    last_user = next(
        (m.content for m in reversed(request.messages) if m.role == "user"),
        ""
    )

    # Build the full prompt for LLM
    conversation_prompt = f"""Historial de conversación:
{messages_text}

Responde como Sancho al último mensaje del usuario."""

    async def _call_llm(prompt: str, sys: str) -> str:
        if settings.anthropic_api_key:
            from app.engines.geo.claude_adapter import ClaudeAdapter
            adapter = ClaudeAdapter(model="claude-haiku-4-5-20251001")
            resp = await adapter.query(prompt, system_prompt=sys)
            await adapter.close()
            return resp.text

        if settings.openai_api_key:
            from app.engines.geo.openai_adapter import OpenAIAdapter
            adapter = OpenAIAdapter()
            resp = await adapter.query(prompt, system_prompt=sys)
            await adapter.close()
            return resp.text

        if settings.openrouter_api_key:
            from app.engines.geo.openrouter_adapter import OpenRouterAdapter
            adapter = OpenRouterAdapter()
            resp = await adapter.query(prompt, system_prompt=sys)
            await adapter.close()
            return resp.text

        return "Sin API key configurada. Configura ANTHROPIC_API_KEY o OPENAI_API_KEY en el .env."

    try:
        reply = await _call_llm(conversation_prompt, system)
        return SanchoResponse(reply=reply)
    except Exception as e:
        return SanchoResponse(reply=f"Error al procesar tu mensaje: {e}")


@router.post("/sancho/chat", response_model=SanchoResponse)
async def chat_general(request: SanchoRequest):
    """Sancho without project context — for home and campaign creation pages."""
    from app.config import settings

    system = """Eres Sancho, el asistente de IA de Escudero - SEO+GEO Intelligence. Eres sabio, directo y un poco irónico — como el verdadero Sancho Panza.

Tu función es ayudar al usuario a entender y usar la herramienta Escudero - SEO+GEO Intelligence:
- Explicar qué hace la herramienta y cómo empezar
- Ayudar a crear una nueva campaña: qué nombre poner, qué website, qué mercado, etc.
- Explicar los conceptos: campaña, nicho, competidores, keywords, prompts, análisis SEO+GEO
- Si el usuario pega texto de una empresa/web, extrae: nombre de empresa, dominio, tipo de empresa, descripción del servicio y mercado objetivo

LO QUE PUEDE HACER LA HERRAMIENTA (para orientar al usuario):
- Análisis SEO+GEO: detecta dónde aparecen los competidores y la marca no
- Recomendador de keywords y prompts: en "Dominar SEO" de cada nicho
- Generación de artículos SEO con IA: desde "Dominar SEO"
- Brief de campaña de influencer: en "Influencers > Brief de Campaña" — genera un brief editorial
  completo listo para enviar a creadores (talking points, hooks, non-negotiables, formatos por plataforma)

REGLAS:
- Responde SIEMPRE en español
- Sé conciso (máx 3-4 frases salvo que te pidan más detalle)
- NUNCA sugieras keywords, prompts o palabras clave específicas. Para eso existe el recomendador en la sección "Dominar SEO" de cada nicho.
- NUNCA escribas un brief de influencer tú mismo. Guía al usuario a generarlo en "Influencers > Brief de Campaña".
- Guía al usuario hacia crear su primera campaña si no sabe por dónde empezar"""

    messages_text = "\n".join(
        f"{'Usuario' if m.role == 'user' else 'Sancho'}: {m.content}"
        for m in request.messages[-10:]
    )
    if request.current_page:
        messages_text += f"\n\n[El usuario está en: {request.current_page}]"

    conversation_prompt = f"""Historial de conversación:
{messages_text}

Responde como Sancho al último mensaje del usuario."""

    async def _call_llm(prompt: str, sys: str) -> str:
        if settings.anthropic_api_key:
            from app.engines.geo.claude_adapter import ClaudeAdapter
            adapter = ClaudeAdapter(model="claude-haiku-4-5-20251001")
            resp = await adapter.query(prompt, system_prompt=sys)
            await adapter.close()
            return resp.text
        if settings.openai_api_key:
            from app.engines.geo.openai_adapter import OpenAIAdapter
            adapter = OpenAIAdapter()
            resp = await adapter.query(prompt, system_prompt=sys)
            await adapter.close()
            return resp.text
        if settings.openrouter_api_key:
            from app.engines.geo.openrouter_adapter import OpenRouterAdapter
            adapter = OpenRouterAdapter()
            resp = await adapter.query(prompt, system_prompt=sys)
            await adapter.close()
            return resp.text
        return "Sin API key configurada."

    try:
        reply = await _call_llm(conversation_prompt, system)
        return SanchoResponse(reply=reply)
    except Exception as e:
        return SanchoResponse(reply=f"Error: {e}")
