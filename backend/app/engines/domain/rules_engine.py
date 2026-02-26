"""Rules-based domain classification using known patterns.

Covers ~70% of Spanish-market domains without any LLM call.
"""

from dataclasses import dataclass

# -----------------------------------------------------------------
# Known domain → type mappings
# -----------------------------------------------------------------
_KNOWN_EDITORIAL: set[str] = {
    # Spanish tech/finance editorial
    "finect.com", "helpmycash.com", "kelisto.es", "roams.es",
    "businessinsider.es", "emprendedores.es", "cincodias.elpais.com",
    "expansion.com", "eleconomista.es", "elpais.com", "lavanguardia.com",
    "abc.es", "elmundo.es", "20minutos.es", "xataka.com", "genbeta.com",
    "wwwhatsnew.com", "hipertextual.com", "elespanol.com", "vozpopuli.com",
    "bolsamania.com", "invertia.com", "marketingdirecto.com",
    "puromarketing.com", "reasonwhy.es", "directivosygerentes.es",
    "ecommerce-news.es", "modaes.es", "foodretail.es",
    # International editorial (Spanish editions)
    "forbes.es", "wired.com", "techcrunch.com", "theverge.com",
    "producthunt.com", "g2.com", "capterra.es", "trustpilot.com",
    # Personal finance blogs (Spain)
    "blogdelsuscriptor.com", "elblogdelemprendedor.com",
    "economiasimple.net", "vivirtrabajando.com",
    # Found in SERP — Spanish editorial/comparator sites
    "javilinares.com", "sincomisiones.org", "economiatic.com",
    "coinscrapfinance.com", "adslzone.net", "elreferente.es",
    "finnovating.com", "estrategafinanciero.com", "economipedia.com",
    "tegestionamos.com", "q2bstudio.com", "funcas.es",
    "seonetdigital.com", "rankia.com",
    # Marketing / growth editorial
    "marketingdirecto.com", "puromarketing.com", "reasonwhy.es",
    "ecommerce-news.es", "ticbeat.com", "computing.es",
    "emprendedores.es", "rrhhdigital.com",
}

_KNOWN_INSTITUTIONAL: set[str] = {
    "bde.es", "cnmv.es", "consumo.gob.es", "ine.es",
    "seg-social.es", "agenciatributaria.es", "boe.es",
}

_KNOWN_UGC: set[str] = {
    "reddit.com", "quora.com", "rankia.com", "forobeta.com",
    "trustpilot.com", "glassdoor.es", "forocoches.com",
    "mediavida.com", "burbuja.info",
}

_KNOWN_AGGREGATOR: set[str] = {
    "similarweb.com", "semrush.com", "ahrefs.com", "moz.com",
    "builtwith.com", "crunchbase.com", "linkedin.com", "es.linkedin.com",
}

