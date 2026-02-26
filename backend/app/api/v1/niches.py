"""Niches router: CRUD for target market niches + niche-competitor assignments."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.niche import Niche, NicheBrand
from app.models.project import Brand, Project
from app.schemas.niche import (
    NicheBrandAdd,
    NicheCreate,
    NicheDetailResponse,
    NicheResponse,
    NicheUpdate,
)

router = APIRouter()


# --- Helpers ---

async def _get_project_or_404(project_id: uuid.UUID, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _get_niche_or_404(project_id: uuid.UUID, slug: str, db: AsyncSession) -> Niche:
    result = await db.execute(
        select(Niche).where(Niche.project_id == project_id, Niche.slug == slug)
    )
    niche = result.scalar_one_or_none()
    if not niche:
        raise HTTPException(status_code=404, detail="Niche not found")
    return niche


# --- Niche CRUD ---

@router.post("/{project_id}/niches", response_model=NicheResponse, status_code=201)
async def create_niche(project_id: uuid.UUID, data: NicheCreate, db: AsyncSession = Depends(get_db)):
    await _get_project_or_404(project_id, db)
    # Check slug uniqueness within project
    existing = await db.execute(
        select(Niche).where(Niche.project_id == project_id, Niche.slug == data.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Niche slug already exists in this project")
    niche = Niche(project_id=project_id, **data.model_dump())
    db.add(niche)
    await db.flush()
    await db.refresh(niche)
    return NicheResponse(
        id=niche.id, name=niche.name, slug=niche.slug,
        description=niche.description, brief=niche.brief,
        sort_order=niche.sort_order,
        competitor_count=0, created_at=niche.created_at,
    )


@router.get("/{project_id}/niches", response_model=list[NicheResponse])
async def list_niches(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    # Subquery for competitor count
    count_sq = (
        select(NicheBrand.niche_id, func.count(NicheBrand.id).label("cnt"))
        .group_by(NicheBrand.niche_id)
        .subquery()
    )
    result = await db.execute(
        select(Niche, func.coalesce(count_sq.c.cnt, 0).label("competitor_count"))
        .outerjoin(count_sq, Niche.id == count_sq.c.niche_id)
        .where(Niche.project_id == project_id)
        .order_by(Niche.sort_order, Niche.name)
    )
    rows = result.all()
    return [
        NicheResponse(
            id=niche.id, name=niche.name, slug=niche.slug,
            description=niche.description, brief=niche.brief,
            sort_order=niche.sort_order,
            competitor_count=cnt, created_at=niche.created_at,
        )
        for niche, cnt in rows
    ]


@router.get("/{project_id}/niches/{slug}", response_model=NicheDetailResponse)
async def get_niche(project_id: uuid.UUID, slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Niche)
        .where(Niche.project_id == project_id, Niche.slug == slug)
        .options(selectinload(Niche.niche_brands).selectinload(NicheBrand.brand))
    )
    niche = result.scalar_one_or_none()
    if not niche:
        raise HTTPException(status_code=404, detail="Niche not found")
    competitors = [nb.brand for nb in niche.niche_brands]
    return NicheDetailResponse(
        id=niche.id, name=niche.name, slug=niche.slug,
        description=niche.description, brief=niche.brief,
        sort_order=niche.sort_order,
        competitor_count=len(competitors), created_at=niche.created_at,
        competitors=competitors,
    )


@router.put("/{project_id}/niches/{slug}", response_model=NicheResponse)
async def update_niche(project_id: uuid.UUID, slug: str, data: NicheUpdate, db: AsyncSession = Depends(get_db)):
    niche = await _get_niche_or_404(project_id, slug, db)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(niche, key, value)
    await db.flush()
    await db.refresh(niche)
    # Count competitors
    count_result = await db.execute(
        select(func.count(NicheBrand.id)).where(NicheBrand.niche_id == niche.id)
    )
    cnt = count_result.scalar() or 0
    return NicheResponse(
        id=niche.id, name=niche.name, slug=niche.slug,
        description=niche.description, brief=niche.brief,
        sort_order=niche.sort_order,
        competitor_count=cnt, created_at=niche.created_at,
    )


@router.delete("/{project_id}/niches/{slug}", status_code=204)
async def delete_niche(project_id: uuid.UUID, slug: str, db: AsyncSession = Depends(get_db)):
    niche = await _get_niche_or_404(project_id, slug, db)
    await db.delete(niche)


# --- Niche Competitors ---

@router.post("/{project_id}/niches/{slug}/competitors", response_model=NicheDetailResponse, status_code=201)
async def add_competitor(project_id: uuid.UUID, slug: str, data: NicheBrandAdd, db: AsyncSession = Depends(get_db)):
    niche = await _get_niche_or_404(project_id, slug, db)
    # Verify brand exists and belongs to project
    brand_result = await db.execute(
        select(Brand).where(Brand.id == data.brand_id, Brand.project_id == project_id)
    )
    if not brand_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Brand not found in this project")
    # Check not already linked
    existing = await db.execute(
        select(NicheBrand).where(NicheBrand.niche_id == niche.id, NicheBrand.brand_id == data.brand_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Brand already linked to this niche")
    nb = NicheBrand(niche_id=niche.id, brand_id=data.brand_id)
    db.add(nb)
    await db.flush()
    # Return full niche detail
    return await get_niche(project_id, slug, db)


@router.get("/{project_id}/niches/{slug}/competitors")
async def list_competitors(project_id: uuid.UUID, slug: str, db: AsyncSession = Depends(get_db)):
    niche = await _get_niche_or_404(project_id, slug, db)
    result = await db.execute(
        select(Brand)
        .join(NicheBrand, NicheBrand.brand_id == Brand.id)
        .where(NicheBrand.niche_id == niche.id)
        .order_by(Brand.name)
    )
    return result.scalars().all()


@router.delete("/{project_id}/niches/{slug}/competitors/{brand_id}", status_code=204)
async def remove_competitor(project_id: uuid.UUID, slug: str, brand_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    niche = await _get_niche_or_404(project_id, slug, db)
    result = await db.execute(
        select(NicheBrand).where(NicheBrand.niche_id == niche.id, NicheBrand.brand_id == brand_id)
    )
    nb = result.scalar_one_or_none()
    if not nb:
        raise HTTPException(status_code=404, detail="Brand not linked to this niche")
    await db.delete(nb)


# --- Brief generation with web scraping + Claude ---

class BriefGenerateRequest(BaseModel):
    module_key: str  # "A", "B", "C", or "D"
    existing_brief: dict | None = None  # already-filled modules for context


class BriefGenerateResponse(BaseModel):
    text: str


@router.post("/{project_id}/niches/{slug}/brief/generate", response_model=BriefGenerateResponse)
async def generate_brief_module(
    project_id: uuid.UUID,
    slug: str,
    data: BriefGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate a brief module using web scraping + Claude.

    Scrapes the client's website homepage for real context, then calls Claude
    to write a specific module (A, B, C, or D) of the niche brief.
    """
    if data.module_key not in ("A", "B", "C", "D"):
        raise HTTPException(status_code=400, detail="module_key must be A, B, C, or D")

    # Load project + brands
    project = await _get_project_or_404(project_id, db)
    niche = await _get_niche_or_404(project_id, slug, db)

    # Load brand details
    brand_result = await db.execute(
        select(Brand).where(Brand.project_id == project_id)
    )
    brands = brand_result.scalars().all()
    client_brand = next((b for b in brands if b.is_client), None)
    competitors = [b for b in brands if not b.is_client]

    brand_name = client_brand.name if client_brand else project.name
    brand_domain = client_brand.domain if client_brand else None
    website_url = project.website or (f"https://{brand_domain}" if brand_domain else None)
    competitor_names = [c.name for c in competitors]

    # Scrape website homepage for real context
    website_text = ""
    if website_url:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(website_url, headers={"User-Agent": "Mozilla/5.0"})
                if resp.status_code == 200:
                    # Extract text content: title + meta description + visible text
                    import re
                    html = resp.text
                    # Extract title
                    title_m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
                    title = title_m.group(1).strip() if title_m else ""
                    # Extract meta description
                    desc_m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', html, re.I)
                    meta_desc = desc_m.group(1).strip() if desc_m else ""
                    # Strip HTML tags for body text
                    clean = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.S | re.I)
                    clean = re.sub(r"<[^>]+>", " ", clean)
                    clean = re.sub(r"\s+", " ", clean).strip()
                    body_snippet = clean[:2000]
                    website_text = f"Título: {title}\nDescripción: {meta_desc}\nContenido: {body_snippet}"
        except Exception:
            pass  # Proceed without web context if scraping fails

    # Build module-specific prompt
    MODULE_INSTRUCTIONS = {
        "A": (
            "Escribe el módulo A — CONTEXTO DE MARCA para este nicho.\n"
            "Incluye: posicionamiento diferencial vs competidores, propuesta de valor única, "
            "por qué un medio editorial querría hablar de esta marca. "
            "Sé específico y usa datos reales del sitio web si los tienes."
        ),
        "B": (
            "Escribe el módulo B — OBJETIVOS DEL NICHO.\n"
            "Incluye: objetivos concretos y medibles (menciones en medios, posiciones en SERP, "
            "visibilidad en IA), plazos realistas, tipos de contenido a conseguir."
        ),
        "C": (
            "Escribe el módulo C — AUDIENCIA TARGET para este nicho.\n"
            "Incluye: perfil demográfico, pain points, cómo se informan (Google, IAs, foros), "
            "qué buscan exactamente, medios que ya consumen. Sé específico al mercado indicado."
        ),
        "D": (
            "Escribe el módulo D — MENSAJES CLAVE.\n"
            "Incluye: mensaje principal de la marca, ángulos de contenido (comparativa, educativo, review), "
            "términos a usar y a evitar (compliance), tono de comunicación."
        ),
    }

    # Build existing brief context
    existing_context = ""
    if data.existing_brief:
        filled = {k: v for k, v in data.existing_brief.items() if v and v.strip()}
        if filled:
            parts = []
            if "A" in filled and data.module_key != "A":
                parts.append(f"Módulo A (Contexto de Marca ya escrito):\n{filled['A']}")
            if "B" in filled and data.module_key != "B":
                parts.append(f"Módulo B (Objetivos ya escritos):\n{filled['B']}")
            if "C" in filled and data.module_key != "C":
                parts.append(f"Módulo C (Audiencia ya escrita):\n{filled['C']}")
            if "D" in filled and data.module_key != "D":
                parts.append(f"Módulo D (Mensajes ya escritos):\n{filled['D']}")
            if parts:
                existing_context = "\n\nBRIEF YA COMPLETADO (usa como contexto):\n" + "\n\n".join(parts)

    prompt = f"""Eres un consultor experto en marketing digital y estrategia de contenidos.
Tu tarea: generar un módulo del brief estratégico de nicho para una campaña de SEO/GEO.

DATOS DE LA CAMPAÑA:
- Marca cliente: {brand_name}
- Nicho: {niche.name}
- Descripción del nicho: {niche.description or 'No especificada'}
- Mercado: {project.market}
- Idioma: {project.language}
- Competidores en este nicho: {', '.join(competitor_names) if competitor_names else 'No especificados'}
{f"- Website: {website_url}" if website_url else ""}

{f"INFORMACIÓN DEL SITIO WEB (obtenida en tiempo real):{chr(10)}{website_text}" if website_text else ""}
{existing_context}

TAREA:
{MODULE_INSTRUCTIONS[data.module_key]}

Responde SOLO con el texto del módulo, sin explicaciones adicionales ni encabezados extra.
Escribe entre 150-300 palabras. En {project.language if project.language == 'en' else 'español'}.
Sé concreto, específico y orientado a acción. No uses placeholders como [completar] — rellena con datos reales o suposiciones razonadas basadas en el contexto."""

    # Call Claude via OpenRouter
    from app.engines.geo.openrouter_adapter import OpenRouterAdapter
    from app.config import settings

    if not settings.openrouter_api_key:
        raise HTTPException(status_code=503, detail="OpenRouter API key not configured")

    adapter = OpenRouterAdapter(
        model="anthropic/claude-sonnet-4-5",
        display_provider="anthropic",
    )
    try:
        resp = await adapter.query(prompt)
        return BriefGenerateResponse(text=resp.text.strip())
    finally:
        await adapter.close()


