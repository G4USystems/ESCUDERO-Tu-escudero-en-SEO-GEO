"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  niches as nichesApi,
  projects as projectsApi,
  geo,
  seo,
  domains as domainsApi,
  type NicheDetail,
  type ProjectDetail,
  type AggregatedResult,
  type CitedDomain,
  type SerpQuery,
  type SerpResult,
} from "@/lib/api";
import {
  ArrowLeft,
  BarChart3,
  Globe,
  Search,
  Target,
  ExternalLink,
  Loader2,
  RefreshCw,
  Filter,
  Eye,
  EyeOff,
  Download,
  UserX,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Config ──────────────────────────────────────────────────────────
const contentTypeBadge: Record<string, { bg: string; text: string; label: string }> = {
  review:   { bg: "bg-blue-100",   text: "text-blue-700",   label: "Review" },
  ranking:  { bg: "bg-purple-100", text: "text-purple-700", label: "Ranking" },
  solution: { bg: "bg-green-100",  text: "text-green-700",  label: "Solution" },
  news:     { bg: "bg-yellow-100", text: "text-yellow-700", label: "News" },
  forum:    { bg: "bg-orange-100", text: "text-orange-700", label: "Forum" },
  other:    { bg: "bg-gray-100",   text: "text-gray-500",   label: "Other" },
};

const providerConfig: Record<string, { bg: string; text: string; label: string }> = {
  openai:     { bg: "bg-emerald-100", text: "text-emerald-700", label: "GPT-4o" },
  anthropic:  { bg: "bg-orange-100",  text: "text-orange-700",  label: "Claude" },
  gemini:     { bg: "bg-blue-100",    text: "text-blue-700",    label: "Gemini" },
  perplexity: { bg: "bg-purple-100",  text: "text-purple-700",  label: "Perplexity" },
};

// ── Domain Classification (mirrors backend rules_engine.py) ────────
// Each set maps to a domain_type. Order matters: first match wins.

const KNOWN_EDITORIAL = new Set([
  "finect.com", "helpmycash.com", "kelisto.es", "roams.es",
  "businessinsider.es", "emprendedores.es", "cincodias.elpais.com",
  "expansion.com", "eleconomista.es", "elpais.com", "lavanguardia.com",
  "abc.es", "elmundo.es", "20minutos.es", "xataka.com", "genbeta.com",
  "wwwhatsnew.com", "hipertextual.com", "elespanol.com", "vozpopuli.com",
  "bolsamania.com", "invertia.com", "marketingdirecto.com",
  "puromarketing.com", "reasonwhy.es", "directivosygerentes.es",
  "ecommerce-news.es", "modaes.es", "foodretail.es",
  "forbes.es", "wired.com", "techcrunch.com", "theverge.com",
  "javilinares.com", "sincomisiones.org", "economiatic.com",
  "coinscrapfinance.com", "adslzone.net", "elreferente.es",
  "finnovating.com", "estrategafinanciero.com", "economipedia.com",
  "ticbeat.com", "computing.es", "rrhhdigital.com",
  // Independent blogs / finance comparators (accept sponsored)
  "mytriplea.com", "finanzarel.com", "enriquearanzubia.es",
  "malditasconsultoras.com", "marioamelotti.com", "revuscore.com",
  "aden.org",
]);

const KNOWN_INSTITUTIONAL = new Set([
  "bde.es", "cnmv.es", "consumo.gob.es", "ine.es",
  "seg-social.es", "agenciatributaria.es", "boe.es",
  "clientebancario.bde.es",
]);

const KNOWN_UGC = new Set([
  "reddit.com", "quora.com", "rankia.com", "forobeta.com",
  "trustpilot.com", "es.trustpilot.com", "glassdoor.es",
  "forocoches.com", "mediavida.com", "burbuja.info",
  "foropuros.com", "rinconpipa.foroactivo.com",
  "pipasytabaco.es", "estancocasafuster.es", "pipaclubfumadashobbit.com",
]);

const KNOWN_AGGREGATOR = new Set([
  "similarweb.com", "semrush.com", "ahrefs.com", "moz.com",
  "builtwith.com", "crunchbase.com", "linkedin.com", "es.linkedin.com",
  "producthunt.com", "g2.com", "capterra.es",
]);

const KNOWN_CORPORATE = new Set([
  // CRM / Sales / Marketing SaaS
  "salesforce.com", "hubspot.com", "hubspot.es", "mailchimp.com",
  "activecampaign.com", "getresponse.com", "sendinblue.com", "brevo.com",
  "zoho.com", "pipedrive.com", "freshworks.com", "intercom.com",
  "zendesk.com", "drift.com", "hootsuite.com", "buffer.com",
  "sproutsocial.com", "canva.com", "figma.com",
  "notion.so", "slack.com", "asana.com", "monday.com", "trello.com",
  "clickup.com", "zapier.com", "make.com", "typeform.com", "calendly.com",
  // Analytics / SEO tools
  "google.com", "analytics.google.com", "hotjar.com", "mixpanel.com",
  "amplitude.com", "segment.com", "optimizely.com",
  // Cloud / infra
  "aws.amazon.com", "azure.microsoft.com", "cloud.google.com",
  "digitalocean.com", "heroku.com", "vercel.com", "netlify.com",
  // E-commerce platforms
  "shopify.com", "stripe.com", "paypal.com", "prestashop.com",
  // HR / recruiting
  "indeed.com", "es.indeed.com", "infojobs.net",
  "glassdoor.com", "welcometothejungle.com",
  // Social media
  "facebook.com", "instagram.com", "twitter.com", "x.com",
  "youtube.com", "tiktok.com", "pinterest.com",
  // Other SaaS
  "wordpress.com", "wordpress.org", "wix.com", "squarespace.com",
  "godaddy.com", "hostinger.com", "siteground.com",
  "github.com", "gitlab.com", "bitbucket.org",
  // Fintech SaaS tools (not banks, but corporate)
  "moonflow.ai", "qonto.com", "pleo.io", "blog.pleo.io",
  "spendesk.com", "payhawk.com", "soldo.com",
  "banktrack.com", "fintonic.com",
  // Competitors' own sites (growth hacking agencies)
  "producthackers.com", "bloo.media", "inboundcycle.com",
  "flat101.es", "flat101.com",
  // Education platforms
  "emagister.com", "domestika.org", "udemy.com", "coursera.org",
  "isdi.education", "esic.edu",
  // Job / employer review
  "es.gowork.com", "gowork.com", "teamtailor.com", "welcomemytalent.com",
  // Affiliate networks
  "impact.com", "cj.com", "shareasale.com", "awin.com",
  "rakutenadvertising.com", "clickbank.com", "partnerstack.com",
  "postaffiliatepro.com", "accelerationpartners.com",
  // Growth / marketing SaaS
  "growthrocks.com", "growthtribe.io", "growthhackers.com",
  "influencity.com", "upfluence.com", "hypeauditor.com",
  "aspireiq.com", "clearbit.com", "apollo.io", "zoominfo.com",
  "jasper.ai", "copy.ai", "ladder.io",
  "relevanttraffic.es", "goodrebels.com",
  // Consulting / enterprise
  "accenture.com", "mckinsey.com", "deloitte.com",
  "bcg.com", "bain.com", "pwc.com", "ey.com", "kpmg.com",
  // Google / Meta / ads
  "ads.google.com", "business.facebook.com", "business.linkedin.com",
  "business.twitter.com",
  // Client's own site
  "growth4u.io", "growth4u.org",
]);

const BANK_NEOBANK_FINTECH = new Set([
  // Spanish banks
  "bbva.es", "bbva.com", "caixabank.es", "caixabank.com",
  "bancosantander.es", "santander.com", "bankinter.com",
  "ing.es", "openbank.es", "sabadell.com", "bancsabadell.com",
  "unicaja.es", "unicajabanco.es", "abanca.com", "kutxabank.es", "ibercaja.es",
  // Neobanks
  "n26.com", "revolut.com", "wise.com", "bnext.es", "vivid.money",
  // Fintech
  "raisin.es", "inbestme.com", "indexacapital.com",
  "myinvestor.es", "trade-republic.com", "degiro.es",
  "pibank.es", "orange.es", "evo.es",
]);

type DomainType = "editorial" | "banco" | "empresa" | "ugc" | "institucional" | "agregador" | "desconocido";

const DOMAIN_TYPE_STYLES: Record<DomainType, { bg: string; text: string; label: string }> = {
  editorial:     { bg: "bg-green-100",  text: "text-green-700",  label: "Editorial" },
  banco:         { bg: "bg-red-100",    text: "text-red-700",    label: "Banco/Fintech" },
  empresa:       { bg: "bg-orange-100", text: "text-orange-700", label: "Empresa" },
  ugc:           { bg: "bg-yellow-100", text: "text-yellow-700", label: "UGC/Foro" },
  institucional: { bg: "bg-slate-100",  text: "text-slate-600",  label: "Institucional" },
  agregador:     { bg: "bg-purple-100", text: "text-purple-600", label: "Agregador" },
  desconocido:   { bg: "bg-gray-50",    text: "text-gray-400",   label: "—" },
};

/** Map backend domain_type values to our display types. */
const BACKEND_TYPE_MAP: Record<string, DomainType> = {
  editorial: "editorial",
  corporate: "empresa",
  competitor: "banco",
  ugc: "ugc",
  institutional: "institucional",
  reference: "institucional",
  aggregator: "agregador",
};

/** Classify a domain using known lists + pattern heuristics (mirrors backend). */
function classifyDomainLocal(rawDomain: string): DomainType {
  const d = rawDomain.replace(/^www\./, "").toLowerCase();

  // Exact match first
  if (KNOWN_EDITORIAL.has(d)) return "editorial";
  if (KNOWN_INSTITUTIONAL.has(d)) return "institucional";
  if (KNOWN_UGC.has(d)) return "ugc";
  if (KNOWN_AGGREGATOR.has(d)) return "agregador";
  if (KNOWN_CORPORATE.has(d)) return "empresa";
  if (BANK_NEOBANK_FINTECH.has(d)) return "banco";

  // Subdomain match: "ecosystem.hubspot.com" → check "hubspot.com"
  const parts = d.split(".");
  if (parts.length > 2) {
    const parent = parts.slice(-2).join(".");
    if (KNOWN_EDITORIAL.has(parent)) return "editorial";
    if (KNOWN_INSTITUTIONAL.has(parent)) return "institucional";
    if (KNOWN_UGC.has(parent)) return "ugc";
    if (KNOWN_AGGREGATOR.has(parent)) return "agregador";
    if (KNOWN_CORPORATE.has(parent)) return "empresa";
    if (BANK_NEOBANK_FINTECH.has(parent)) return "banco";
  }

  // Pattern heuristics
  if (d.endsWith(".gob.es") || d.endsWith(".gov") || d.endsWith(".edu")) return "institucional";
  if (/\b(foro|forum|comunidad|community)\b/.test(d)) return "ugc";
  if (/\b(wikipedia|wikimedia)\b/.test(d)) return "institucional";
  if (/\b(blog\.|revista\.|magazine\.|noticias\.)\b/.test(d)) return "editorial";
  if (/\b(banco|bank)\b/.test(d)) return "banco";

  return "desconocido";
}

/**
 * Classify a domain: known sets take priority over backend LLM
 * (prevents hubspot.com, salesforce.com, etc. from being misclassified as "editorial").
 * Backend batchMap is used only as fallback for truly unknown domains.
 */
function classifyDomain(
  rawDomain: string,
  batchMap?: Map<string, { domain_type: string | null; accepts_sponsored: boolean | null }>,
): DomainType {
  const d = rawDomain.replace(/^www\./, "").toLowerCase();

  // 1. Local known sets are definitive — override backend LLM for known domains
  const localResult = classifyDomainLocal(d);
  if (localResult !== "desconocido") return localResult;

  // 2. For truly unknown domains, use batchMap (includes LLM classification)
  if (batchMap) {
    const cached = batchMap.get(d);
    if (cached?.domain_type) {
      return BACKEND_TYPE_MAP[cached.domain_type] || "desconocido";
    }
  }

  return "desconocido";
}

/** Is this an editorial/media site where the client could place content? */
function isEditorialCandidate(
  domain: string,
  domainType?: string | null,
  batchMap?: Map<string, { domain_type: string | null; accepts_sponsored: boolean | null }>,
): boolean {
  // If backend already classified it
  if (domainType === "corporate" || domainType === "competitor") return false;

  const dt = classifyDomain(domain, batchMap);
  return dt === "editorial" || dt === "desconocido";
  // "desconocido" passes because it MIGHT be editorial — we show it with "—" type
}

function shortName(domain: string): string {
  const d = domain.replace(/^www\./, "");
  const parts = d.split(".");
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

/** Convert a domain to a brand name: "flake-agency.com" → "Flake Agency" */
function domainToName(domain: string): string {
  const base = domain.replace(/^www\./, "").replace(/\.[^.]+$/, "");
  return base.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── Sancho loading screen ────────────────────────────────────────────
const SANCHO_QUOTES = [
  { text: "Paciencia y barajar.", source: "Sancho Panza, II parte, cap. XXIV" },
  { text: "La diligencia es madre de la buena ventura.", source: "Sancho Panza, I parte, cap. XLVI" },
  { text: "No hay camino que no se acabe, como no se le oponga la pereza.", source: "Sancho Panza, II parte, cap. XXXIII" },
  { text: "El que larga vida vive, mucho mal ha de pasar.", source: "Sancho Panza, II parte, cap. XXXII" },
  { text: "Mientras se duerme, todos somos iguales.", source: "Sancho Panza, II parte, cap. XLIII" },
  { text: "Analizando los datos del campo de batalla digital...", source: "Sancho CMO, siempre en guardia" },
  { text: "Escrutando los SERPs como molinos de viento...", source: "Sancho CMO, con lanza en ristre" },
  { text: "Consultando a los cuatro LLMs del horizonte...", source: "Sancho CMO, voz de la razón" },
];

function SanchoLoading() {
  const [quoteIdx, setQuoteIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setQuoteIdx((i) => (i + 1) % SANCHO_QUOTES.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const quote = SANCHO_QUOTES[quoteIdx];

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-comic-rust" />
        <span className="text-sm font-bold text-comic-ink">Cargando resultados...</span>
      </div>
      <div className="max-w-sm rounded-sm border-2 border-comic-ink bg-comic-paper px-5 py-4 shadow-comic-xs text-center">
        <p className="text-sm font-bold italic text-comic-ink leading-relaxed">
          &ldquo;{quote.text}&rdquo;
        </p>
        <p className="mt-2 text-[11px] text-comic-ink-soft">{quote.source}</p>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────
export default function ResultsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const slug = params.slug as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [niche, setNiche] = useState<NicheDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Data
  const [geoMetrics, setGeoMetrics] = useState<AggregatedResult | null>(null);
  const [queries, setQueries] = useState<SerpQuery[]>([]);
  const [serpResults, setSerpResults] = useState<SerpResult[]>([]);
  const [serpLoading, setSerpLoading] = useState(false);
  const [domainTypeMap, setDomainTypeMap] = useState<Map<string, { domain_type: string | null; accepts_sponsored: boolean | null }>>(new Map());
  const [validUrls, setValidUrls] = useState<Set<string>>(new Set());

  // Filters
  const [contentFilter, setContentFilter] = useState<string>("all");
  const [showAll, setShowAll] = useState(false); // false = only editorial candidates

  // Tab
  const [activeTab, setActiveTab] = useState<"geo" | "seo" | "competitors" | "opportunities">("seo");

  // Opportunities selection
  const [selectedOpportunities, setSelectedOpportunities] = useState<Set<string>>(new Set());

  // Inline domain type overrides (for "desconocido" entries user classifies manually)
  const [localDomainTypeOverrides, setLocalDomainTypeOverrides] = useState<Record<string, DomainType>>({});

  // Competitor management: domains added as competitors in this session
  const [addedCompetitorDomains, setAddedCompetitorDomains] = useState<Set<string>>(new Set());
  const [addingCompetitorDomain, setAddingCompetitorDomain] = useState<string | null>(null);

  const addCompetitorToDB = useCallback(async (domain: string) => {
    setAddingCompetitorDomain(domain);
    try {
      const name = domainToName(domain);
      const brand = await projectsApi.createBrand(projectId, { name, domain, is_client: false });
      await nichesApi.addCompetitor(projectId, slug, brand.id);
      setAddedCompetitorDomains((prev) => new Set([...Array.from(prev), domain]));
    } catch (e) {
      console.error("Failed to add competitor:", e);
    } finally {
      setAddingCompetitorDomain(null);
    }
  }, [projectId, slug]);

  const loadData = useCallback(async () => {
    try {
      const nicheData = await nichesApi.get(projectId, slug);
      const [proj, runs, serpQueries] = await Promise.all([
        projectsApi.get(projectId),
        geo.listRuns(projectId, nicheData.id),
        seo.listQueries(projectId, slug),
      ]);
      setProject(proj);
      setNiche(nicheData);
      setQueries(serpQueries);

      let loadedMetrics: AggregatedResult | null = null;
      const completedRuns = runs.filter((r) => r.status === "completed");
      if (completedRuns.length > 0) {
        try {
          loadedMetrics = await geo.getMetrics(completedRuns[0].id);
          setGeoMetrics(loadedMetrics);
        } catch { /* metrics not ready */ }
      }

      // Load all SERP results in chunks
      const allSerpResults: SerpResult[] = [];
      const fetchedQueries = serpQueries.filter((q) => q.last_fetched_at);
      if (fetchedQueries.length > 0) {
        setSerpLoading(true);
        try {
          const chunkSize = 10;
          for (let i = 0; i < fetchedQueries.length; i += chunkSize) {
            const chunk = fetchedQueries.slice(i, i + chunkSize);
            const results = await Promise.all(chunk.map((q) => seo.getResults(q.id)));
            allSerpResults.push(...results.flatMap((r) => r.results ?? []));
          }
          setSerpResults(allSerpResults);
        } catch { /* */ } finally {
          setSerpLoading(false);
        }
      }

      // Batch-classify all unique domains for proper editorial/empresa labels
      const allDomains = new Set<string>();
      if (loadedMetrics) {
        for (const d of loadedMetrics.top_cited_domains) {
          if (d.domain) allDomains.add(d.domain.replace(/^www\./, "").toLowerCase());
        }
      }
      for (const r of allSerpResults) {
        if (r.domain) allDomains.add(r.domain.replace(/^www\./, "").toLowerCase());
      }
      if (allDomains.size > 0) {
        try {
          const classified = await domainsApi.batchClassify(Array.from(allDomains));
          const map = new Map<string, { domain_type: string | null; accepts_sponsored: boolean | null }>();
          for (const c of classified) {
            map.set(c.domain, { domain_type: c.domain_type, accepts_sponsored: c.accepts_sponsored });
          }
          setDomainTypeMap(map);
        } catch { /* batch classify not critical */ }
      }

      // Validate GEO-cited article URLs (filter out LLM hallucinations)
      if (loadedMetrics) {
        const articleUrls: string[] = [];
        for (const d of loadedMetrics.top_cited_domains) {
          for (const u of d.urls ?? []) {
            try {
              const parsed = new URL(u);
              if (parsed.pathname.split("/").filter(Boolean).length >= 1) {
                articleUrls.push(u);
              }
            } catch { /* skip malformed */ }
          }
        }
        if (articleUrls.length > 0) {
          try {
            const { valid } = await geo.validateUrls(articleUrls);
            setValidUrls(new Set(valid));
          } catch { /* validation not critical */ }
        }
      }

    } catch (e) {
      console.error("Failed to load results:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, slug]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived data ──────────────────────────────────────────────────

  // Combined competitor domain set: from niche data + locally added this session
  const competitorDomainSet = useMemo(() => {
    const set = new Set<string>(
      (niche?.competitors ?? [])
        .map((b) => b.domain?.replace(/^www\./, "").toLowerCase())
        .filter((d): d is string => !!d)
    );
    for (const d of Array.from(addedCompetitorDomains)) {
      set.add(d);
    }
    return set;
  }, [niche, addedCompetitorDomains]);

  // GEO: filtered to editorial candidates only (no SaaS, no competitors)
  const geoEditorialSites = useMemo(() => {
    if (!geoMetrics) return [];
    return geoMetrics.top_cited_domains
      .filter((d: CitedDomain) => {
        if (!showAll && d.is_excluded) return false;
        if (!showAll && !isEditorialCandidate(d.domain, d.domain_type, domainTypeMap)) return false;
        if (!showAll && competitorDomainSet.has(d.domain.replace(/^www\./, "").toLowerCase())) return false;
        if (contentFilter !== "all" && d.content_type !== contentFilter) return false;
        return true;
      });
  }, [geoMetrics, showAll, contentFilter, domainTypeMap, competitorDomainSet]);

  // SEO: deduplicated by domain, filtered to editorial only, with titles
  const seoEditorialSites = useMemo(() => {
    const domainMap = new Map<string, {
      domain: string;
      results: SerpResult[];
      bestPosition: number;
      bestTitle: string;
      contentTypes: Set<string>;
    }>();

    for (const r of serpResults) {
      const d = (r.domain || "").replace(/^www\./, "").toLowerCase();
      if (!d) continue;
      // Skip corporate/SaaS/competitor sites
      if (!showAll && !isEditorialCandidate(d, null, domainTypeMap)) continue;
      if (!showAll && competitorDomainSet.has(d)) continue;

      const existing = domainMap.get(d);
      if (existing) {
        existing.results.push(r);
        if (r.position < existing.bestPosition) {
          existing.bestPosition = r.position;
          if (r.title) existing.bestTitle = r.title;
        }
        if (r.content_type) existing.contentTypes.add(r.content_type);
      } else {
        domainMap.set(d, {
          domain: d,
          results: [r],
          bestPosition: r.position,
          bestTitle: r.title || "",
          contentTypes: new Set(r.content_type ? [r.content_type] : []),
        });
      }
    }

    let sites = Array.from(domainMap.values());

    // Filter by content type
    if (contentFilter !== "all") {
      sites = sites.filter((s) => s.contentTypes.has(contentFilter));
    }

    return sites.sort((a, b) => b.results.length - a.results.length);
  }, [serpResults, showAll, contentFilter, domainTypeMap, competitorDomainSet]);

  // Opportunities: cross-reference GEO + SEO editorial domains
  const opportunities = useMemo(() => {
    // Domains to exclude: client's own brand + niche competitors
    const clientDomains = new Set(
      (project?.brands ?? [])
        .filter((b) => b.is_client)
        .map((b) => b.domain?.replace(/^www\./, "").toLowerCase())
        .filter(Boolean) as string[]
    );
    const competitorDomains = new Set(
      (niche?.competitors ?? [])
        .map((b) => b.domain?.replace(/^www\./, "").toLowerCase())
        .filter(Boolean) as string[]
    );

    const geoDomainsMap = new Map<string, CitedDomain>();
    if (geoMetrics) {
      for (const d of geoMetrics.top_cited_domains) {
        const norm = d.domain.replace(/^www\./, "").toLowerCase();
        if (clientDomains.has(norm)) continue; // skip client's own domain
        if (isEditorialCandidate(d.domain, d.domain_type, domainTypeMap) && !d.is_excluded) {
          geoDomainsMap.set(norm, d);
        }
      }
    }
    const seoDomainsMap = new Map<string, typeof seoEditorialSites[0]>();
    for (const s of seoEditorialSites) {
      if (!clientDomains.has(s.domain)) {
        seoDomainsMap.set(s.domain, s);
      }
    }
    const allDomains = new Set([...Array.from(geoDomainsMap.keys()), ...Array.from(seoDomainsMap.keys())]);
    return Array.from(allDomains).map((domain) => {
      const geoData = geoDomainsMap.get(domain);
      const seoData = seoDomainsMap.get(domain);
      const inBoth = !!geoData && !!seoData;
      return {
        domain,
        inGeo: !!geoData,
        inSeo: !!seoData,
        inBoth,
        geoCitations: geoData?.count ?? 0,
        geoProviders: geoData?.providers ?? [],
        seoAppearances: seoData?.results.length ?? 0,
        bestSeoPosition: seoData?.bestPosition ?? 999,
        bestTitle: seoData?.bestTitle || geoData?.title || "",
        bestUrl: seoData?.results[0]?.url || (
          // Only use GEO article URLs that passed validation
          geoData?.urls.find(u => {
            try { return new URL(u).pathname.split("/").filter(Boolean).length >= 1 && validUrls.has(u); }
            catch { return false; }
          }) ?? ""
        ),
        contentType: geoData?.content_type || (seoData?.results[0]?.content_type ?? "other"),
        isCompetitor: competitorDomains.has(domain),
        domainType: classifyDomain(domain, domainTypeMap),
      };
    }).sort((a, b) => {
      if (a.inBoth !== b.inBoth) return a.inBoth ? -1 : 1;
      return (b.geoCitations + b.seoAppearances) - (a.geoCitations + a.seoAppearances);
    });
  }, [geoMetrics, seoEditorialSites, domainTypeMap, validUrls, project, niche]);

  const exportOpportunitiesCsv = useCallback(() => {
    const toExport = opportunities.filter((o) =>
      selectedOpportunities.size === 0 || selectedOpportunities.has(o.domain)
    );
    const header = ["Nombre", "Dominio", "Type", "URL", "Canal", "Citas GEO", "Apariciones SEO", "Mejor Pos. SEO"];
    const rows = toExport.map((o) => {
      const canal = o.inBoth ? "GEO + SEO" : o.inGeo ? "Solo GEO" : "Solo SEO";
      const pos = o.inSeo ? `#${o.bestSeoPosition}` : "—";
      return [
        o.bestTitle ? o.bestTitle.replace(/"/g, '""') : shortName(o.domain),
        o.domain,
        o.contentType,
        o.bestUrl || `https://${o.domain}`,
        canal,
        o.inGeo ? String(o.geoCitations) : "—",
        o.inSeo ? String(o.seoAppearances) : "—",
        pos,
      ].map((v) => `"${v}"`).join(",");
    });
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oportunidades-${slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [opportunities, selectedOpportunities, slug]);

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return <SanchoLoading />;
  }

  if (!project || !niche) {
    return <div className="py-8 text-center text-muted-foreground">No encontrado.</div>;
  }

  const hasGeo = geoMetrics !== null;
  const hasSeo = serpResults.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/projects/${projectId}/niches/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a {niche.name}
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Medios donde entrar — &quot;{niche.name}&quot;
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sitios editoriales donde posicionar tu marca. Solo medios independientes que aceptan contenido.
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); loadData(); }}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          Actualizar
        </button>
      </div>

      {/* Global filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={contentFilter}
            onChange={(e) => setContentFilter(e.target.value)}
            className="rounded-md border px-2 py-1 text-xs"
          >
            <option value="all">Todos los tipos</option>
            <option value="review">Review</option>
            <option value="ranking">Ranking</option>
            <option value="solution">Solution</option>
          </select>
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          className={cn(
            "flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
            showAll ? "border-orange-300 text-orange-600" : "text-muted-foreground"
          )}
        >
          {showAll ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {showAll ? "Mostrando TODOS (incl. empresas)" : "Solo medios editoriales"}
        </button>
      </div>

      {!(hasGeo || hasSeo) && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            Aun no hay resultados. Ejecuta el analisis desde la{" "}
            <Link href={`/projects/${projectId}/niches/${slug}/analyze`} className="text-primary underline">
              Fase 4
            </Link>.
          </p>
        </div>
      )}

      {(hasGeo || hasSeo) && (
        <>
          {/* Tab nav */}
          <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
            {[
              { id: "seo" as const, label: "Google SERP", icon: Search, count: seoEditorialSites.length },
              { id: "geo" as const, label: "Citados por IAs", icon: Globe, count: geoEditorialSites.length },
              { id: "competitors" as const, label: "Visibilidad Marcas", icon: Target },
              { id: "opportunities" as const, label: "Oportunidades", icon: BarChart3, count: opportunities.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tab.id === "opportunities"
                    ? activeTab === "opportunities"
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-orange-600 border border-orange-300 hover:bg-orange-50"
                    : activeTab === tab.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={cn(
                    "ml-1 rounded-full px-1.5 py-0.5 text-[10px]",
                    tab.id === "opportunities"
                      ? activeTab === "opportunities" ? "bg-white/20 text-white" : "bg-orange-100 text-orange-700"
                      : "bg-muted"
                  )}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* ═══════════════════════════════════════════════════════════
              TAB: GEO — Medios citados por IAs (solo editoriales)
              ═══════════════════════════════════════════════════════════ */}
          {activeTab === "geo" && hasGeo && geoMetrics && (
            <section className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Medios que ChatGPT, Claude, Gemini y Perplexity citan al hablar de tu nicho.
                {!showAll && " Filtrado: solo medios editoriales independientes."}
              </p>

              {geoEditorialSites.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {showAll
                    ? "No hay dominios citados que coincidan con los filtros."
                    : "Ningun medio editorial entre los citados. Prueba \"Mostrando TODOS\" para ver todos los dominios, o revisa la pestaña SEO."}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2.5 text-left font-medium w-8">#</th>
                        <th className="px-3 py-2.5 text-left font-medium">Articulo / Titulo</th>
                        <th className="px-3 py-2.5 text-left font-medium">Medio (dominio)</th>
                        <th className="px-3 py-2.5 text-center font-medium">Type</th>
                        <th className="px-3 py-2.5 text-center font-medium">Citas</th>
                        <th className="px-3 py-2.5 text-center font-medium">Tipo Medio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geoEditorialSites.map((d: CitedDomain, i: number) => {
                        const ct = contentTypeBadge[d.content_type] || contentTypeBadge.other;
                        const normGeo = d.domain.replace(/^www\./, "").toLowerCase();
                        const isGeoComp = competitorDomainSet.has(normGeo);
                        const isAddingGeo = addingCompetitorDomain === normGeo;
                        const domType = classifyDomain(d.domain, domainTypeMap);
                        const dts = isGeoComp
                          ? { bg: "bg-red-100", text: "text-red-700", label: "Competidor" }
                          : DOMAIN_TYPE_STYLES[domType];
                        return (
                          <tr
                            key={d.domain}
                            className={cn(
                              "border-b hover:bg-muted/30",
                              isGeoComp && "opacity-50",
                              !isGeoComp && (domType === "banco" || domType === "empresa") && "opacity-40",
                              !isGeoComp && domType === "editorial" && "bg-green-50/40"
                            )}
                          >
                            <td className="px-3 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                            <td className="px-3 py-2.5">
                              {(() => {
                                // Only show article URLs that passed backend validation
                                const validArticleUrl = d.urls.find(u => {
                                  try {
                                    return new URL(u).pathname.split("/").filter(Boolean).length >= 1
                                      && validUrls.has(u);
                                  } catch { return false; }
                                });
                                // Fallback: domain root (always exists)
                                const domainRoot = (() => {
                                  const anyUrl = d.urls[0];
                                  try { const p = new URL(anyUrl); return `${p.protocol}//${p.hostname}`; }
                                  catch { return `https://${d.domain}`; }
                                })();
                                const displayUrl = validArticleUrl || domainRoot;
                                const displayLabel = validArticleUrl
                                  ? (d.title || validArticleUrl.replace(/^https?:\/\/(www\.)?/, "").split("?")[0].slice(0, 70))
                                  : d.domain;
                                // Count other valid article URLs beyond the first
                                const otherValid = d.urls.filter(u => {
                                  try {
                                    return u !== validArticleUrl
                                      && new URL(u).pathname.split("/").filter(Boolean).length >= 1
                                      && validUrls.has(u);
                                  } catch { return false; }
                                }).length;
                                return (
                                  <div>
                                    <a
                                      href={displayUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-start gap-1 text-primary hover:underline"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                      <span className="text-sm font-medium leading-tight">{displayLabel}</span>
                                    </a>
                                    {otherValid > 0 && (
                                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                                        +{otherValid} artículo{otherValid > 1 ? "s" : ""} más
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground text-xs">{d.domain}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn("rounded-full px-2 py-0.5 text-xs", ct.bg, ct.text)}>
                                {ct.label}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn(
                                "inline-flex h-6 min-w-[24px] items-center justify-center rounded-full text-xs font-semibold",
                                d.count >= 10 ? "bg-green-100 text-green-700" :
                                d.count >= 5 ? "bg-yellow-100 text-yellow-700" :
                                "bg-muted text-muted-foreground"
                              )}>
                                {d.count}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {isGeoComp ? (
                                <span className="rounded-full px-2 py-0.5 text-[10px] bg-red-100 text-red-700 font-medium">Competidor</span>
                              ) : isAddingGeo ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mx-auto" />
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <span className={cn("rounded-full px-2 py-0.5 text-[10px]", dts.bg, dts.text)}>{dts.label}</span>
                                  <button
                                    onClick={() => addCompetitorToDB(normGeo)}
                                    className="flex items-center gap-0.5 text-[10px] text-red-500 hover:text-red-700 hover:underline"
                                    title="Marcar como competidor"
                                  >
                                    <UserX className="h-2.5 w-2.5" />
                                    Competidor
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Mostrando: {geoEditorialSites.length}</span>
                <span>Total citados: {geoMetrics.top_cited_domains.length}</span>
                <span>Editorial: {geoMetrics.top_cited_domains.filter((d: CitedDomain) => d.domain_type === "editorial").length}</span>
                <span>Corporativo: {geoMetrics.top_cited_domains.filter((d: CitedDomain) => d.domain_type === "corporate").length}</span>
                <span>Excluidos: {geoMetrics.top_cited_domains.filter((d: CitedDomain) => d.is_excluded).length}</span>
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB: SEO — Google SERP (Monzo format: titulo + dominio + type)
              ═══════════════════════════════════════════════════════════ */}
          {activeTab === "seo" && (
            <section className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Articulos que aparecen en Google para tus keywords de nicho.
                {!showAll && " Filtrado: solo medios editoriales independientes (sin empresas, sin bancos)."}
              </p>

              {queries.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <Search className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No hay keywords SEO configuradas.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Anade keywords en la{" "}
                    <Link href={`/projects/${projectId}/niches/${slug}/configure`} className="text-primary underline">Fase 3</Link>.
                  </p>
                </div>
              ) : !hasSeo ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <Search className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {queries.length} keywords configuradas pero sin resultados SERP.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ejecuta el analisis SERP desde la{" "}
                    <Link href={`/projects/${projectId}/niches/${slug}/analyze`} className="text-primary underline">Fase 4</Link>.
                  </p>
                </div>
              ) : serpLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando resultados SERP...
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-2.5 text-left font-medium w-8">#</th>
                          <th className="px-3 py-2.5 text-left font-medium">Articulo</th>
                          <th className="px-3 py-2.5 text-left font-medium">Medio (dominio)</th>
                          <th className="px-3 py-2.5 text-center font-medium">Tipo Medio</th>
                          <th className="px-3 py-2.5 text-center font-medium">Type</th>
                          <th className="px-3 py-2.5 text-center font-medium">Apariciones</th>
                          <th className="px-3 py-2.5 text-center font-medium">Mejor Pos.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seoEditorialSites.map((site, i) => {
                          const bestResult = site.results.sort((a, b) => a.position - b.position)[0];
                          const mainType = bestResult.content_type ?? "other";
                          const ct = contentTypeBadge[mainType] || contentTypeBadge.other;
                          const isSeoComp = competitorDomainSet.has(site.domain);
                          const isAddingSeo = addingCompetitorDomain === site.domain;
                          const domType = classifyDomain(site.domain, domainTypeMap);
                          const dts = isSeoComp
                            ? { bg: "bg-red-100", text: "text-red-700", label: "Competidor" }
                            : DOMAIN_TYPE_STYLES[domType];
                          return (
                            <tr key={site.domain} className={cn(
                              "border-b hover:bg-muted/30",
                              isSeoComp && "opacity-50",
                              !isSeoComp && domType === "editorial" && "bg-green-50/40",
                              !isSeoComp && (domType === "banco" || domType === "empresa") && "opacity-40",
                            )}>
                              <td className="px-3 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                              <td className="px-3 py-2.5">
                                <a
                                  href={bestResult.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-start gap-1 text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                  <span className="text-sm font-medium leading-tight">
                                    {bestResult.title || bestResult.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70)}
                                  </span>
                                </a>
                                {site.results.length > 1 && (
                                  <div className="mt-1 ml-5 space-y-0.5">
                                    {site.results.slice(1, 3).map((r) => (
                                      <a
                                        key={r.id}
                                        href={r.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block text-[11px] text-muted-foreground hover:text-primary truncate max-w-[400px]"
                                      >
                                        {r.title?.slice(0, 65) || r.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 65)}
                                      </a>
                                    ))}
                                    {site.results.length > 3 && (
                                      <span className="text-[10px] text-muted-foreground">+{site.results.length - 3} mas</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground text-xs">{site.domain}</td>
                              <td className="px-3 py-2.5 text-center">
                                {isSeoComp ? (
                                  <span className="rounded-full px-2 py-0.5 text-[10px] bg-red-100 text-red-700 font-medium">Competidor</span>
                                ) : isAddingSeo ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mx-auto" />
                                ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    <span className={cn("rounded-full px-2 py-0.5 text-[10px]", dts.bg, dts.text)}>{dts.label}</span>
                                    <button
                                      onClick={() => addCompetitorToDB(site.domain)}
                                      className="flex items-center gap-0.5 text-[10px] text-red-500 hover:text-red-700 hover:underline"
                                      title="Marcar como competidor"
                                    >
                                      <UserX className="h-2.5 w-2.5" />
                                      Competidor
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={cn("rounded-full px-2 py-0.5 text-xs", ct.bg, ct.text)}>
                                  {ct.label}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={cn(
                                  "inline-flex h-6 min-w-[24px] items-center justify-center rounded-full text-xs font-semibold",
                                  site.results.length >= 5 ? "bg-green-100 text-green-700" :
                                  site.results.length >= 3 ? "bg-yellow-100 text-yellow-700" :
                                  "bg-muted text-muted-foreground"
                                )}>
                                  {site.results.length}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={cn(
                                  "font-semibold",
                                  site.bestPosition <= 3 ? "text-green-600" :
                                  site.bestPosition <= 10 ? "text-yellow-600" :
                                  "text-muted-foreground"
                                )}>
                                  #{site.bestPosition}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Medios: {seoEditorialSites.length}</span>
                    <span>Keywords buscadas: {queries.filter((q) => q.last_fetched_at).length}</span>
                    <span>Review: {serpResults.filter((r) => r.content_type === "review").length}</span>
                    <span>Ranking: {serpResults.filter((r) => r.content_type === "ranking").length}</span>
                    <span>Solution: {serpResults.filter((r) => r.content_type === "solution").length}</span>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB: Competitors — Brand visibility in AI responses
              ═══════════════════════════════════════════════════════════ */}
          {activeTab === "competitors" && hasGeo && geoMetrics && (
            <section className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Visibilidad de tus competidores en respuestas de IAs generativas.
              </p>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-2.5 text-left font-medium">Marca</th>
                      <th className="px-4 py-2.5 text-right font-medium">Visibilidad</th>
                      <th className="px-4 py-2.5 text-right font-medium">Menciones</th>
                      <th className="px-4 py-2.5 text-right font-medium">Pos. Media</th>
                      <th className="px-4 py-2.5 text-center font-medium">Sentiment</th>
                      {["openai", "anthropic", "gemini", "perplexity"].map((p) => (
                        <th key={p} className="px-3 py-2.5 text-center font-medium text-xs">
                          {providerConfig[p]?.label ?? p}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const sorted = [...geoMetrics.brands].sort((a, b) => b.visibility_pct - a.visibility_pct);
                      return sorted.map((brand) => {
                        const clientBrand = project.brands.find((b) => b.is_client);
                        const isClient = clientBrand?.name.toLowerCase() === brand.brand_name.toLowerCase();
                        const visPct = brand.visibility_pct;
                        return (
                          <tr key={brand.brand_name} className={cn("border-b", isClient && "bg-primary/5")}>
                            <td className="px-4 py-2.5 font-medium">
                              {brand.brand_name}
                              {isClient && (
                                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Tu marca</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={cn(
                                      "h-full rounded-full",
                                      visPct > 30 ? "bg-green-500" :
                                      visPct > 15 ? "bg-yellow-500" : "bg-red-400"
                                    )}
                                    style={{ width: `${visPct}%` }}
                                  />
                                </div>
                                <span className="font-semibold text-xs w-10 text-right">{visPct.toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right">{brand.mention_count}</td>
                            <td className="px-4 py-2.5 text-right">
                              {brand.avg_position !== null ? `#${brand.avg_position.toFixed(1)}` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={cn(
                                "rounded-full px-2 py-0.5 text-xs",
                                brand.sentiment_label === "positive" ? "bg-green-100 text-green-700" :
                                brand.sentiment_label === "negative" ? "bg-red-100 text-red-700" :
                                "bg-gray-100 text-gray-700"
                              )}>
                                {brand.sentiment_label}
                              </span>
                            </td>
                            {["openai", "anthropic", "gemini", "perplexity"].map((p) => {
                              const prov = brand.provider_breakdown?.[p];
                              if (!prov || prov.mention_count === 0) {
                                return <td key={p} className="px-3 py-2.5 text-center text-xs text-muted-foreground">—</td>;
                              }
                              return (
                                <td key={p} className="px-3 py-2.5 text-center text-xs">
                                  <span className="font-medium">{prov.visibility_pct.toFixed(0)}%</span>
                                  <span className="text-muted-foreground ml-1">({prov.mention_count})</span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB: Opportunities — Cross-reference GEO + SEO
              ═══════════════════════════════════════════════════════════ */}
          {activeTab === "opportunities" && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Medios editoriales citados por IAs Y/O encontrados en Google.
                  Prioridad: medios que aparecen en AMBOS canales.
                </p>
                {opportunities.length > 0 && (
                  <button
                    onClick={exportOpportunitiesCsv}
                    className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {selectedOpportunities.size > 0
                      ? `Exportar ${selectedOpportunities.size} seleccionadas`
                      : "Exportar todas"}
                  </button>
                )}
              </div>

              {opportunities.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Ejecuta analisis GEO y SEO para detectar oportunidades editoriales.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2.5 w-8">
                          <input
                            type="checkbox"
                            checked={selectedOpportunities.size === opportunities.length}
                            ref={(el) => {
                              if (el) el.indeterminate = selectedOpportunities.size > 0 && selectedOpportunities.size < opportunities.length;
                            }}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedOpportunities(new Set(opportunities.map((o) => o.domain)));
                              } else {
                                setSelectedOpportunities(new Set());
                              }
                            }}
                            className="cursor-pointer"
                          />
                        </th>
                        <th className="px-3 py-2.5 text-left font-medium w-8">#</th>
                        <th className="px-3 py-2.5 text-left font-medium">Articulo / Medio</th>
                        <th className="px-3 py-2.5 text-left font-medium">Dominio</th>
                        <th className="px-3 py-2.5 text-center font-medium">Artículo</th>
                        <th className="px-3 py-2.5 text-center font-medium">Tipo Medio</th>
                        <th className="px-3 py-2.5 text-center font-medium">GEO (IAs)</th>
                        <th className="px-3 py-2.5 text-center font-medium">SEO (Google)</th>
                        <th className="px-3 py-2.5 text-center font-medium">Canal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opportunities.map((opp, i) => {
                        const ct = contentTypeBadge[opp.contentType] || contentTypeBadge.other;
                        const isSelected = selectedOpportunities.has(opp.domain);
                        const isEffectiveCompetitor = opp.isCompetitor || addedCompetitorDomains.has(opp.domain);
                        const isAddingThis = addingCompetitorDomain === opp.domain;
                        const effectiveDomainType: DomainType = localDomainTypeOverrides[opp.domain] ?? opp.domainType;
                        const dts = isEffectiveCompetitor
                          ? { bg: "bg-red-100", text: "text-red-700", label: "Competidor" }
                          : DOMAIN_TYPE_STYLES[effectiveDomainType];
                        return (
                          <tr
                            key={opp.domain}
                            className={cn(
                              "border-b hover:bg-muted/30 cursor-pointer",
                              opp.inBoth && !isSelected && "bg-green-50/40",
                              isSelected && "bg-primary/5"
                            )}
                            onClick={() => {
                              setSelectedOpportunities((prev) => {
                                const next = new Set(prev);
                                if (next.has(opp.domain)) next.delete(opp.domain);
                                else next.add(opp.domain);
                                return next;
                              });
                            }}
                          >
                            <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedOpportunities((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(opp.domain)) next.delete(opp.domain);
                                    else next.add(opp.domain);
                                    return next;
                                  });
                                }}
                                className="cursor-pointer"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                            <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                              {opp.bestUrl ? (
                                <div>
                                  <a href={opp.bestUrl} target="_blank" rel="noopener noreferrer"
                                    className="flex items-start gap-1 text-primary hover:underline">
                                    <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span className="text-sm font-medium leading-tight">
                                      {opp.bestTitle || opp.bestUrl.replace(/^https?:\/\/(www\.)?/, "").split("?")[0].slice(0, 70)}
                                    </span>
                                  </a>
                                </div>
                              ) : (
                                <div>
                                  <span className="text-sm font-medium">{shortName(opp.domain)}</span>
                                  {opp.inGeo && (
                                    <div className="text-[10px] text-muted-foreground">Solo dominio citado por IA</div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground text-xs">{opp.domain}</td>
                            {/* Artículo column: content type (ranking/review/solution) */}
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn("rounded-full px-2 py-0.5 text-xs", ct.bg, ct.text)}>{ct.label}</span>
                            </td>
                            {/* Tipo Medio column: domain type + competitor action */}
                            <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                              {isEffectiveCompetitor ? (
                                <span className="rounded-full px-2 py-0.5 text-[10px] bg-red-100 text-red-700 font-medium">
                                  Competidor
                                </span>
                              ) : isAddingThis ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mx-auto" />
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  {effectiveDomainType === "desconocido" ? (
                                    <select
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          setLocalDomainTypeOverrides((prev) => ({ ...prev, [opp.domain]: e.target.value as DomainType }));
                                        }
                                      }}
                                      className="rounded border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-500 cursor-pointer hover:border-gray-400"
                                    >
                                      <option value="">— clasificar</option>
                                      <option value="editorial">Editorial</option>
                                      <option value="empresa">Empresa</option>
                                    </select>
                                  ) : (
                                    <span className={cn("rounded-full px-2 py-0.5 text-[10px]", dts.bg, dts.text)}>
                                      {dts.label}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => addCompetitorToDB(opp.domain)}
                                    className="flex items-center gap-0.5 text-[10px] text-red-500 hover:text-red-700 hover:underline"
                                    title="Marcar como competidor y añadir al nicho"
                                  >
                                    <UserX className="h-2.5 w-2.5" />
                                    Competidor
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {opp.inGeo ? (
                                <span className="font-semibold text-xs">{opp.geoCitations} citas</span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {opp.inSeo ? (
                                <div>
                                  <span className="font-semibold text-xs">{opp.seoAppearances}x</span>
                                  <span className={cn(
                                    "ml-1 text-xs",
                                    opp.bestSeoPosition <= 3 ? "text-green-600" :
                                    opp.bestSeoPosition <= 10 ? "text-yellow-600" : "text-muted-foreground"
                                  )}>
                                    (#{opp.bestSeoPosition})
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {opp.inBoth ? (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700 font-semibold">
                                  GEO + SEO
                                </span>
                              ) : opp.inGeo ? (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-600">Solo GEO</span>
                              ) : (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] text-orange-600">Solo SEO</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Total oportunidades: {opportunities.length}</span>
                {selectedOpportunities.size > 0 && (
                  <span className="text-primary font-medium">{selectedOpportunities.size} seleccionadas</span>
                )}
              </div>
            </section>
          )}

        </>
      )}
    </div>
  );
}
