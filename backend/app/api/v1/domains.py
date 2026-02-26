"""Domain Intelligence API endpoints."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.domain import Domain, ExclusionRule, ProjectDomain
from app.schemas.domain import (
    BatchClassifyItem,
    BatchClassifyRequest,
    DomainClassifyRequest,
    DomainClassifyResponse,
    DomainCreate,
    DomainResponse,
    ExclusionRuleCreate,
    ExclusionRuleResponse,
)

router = APIRouter(prefix="/domains", tags=["domains"])


# --- Domains ---
@router.get("", response_model=list[DomainResponse])
async def list_domains(
    domain_type: str | None = None,
    accepts_sponsored: bool | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """List domains from the global catalog."""
    query = select(Domain)
    if domain_type:
        query = query.where(Domain.domain_type == domain_type)
    if accepts_sponsored is not None:
        query = query.where(Domain.accepts_sponsored == accepts_sponsored)
    query = query.limit(limit).order_by(Domain.domain)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=DomainResponse, status_code=201)
async def create_domain(data: DomainCreate, db: AsyncSession = Depends(get_db)):
    """Add a domain to the global catalog."""
    # Check uniqueness
    existing = await db.execute(
        select(Domain).where(Domain.domain == data.domain.lower().removeprefix("www."))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Domain already exists")

    domain = Domain(
        domain=data.domain.lower().removeprefix("www."),
        display_name=data.display_name,
        domain_type=data.domain_type,
        accepts_sponsored=data.accepts_sponsored,
        country=data.country,
        language=data.language,
        notes=data.notes,
        classified_by="manual",
        classified_at=datetime.now(timezone.utc),
    )
    db.add(domain)
    await db.commit()
    await db.refresh(domain)
    return domain


@router.post("/classify", response_model=DomainClassifyResponse)
async def classify_domain(data: DomainClassifyRequest):
    """Classify a domain using rules engine + optional LLM fallback."""
    from app.engines.domain.classifier import classify_domain as do_classify

    result = await do_classify(data.domain, use_llm_fallback=data.use_llm_fallback)
    return DomainClassifyResponse(
        domain=data.domain,
        domain_type=result.domain_type,
        accepts_sponsored=result.accepts_sponsored,
        classified_by=result.classified_by,
        is_excluded_fintech=result.is_excluded_fintech,
    )


@router.post("/batch-classify", response_model=list[BatchClassifyItem])
async def batch_classify_domains(
    data: BatchClassifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Classify multiple domains at once. Checks DB cache first, then rules, then LLM."""
    from app.engines.domain.classifier import classify_domain as do_classify
    from app.engines.domain.rules_engine import classify_by_rules

    # Normalize domains
    normalized = list({d.lower().removeprefix("www.") for d in data.domains if d.strip()})
    results: list[BatchClassifyItem] = []

    # 1. Check Domain table cache for all at once
    cached_result = await db.execute(
        select(Domain).where(Domain.domain.in_(normalized))
    )
    cached = {d.domain: d for d in cached_result.scalars().all()}

    uncached = [d for d in normalized if d not in cached]

    # Return cached results
    for d in normalized:
        if d in cached:
            dom = cached[d]
            results.append(BatchClassifyItem(
                domain=d,
                domain_type=dom.domain_type,
                accepts_sponsored=dom.accepts_sponsored,
                classified_by=dom.classified_by,
            ))

    # 2. For uncached: rules engine first, LLM for unknowns
    for d in uncached:
        rule_result = classify_by_rules(d)
        if rule_result.domain_type is not None:
            # Cache in Domain table
            new_dom = Domain(
                domain=d,
                domain_type=rule_result.domain_type,
                accepts_sponsored=rule_result.accepts_sponsored,
                classified_by=rule_result.classified_by,
                classified_at=datetime.now(timezone.utc),
            )
            db.add(new_dom)
            results.append(BatchClassifyItem(
                domain=d,
                domain_type=rule_result.domain_type,
                accepts_sponsored=rule_result.accepts_sponsored,
                classified_by=rule_result.classified_by,
            ))
        elif data.use_llm_fallback:
            try:
                llm_result = await do_classify(d, use_llm_fallback=True)
                # Cache in Domain table
                new_dom = Domain(
                    domain=d,
                    domain_type=llm_result.domain_type,
                    accepts_sponsored=llm_result.accepts_sponsored,
                    classified_by=llm_result.classified_by,
                    classified_at=datetime.now(timezone.utc),
                )
                db.add(new_dom)
                results.append(BatchClassifyItem(
                    domain=d,
                    domain_type=llm_result.domain_type,
                    accepts_sponsored=llm_result.accepts_sponsored,
                    classified_by=llm_result.classified_by,
                ))
            except Exception:
                results.append(BatchClassifyItem(
                    domain=d, domain_type=None, accepts_sponsored=None, classified_by="error",
                ))
        else:
            results.append(BatchClassifyItem(
                domain=d, domain_type=None, accepts_sponsored=None, classified_by="unclassified",
            ))

    try:
        await db.commit()
    except Exception:
        await db.rollback()  # If duplicate domains somehow

    return results


@router.patch("/{domain_id}", response_model=DomainResponse)
async def update_domain(
    domain_id: uuid.UUID,
    data: DomainCreate,
    db: AsyncSession = Depends(get_db),
):
    """Manually override domain classification."""
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(404, "Domain not found")

    if data.domain_type is not None:
        domain.domain_type = data.domain_type
    if data.accepts_sponsored is not None:
        domain.accepts_sponsored = data.accepts_sponsored
    if data.display_name is not None:
        domain.display_name = data.display_name
    if data.notes is not None:
        domain.notes = data.notes

    domain.classified_by = "manual"
    domain.classified_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(domain)
    return domain


# --- Exclusion Rules ---
@router.get("/exclusion-rules", response_model=list[ExclusionRuleResponse])
async def list_exclusion_rules(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """List exclusion rules for a project."""
    result = await db.execute(
        select(ExclusionRule)
        .where(ExclusionRule.project_id == project_id)
        .order_by(ExclusionRule.created_at)
    )
    return result.scalars().all()


@router.post("/exclusion-rules", response_model=ExclusionRuleResponse, status_code=201)
async def create_exclusion_rule(
    data: ExclusionRuleCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create an exclusion rule for a project."""
    valid_types = {"domain_exact", "domain_contains", "domain_type"}
    if data.rule_type not in valid_types:
        raise HTTPException(400, f"Invalid rule_type. Must be one of: {valid_types}")

    rule = ExclusionRule(
        project_id=data.project_id,
        rule_name=data.rule_name,
        description=data.description,
        rule_type=data.rule_type,
        rule_value=data.rule_value,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/exclusion-rules/{rule_id}", status_code=204)
async def delete_exclusion_rule(rule_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Delete an exclusion rule."""
    result = await db.execute(select(ExclusionRule).where(ExclusionRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    await db.delete(rule)
    await db.commit()
