"""Hybrid domain classifier: Rules engine → LLM fallback → Manual override."""

from app.engines.domain.rules_engine import RuleClassification, classify_by_rules


async def classify_domain(domain: str, *, use_llm_fallback: bool = True) -> RuleClassification:
    """Classify a domain, optionally using LLM as fallback.

    Flow:
    1. Check rules engine (known lists + patterns) — free, instant
    2. If unclassified and use_llm_fallback=True, ask LLM — costs ~$0.002
    3. Return result (manual override applied at API layer)
    """
    result = classify_by_rules(domain)

    if result.domain_type is not None:
        return result

    if not use_llm_fallback:
        return result

    # LLM fallback
    return await _classify_with_llm(domain)


async def _classify_with_llm(domain: str) -> RuleClassification:
    """Use LLM to classify an unknown domain."""
    from app.engines.geo import get_adapter

    prompt = (
        f"Classify the website domain '{domain}' into one of these categories:\n"
        f"- editorial: news sites, blogs, magazines, review sites\n"
        f"- corporate: company websites, product pages\n"
        f"- ugc: forums, Q&A sites, user-generated content\n"
        f"- competitor: banks, neobanks, fintech companies\n"
        f"- reference: Wikipedia, encyclopedias, dictionaries\n"
        f"- institutional: government, regulators, universities\n"
        f"- aggregator: comparison engines, data tools\n\n"
        f"Also answer: would this site likely accept sponsored/guest content? (yes/no)\n\n"
        f"Reply in this exact format:\n"
        f"type: <category>\n"
        f"sponsored: <yes|no>"
    )

    adapter = get_adapter("openai")
    try:
        resp = await adapter.query(prompt)
        text = resp.text.strip().lower()

        domain_type = "other"
        accepts_sponsored = None
        for line in text.split("\n"):
            if line.startswith("type:"):
                val = line.split(":", 1)[1].strip()
                valid = {"editorial", "corporate", "ugc", "competitor", "reference", "institutional", "aggregator"}
                if val in valid:
                    domain_type = val
            elif line.startswith("sponsored:"):
                val = line.split(":", 1)[1].strip()
                accepts_sponsored = val in ("yes", "sí", "si")

        return RuleClassification(domain_type, accepts_sponsored, "llm")
    except Exception:
        return RuleClassification(None, None, "llm_error")
    finally:
        await adapter.close()
