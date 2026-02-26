"""Exclusion engine: decides if a domain should be excluded from results.

Core question: "Would this site accept sponsored content from our client?"
If NO → exclude.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.domain.rules_engine import BANK_NEOBANK_FINTECH_DOMAINS
from app.models.domain import ExclusionRule, ProjectDomain


async def is_excluded(
    session: AsyncSession,
    project_id: uuid.UUID,
    domain: str,
) -> bool:
    """Check if a domain should be excluded for a given project.

    Checks in order:
    1. Project-specific overrides (project_domains.is_excluded)
    2. Project exclusion rules (exclusion_rules)
    3. Global bank/neobank/fintech list
    """
    d = domain.lower().removeprefix("www.")

    # 1. Project-specific override (check if domain is explicitly excluded)
    from app.models.domain import Domain
    pd_result = await session.execute(
        select(ProjectDomain)
        .join(Domain, ProjectDomain.domain_id == Domain.id)
        .where(
            ProjectDomain.project_id == project_id,
            Domain.domain == d,
            ProjectDomain.is_excluded.is_(True),
        )
    )
    if pd_result.scalar_one_or_none():
        return True

    # 2. Project exclusion rules
    rules_result = await session.execute(
        select(ExclusionRule).where(
            ExclusionRule.project_id == project_id,
            ExclusionRule.is_active.is_(True),
        )
    )
    for rule in rules_result.scalars().all():
        if _matches_rule(d, rule):
            return True

    # 3. Global bank/fintech list
    if d in BANK_NEOBANK_FINTECH_DOMAINS:
        return True

    return False


def _matches_rule(domain: str, rule: ExclusionRule) -> bool:
    """Check if a domain matches an exclusion rule."""
    rule_type = rule.rule_type
    rule_value = rule.rule_value

    if rule_type == "domain_exact":
        # {"domains": ["bbva.es", "caixabank.es"]}
        return domain in rule_value.get("domains", [])

    if rule_type == "domain_contains":
        # {"domains": ["bbva.com", "bankinter.com"]} — substring match
        return any(p in domain for p in rule_value.get("domains", rule_value.get("patterns", [])))

    if rule_type == "domain_type":
        # {"types": ["competitor", "institutional"]}
        # Would need domain classification — handled at API layer
        return False

    return False