# --- AI competitor suggestions ---

class CompetitorSuggestion(BaseModel):
    name: str
    domain: str
    description: str
    rationale: str


class SuggestCompetitorsResponse(BaseModel):
    suggestions: list[CompetitorSuggestion]


@router.post("/{project_id}/niches/{slug}/suggest-competitors", response_model=SuggestCompetitorsResponse)
async def suggest_competitors(
    project_id: uuid.UUID,
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Use Claude to suggest competitors for a niche, based on brand + market context."""
    from app.config import settings
    from app.engines.geo.openrouter_adapter import OpenRouterAdapter

    if not settings.openrouter_api_key:
        raise HTTPException(status_code=503, detail="OpenRouter API key not configured")

    project = await _get_project_or_404(project_id, db)
    niche = await _get_niche_or_404(project_id, slug, db)

    # Load brands
    brand_result = await db.execute(
        select(Brand).where(Brand.project_id == project_id)
    )
    brands = brand_result.scalars().all()
    client_brand = next((b for b in brands if b.is_client), None)
    existing_competitors = [b for b in brands if not b.is_client]

    brand_name = client_brand.name if client_brand else project.name
    brand_domain = client_brand.domain if client_brand else None
    existing_names = [b.name for b in existing_competitors]

    # Scrape client website for context
    website_text = ""
    website_url = project.website or (f"https://{brand_domain}" if brand_domain else None)
    if website_url:
        try:
            import httpx, re
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.get(website_url, headers={"User-Agent": "Mozilla/5.0"})
                if resp.status_code == 200:
                    html = resp.text
                    title_m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
                    desc_m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', html, re.I)
                    title = title_m.group(1).strip() if title_m else ""
                    meta_desc = desc_m.group(1).strip() if desc_m else ""
                    website_text = f"Título: {title}\nDescripción: {meta_desc}"
        except Exception:
            pass

    existing_note = (
        f"\nCompetidores ya añadidos (NO repetir): {', '.join(existing_names)}"
        if existing_names else ""
    )

    prompt = f"""Eres un experto en análisis competitivo de marketing digital.
Necesito identificar los principales competidores directos de una empresa/agencia, es decir, otras empresas que ofrecen servicios o contenidos similares y compiten por el mismo tipo de cliente.

EMPRESA CLIENTE:
- Nombre: {brand_name}
- Tipo de servicio/negocio: según la web → {website_text or 'consultoría de marketing/growth'}
- Nicho objetivo (tipo de cliente al que se dirigen): {niche.name}
- Descripción del nicho: {niche.description or 'No especificada'}
- Mercado: {project.market}
- Idioma: {project.language}
{f"- Website: {website_url}" if website_url else ""}
{existing_note}

IMPORTANTE: Los competidores NO son empresas dentro del nicho "{niche.name}", sino otras empresas/agencias/plataformas que compiten con {brand_name} por captar ese mismo tipo de cliente.
Por ejemplo: si {brand_name} es una agencia de growth marketing para fintech, sus competidores son otras agencias de growth, consultoras de marketing digital, comunidades de growth hacking, etc. que también apuntan a empresas fintech.

TAREA:
Identifica entre 5 y 8 competidores directos de {brand_name} que también trabajan con clientes del tipo "{niche.name}" en el mercado "{project.market}".

Para cada competidor devuelve un JSON con este formato exacto:
{{
  "name": "Nombre del competidor",
  "domain": "dominio.com",
  "description": "1-2 frases describiendo qué hace y por qué compite con {brand_name}",
  "rationale": "Por qué capta el mismo tipo de cliente ({niche.name}) en el mismo mercado"
}}

Responde SOLO con un array JSON válido de objetos. Sin texto adicional, sin markdown, sin bloques de código.
Ejemplo: [{{"name": "Empresa X", "domain": "empresax.com", "description": "...", "rationale": "..."}}]

Asegúrate de que los dominios sean reales y verificables."""

    import json

    adapter = OpenRouterAdapter(
        model="anthropic/claude-sonnet-4-5",
        display_provider="anthropic",
    )
    try:
        resp = await adapter.query(prompt)
        raw = resp.text.strip()

        # Extract JSON array from response
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start == -1 or end == 0:
            raise HTTPException(status_code=502, detail="Claude did not return a valid JSON array")

        suggestions_raw = json.loads(raw[start:end])
        suggestions = [
            CompetitorSuggestion(
                name=s.get("name", ""),
                domain=s.get("domain", "").lower().strip().removeprefix("https://").removeprefix("http://").rstrip("/"),
                description=s.get("description", ""),
                rationale=s.get("rationale", ""),
            )
            for s in suggestions_raw
            if s.get("name") and s.get("domain")
        ]
        return SuggestCompetitorsResponse(suggestions=suggestions)
    finally:
        await adapter.close()