# SaaS / corporate sites — NOT editorial, won't accept sponsored content
_KNOWN_CORPORATE: set[str] = {
    # CRM / Sales / Marketing SaaS
    "salesforce.com", "hubspot.com", "hubspot.es", "mailchimp.com",
    "activecampaign.com", "getresponse.com", "sendinblue.com", "brevo.com",
    "zoho.com", "pipedrive.com", "freshworks.com", "intercom.com",
    "zendesk.com", "drift.com", "hootsuite.com", "buffer.com",
    "sproutsocial.com", "later.com", "canva.com", "figma.com",
    "notion.so", "slack.com", "asana.com", "monday.com", "trello.com",
    "clickup.com", "basecamp.com", "airtable.com", "zapier.com",
    "make.com", "typeform.com", "surveymonkey.com", "calendly.com",
    # Analytics / SEO tools
    "google.com", "analytics.google.com", "hotjar.com", "mixpanel.com",
    "amplitude.com", "segment.com", "optimizely.com",
    # Cloud / infra
    "aws.amazon.com", "azure.microsoft.com", "cloud.google.com",
    "digitalocean.com", "heroku.com", "vercel.com", "netlify.com",
    # E-commerce platforms
    "shopify.com", "woocommerce.com", "prestashop.com", "magento.com",
    "bigcommerce.com", "stripe.com", "paypal.com",
    # HR / recruiting
    "indeed.com", "es.indeed.com", "infojobs.net", "glassdoor.es",
    "glassdoor.com", "welcometothejungle.com",
    # Social media (company pages, not editorial)
    "facebook.com", "instagram.com", "twitter.com", "x.com",
    "youtube.com", "tiktok.com", "pinterest.com",
    # Other SaaS / corporate
    "wordpress.com", "wordpress.org", "wix.com", "squarespace.com",
    "godaddy.com", "hostinger.com", "siteground.com",
    "tableau.com", "powerbi.com", "looker.com",
    "twilio.com", "sendgrid.com", "postmark.com",
    "datadog.com", "newrelic.com", "pagerduty.com",
    "atlassian.com", "jira.com", "confluence.com",
    "github.com", "gitlab.com", "bitbucket.org",
    # Fintech SaaS tools (not banks, but corporate)
    "moonflow.ai", "qonto.com", "pleo.io", "blog.pleo.io",
    "spendesk.com", "payhawk.com", "soldo.com",
    "banktrack.com", "fintonic.com",
    # Competitors' own sites (growth hacking agencies)
    "producthackers.com", "bloo.media", "inboundcycle.com",
    "flat101.es", "flat101.com",
    # Education platforms (not editorial — they sell courses)
    "emagister.com", "domestika.org", "udemy.com", "coursera.org",
    "isdi.education", "esic.edu",
    # Job / employer review sites
    "es.gowork.com", "gowork.com", "teamtailor.com",
    "welcomemytalent.com",
    # Affiliate networks / platforms
    "impact.com", "cj.com", "shareasale.com", "awin.com",
    "rakutenadvertising.com", "clickbank.com", "partnerstack.com",
    "postaffiliatepro.com", "accelerationpartners.com",
    # Growth / marketing SaaS tools
    "growthrocks.com", "growthtribe.io", "growthhackers.com",
    "influencity.com", "upfluence.com", "hypeauditor.com",
    "aspireiq.com", "clearbit.com", "apollo.io", "zoominfo.com",
    "jasper.ai", "copy.ai", "ladder.io",
    "relevanttraffic.es", "goodrebels.com",
    # Consulting / enterprise
    "accenture.com", "mckinsey.com", "deloitte.com",
    "bcg.com", "bain.com", "pwc.com", "ey.com", "kpmg.com",
    # Google / Meta / ads platforms
    "ads.google.com", "analytics.google.com",
    "business.facebook.com", "business.linkedin.com",
    "business.twitter.com",
}

# -----------------------------------------------------------------
# Banks, neobanks, fintech → auto-exclude for Monzo-style projects
# -----------------------------------------------------------------
BANK_NEOBANK_FINTECH_DOMAINS: set[str] = {
    # Spanish banks
    "bbva.es", "bbva.com", "caixabank.es", "caixabank.com",
    "bancosantander.es", "santander.com", "bankinter.com",
    "ing.es", "openbank.es", "sabadell.com", "unicaja.es",
    "abanca.com", "kutxabank.es", "ibercaja.es",
    # Neobanks
    "n26.com", "revolut.com", "wise.com", "bnext.es", "vivid.money",
    # Fintech
    "raisin.es", "inbestme.com", "indexacapital.com",
    "myinvestor.es", "trade-republic.com", "degiro.es",
    "pibank.es", "orange.es", "evo.es",
}


@dataclass
class RuleClassification:
    domain_type: str | None  # None if unknown
    accepts_sponsored: bool | None  # None if uncertain
    classified_by: str  # "known_list", "pattern", "unclassified"
    is_excluded_fintech: bool = False  # matches bank/neobank/fintech list


def classify_by_rules(domain: str) -> RuleClassification:
    """Classify a domain using known lists and URL patterns."""

    d = domain.lower().removeprefix("www.")

    # Check known lists
    if d in _KNOWN_EDITORIAL:
        return RuleClassification("editorial", True, "known_list")
    if d in _KNOWN_INSTITUTIONAL:
        return RuleClassification("institutional", False, "known_list")
    if d in _KNOWN_UGC:
        return RuleClassification("ugc", False, "known_list")
    if d in _KNOWN_AGGREGATOR:
        return RuleClassification("aggregator", False, "known_list")
    if d in _KNOWN_CORPORATE:
        return RuleClassification("corporate", False, "known_list")
    if d in BANK_NEOBANK_FINTECH_DOMAINS:
        return RuleClassification("competitor", False, "known_list", is_excluded_fintech=True)

    # Pattern-based heuristics
    if any(p in d for p in ("blog.", "revista.", "magazine.", "noticias.")):
        return RuleClassification("editorial", True, "pattern")
    if d.endswith(".gob.es") or d.endswith(".gov") or d.endswith(".edu"):
        return RuleClassification("institutional", False, "pattern")
    if any(p in d for p in ("foro.", "forum.", "comunidad.", "community.")):
        return RuleClassification("ugc", False, "pattern")
    if any(p in d for p in ("wikipedia.", "wikimedia.")):
        return RuleClassification("reference", False, "pattern")

    return RuleClassification(None, None, "unclassified")
