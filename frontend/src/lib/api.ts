const API_BASE = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- Projects ---
export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  market: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  name: string;
  domain: string | null;
  is_client: boolean;
  aliases: string[] | null;
  company_type: string | null;
  service_description: string | null;
  target_market: string | null;
  about_summary: string | null;
  analyzed_at: string | null;
  created_at: string;
}

export interface ProjectDetail extends Project {
  brands: Brand[];
}

export const projects = {
  list: () => request<Project[]>("/projects"),
  get: (id: string) => request<ProjectDetail>(`/projects/${id}`),
  create: (data: { name: string; slug: string; description?: string; website?: string; market?: string; language?: string }) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; description?: string; website?: string; market?: string; language?: string }) =>
    request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }),
  // Brands
  createBrand: (projectId: string, data: { name: string; domain?: string; is_client?: boolean; aliases?: string[] }) =>
    request<Brand>(`/projects/${projectId}/brands`, { method: "POST", body: JSON.stringify(data) }),
  listBrands: (projectId: string) =>
    request<Brand[]>(`/projects/${projectId}/brands`),
  deleteBrand: (projectId: string, brandId: string) =>
    request<void>(`/projects/${projectId}/brands/${brandId}`, { method: "DELETE" }),
  analyzeBrand: (projectId: string, brandId: string) =>
    request<Brand>(`/projects/${projectId}/brands/${brandId}/analyze`, { method: "POST" }),
  describeWebsite: (url: string) =>
    request<{ description: string }>("/projects/describe-website", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
};

// --- Niches ---
export interface NicheBrief {
  A?: string; // Contexto de Marca
  B?: string; // Objetivos del nicho
  C?: string; // Audiencia target
  D?: string; // Mensajes clave
}

export interface Niche {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brief: NicheBrief | null;
  sort_order: number;
  competitor_count: number;
  created_at: string;
}

export interface NicheDetail extends Niche {
  competitors: Brand[];
}

export const niches = {
  list: (projectId: string) =>
    request<Niche[]>(`/projects/${projectId}/niches`),
  get: (projectId: string, slug: string) =>
    request<NicheDetail>(`/projects/${projectId}/niches/${slug}`),
  create: (projectId: string, data: { name: string; slug: string; description?: string; sort_order?: number }) =>
    request<Niche>(`/projects/${projectId}/niches`, { method: "POST", body: JSON.stringify(data) }),
  update: (projectId: string, slug: string, data: { name?: string; description?: string; brief?: NicheBrief; sort_order?: number }) =>
    request<Niche>(`/projects/${projectId}/niches/${slug}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (projectId: string, slug: string) =>
    request<void>(`/projects/${projectId}/niches/${slug}`, { method: "DELETE" }),
  // Competitors
  addCompetitor: (projectId: string, slug: string, brandId: string) =>
    request<NicheDetail>(`/projects/${projectId}/niches/${slug}/competitors`, {
      method: "POST", body: JSON.stringify({ brand_id: brandId }),
    }),
  listCompetitors: (projectId: string, slug: string) =>
    request<Brand[]>(`/projects/${projectId}/niches/${slug}/competitors`),
  removeCompetitor: (projectId: string, slug: string, brandId: string) =>
    request<void>(`/projects/${projectId}/niches/${slug}/competitors/${brandId}`, { method: "DELETE" }),
  generateBriefModule: (
    projectId: string,
    slug: string,
    moduleKey: "A" | "B" | "C" | "D",
    existingBrief?: NicheBrief,
  ) =>
    request<{ text: string }>(`/projects/${projectId}/niches/${slug}/brief/generate`, {
      method: "POST",
      body: JSON.stringify({ module_key: moduleKey, existing_brief: existingBrief ?? null }),
    }),
  suggestCompetitors: (projectId: string, slug: string) =>
    request<{
      suggestions: Array<{
        name: string;
        domain: string;
        description: string;
        rationale: string;
      }>;
    }>(`/projects/${projectId}/niches/${slug}/suggest-competitors`, { method: "POST" }),
};

// --- Prompts ---
export interface PromptTopic {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  prompt_count: number;
}

export interface Prompt {
  id: string;
  topic_id: string;
  niche_id: string | null;
  text: string;
  language: string;
  is_active: boolean;
  sort_order: number;
}

export const prompts = {
  topics: (projectId: string) =>
    request<PromptTopic[]>(`/projects/${projectId}/topics`),
  list: (projectId: string, nicheId?: string, topicId?: string) => {
    const params = new URLSearchParams();
    if (nicheId) params.set("niche_id", nicheId);
    if (topicId) params.set("topic_id", topicId);
    const qs = params.toString();
    return request<Prompt[]>(`/projects/${projectId}/prompts${qs ? `?${qs}` : ""}`);
  },
  createTopic: (projectId: string, data: { name: string; slug: string; description?: string; sort_order?: number }) =>
    request<PromptTopic>(`/projects/${projectId}/topics`, { method: "POST", body: JSON.stringify(data) }),
  create: (projectId: string, data: { topic_id: string; text: string; language?: string; is_active?: boolean; sort_order?: number; niche_id?: string }) =>
    request<Prompt>(`/projects/${projectId}/prompts`, { method: "POST", body: JSON.stringify(data) }),
  importBatch: (projectId: string, promptsData: { topic_id: string; text: string; language?: string; niche_id?: string }[]) =>
    request<{ imported: number }>(`/projects/${projectId}/prompts/import`, {
      method: "POST", body: JSON.stringify({ prompts: promptsData }),
    }),
  update: (projectId: string, promptId: string, text: string) =>
    request<Prompt>(`/projects/${projectId}/prompts/${promptId}`, {
      method: "PUT",
      body: JSON.stringify({ text }),
    }),
  delete: (projectId: string, promptId: string) =>
    request<void>(`/projects/${projectId}/prompts/${promptId}`, { method: "DELETE" }),
  deleteByNiche: (projectId: string, nicheId?: string) => {
    const qs = nicheId ? `?niche_id=${nicheId}` : "";
    return request<void>(`/projects/${projectId}/prompts/bulk${qs}`, { method: "DELETE" });
  },
};

// --- GEO ---
export interface GeoRun {
  id: string;
  project_id: string;
  niche_id: string | null;
  name: string | null;
  status: string;
  providers: string[];
  total_prompts: number;
  completed_prompts: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface JobStatus {
  id: string;
  job_type: string;
  status: string;
  progress: number;
  result: Record<string, unknown> | null;
  step_info: {
    current_keyword?: string;
    current_prompt?: string;
    current_provider?: string;
    step?: number;
    total?: number;
  } | null;
  error: string | null;
  created_at: string;
  run_id?: string | null;
}

export interface BrandMetrics {
  brand_name: string;
  visibility_pct: number;
  avg_position: number | null;
  avg_sentiment_score: number;
  sentiment_label: string;
  mention_count: number;
  recommendation_count: number;
  provider_breakdown: Record<string, ProviderStats>;
}

export interface ProviderStats {
  provider: string;
  mention_count: number;
  avg_position: number | null;
  avg_sentiment_score: number;
  visibility_pct: number;
}

export interface CitedDomain {
  domain: string;
  count: number;
  providers: string[];
  urls: string[];
  title: string | null;       // readable title extracted from URL path
  content_type: string;       // review, ranking, solution, news, forum, other
  domain_type: string | null; // editorial, corporate, ugc, competitor, institutional, aggregator
  accepts_sponsored: boolean | null;
  is_excluded: boolean;
}

export interface AggregatedResult {
  total_prompts: number;
  total_responses: number;
  brands: BrandMetrics[];
  top_cited_domains: CitedDomain[];
}

export const geo = {
  createRun: (projectId: string, nicheId?: string | null, providers?: string[]) =>
    request<JobStatus>("/geo/runs", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        niche_id: nicheId ?? null,
        providers: providers ?? ["openai", "anthropic", "gemini", "perplexity"],
      }),
    }),
  listRuns: (projectId: string, nicheId?: string | null) => {
    const qs = nicheId ? `&niche_id=${nicheId}` : "";
    return request<GeoRun[]>(`/geo/runs?project_id=${projectId}${qs}`);
  },
  getRun: (runId: string) => request<GeoRun>(`/geo/runs/${runId}`),
  getMetrics: (runId: string) =>
    request<AggregatedResult>(`/geo/runs/${runId}/metrics`),
  getJobStatus: (jobId: string) => request<JobStatus>(`/geo/jobs/${jobId}`),
  validateUrls: (urls: string[]) =>
    request<{ valid: string[] }>("/geo/validate-urls", {
      method: "POST",
      body: JSON.stringify({ urls }),
    }),
};

// --- SEO/SERP ---
export interface SerpQuery {
  id: string;
  project_id: string;
  keyword: string;
  language: string;
  location: string;
  niche: string | null;
  last_fetched_at: string | null;
  created_at: string;
}

export interface SerpResult {
  id: string;
  query_id: string;
  url: string;
  domain: string | null;
  title: string | null;
  snippet: string | null;
  position: number;
  result_type: string | null;
  fetched_at: string;
  content_type: string | null;
  content_confidence: number | null;
}

export interface SerpQueryWithResults extends SerpQuery {
  results: SerpResult[];
}

export const seo = {
  createQuery: (projectId: string, keyword: string, niche?: string) =>
    request<SerpQuery>("/seo/queries", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, keyword, niche }),
    }),
  createBatch: (projectId: string, keywords: string[], niche?: string) =>
    request<JobStatus>("/seo/queries/batch", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, keywords, niche }),
    }),
  listQueries: (projectId: string, niche?: string) => {
    const params = new URLSearchParams({ project_id: projectId });
    if (niche) params.set("niche", niche);
    return request<SerpQuery[]>(`/seo/queries?${params}`);
  },
  getResults: (queryId: string) =>
    request<SerpQueryWithResults>(`/seo/queries/${queryId}/results`),
  fetchResults: (queryId: string) =>
    request<JobStatus>(`/seo/fetch/${queryId}`, { method: "POST" }),
  fetchBatch: (projectId: string, queryIds: string[]) =>
    request<JobStatus>("/seo/refetch-batch", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, query_ids: queryIds }),
    }),
  updateQuery: (queryId: string, keyword: string) =>
    request<SerpQuery>(`/seo/queries/${queryId}`, {
      method: "PUT",
      body: JSON.stringify({ keyword }),
    }),
  deleteQuery: (queryId: string) =>
    request<void>(`/seo/queries/${queryId}`, { method: "DELETE" }),
};

// --- Domains ---
export interface DomainInfo {
  id: string;
  domain: string;
  display_name: string | null;
  domain_type: string | null;
  accepts_sponsored: boolean | null;
  monthly_traffic_estimate: number | null;
  domain_authority: number | null;
  country: string | null;
  notes: string | null;
  classified_by: string;
  created_at: string;
}

export interface ExclusionRule {
  id: string;
  project_id: string;
  rule_name: string;
  description: string | null;
  rule_type: string;
  rule_value: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export const domains = {
  list: (domainType?: string) => {
    const params = new URLSearchParams();
    if (domainType) params.set("domain_type", domainType);
    return request<DomainInfo[]>(`/domains?${params}`);
  },
  classify: (domain: string) =>
    request<{ domain: string; domain_type: string | null; accepts_sponsored: boolean | null; classified_by: string; is_excluded_fintech: boolean }>(
      "/domains/classify",
      { method: "POST", body: JSON.stringify({ domain }) },
    ),
  batchClassify: (domainList: string[], useLlm = true) =>
    request<{ domain: string; domain_type: string | null; accepts_sponsored: boolean | null; classified_by: string }[]>(
      "/domains/batch-classify",
      { method: "POST", body: JSON.stringify({ domains: domainList, use_llm_fallback: useLlm }) },
    ),
  listRules: (projectId: string) =>
    request<ExclusionRule[]>(`/domains/exclusion-rules?project_id=${projectId}`),
  createRule: (rule: { project_id: string; rule_name: string; rule_type: string; rule_value: Record<string, unknown>; description?: string }) =>
    request<ExclusionRule>("/domains/exclusion-rules", {
      method: "POST",
      body: JSON.stringify(rule),
    }),
  deleteRule: (ruleId: string) =>
    request<void>(`/domains/exclusion-rules/${ruleId}`, { method: "DELETE" }),
};

// --- Analysis ---
export interface GapAnalysis {
  id: string;
  project_id: string;
  geo_run_id: string | null;
  analysis_type: string;
  status: string;
  results: { total_urls_analyzed?: number; gaps_found?: number; briefs_generated?: number } | null;
  created_at: string;
  completed_at: string | null;
}

export interface GapItem {
  id: string;
  analysis_id: string;
  url: string;
  domain: string | null;
  competitor_brands: { brands?: string[] } | null;
  client_present: boolean;
  found_in_geo: boolean;
  found_in_serp: boolean;
  content_type: string | null;
  domain_type: string | null;
  opportunity_score: number | null;
  keyword: string | null;
  niche: string | null;
}

export interface ActionBrief {
  id: string;
  project_id: string;
  gap_item_id: string | null;
  target_url: string | null;
  target_domain: string | null;
  recommended_content_type: string | null;
  recommended_keyword: string | null;
  recommended_approach: string | null;
  priority: string;
  status: string;
  created_at: string;
}

// --- Key Opportunities ---
export interface KeyOpportunity {
  domain: string;
  display_name: string | null;
  domain_type: string | null;
  accepts_sponsored: boolean | null;

  // Dimension scores (0-100)
  seo_score: number;
  geo_score: number;
  backlink_score: number;
  content_gap_score: number;
  competitive_density: number;

  // Final score
  key_opportunity_score: number;

  // Classification
  priority: string; // critical, high, medium, low
  estimated_20x_potential: boolean;

  // Context
  competitor_brands: string[];
  content_types: string[];
  keywords: string[];
  top_urls: string[];
  niches: string[];
  geo_providers: string[];

  // Actions
  recommended_actions: string[];

  // Domain metrics
  domain_authority: number | null;
  monthly_traffic: number | null;
}

export const analysis = {
  createGapAnalysis: (projectId: string, geoRunId?: string, nicheId?: string, nicheSlug?: string) =>
    request<JobStatus>("/analysis/gaps", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        geo_run_id: geoRunId,
        niche_id: nicheId,
        niche_slug: nicheSlug,
      }),
    }),
  listGapAnalyses: (projectId: string) =>
    request<GapAnalysis[]>(`/analysis/gaps?project_id=${projectId}`),
  getGapItems: (analysisId: string, minScore = 0) =>
    request<GapItem[]>(`/analysis/gaps/${analysisId}/items?min_score=${minScore}`),
  listBriefs: (projectId: string, priority?: string) => {
    const params = new URLSearchParams({ project_id: projectId });
    if (priority) params.set("priority", priority);
    return request<ActionBrief[]>(`/analysis/briefs?${params}`);
  },
  updateBriefStatus: (briefId: string, status: string) =>
    request<ActionBrief>(`/analysis/briefs/${briefId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  // Key Opportunities
  getKeyOpportunities: (projectId: string, minScore = 0, priority?: string) => {
    const params = new URLSearchParams({ project_id: projectId });
    if (minScore > 0) params.set("min_score", String(minScore));
    if (priority) params.set("priority", priority);
    return request<KeyOpportunity[]>(`/analysis/key-opportunities?${params}`);
  },
};

// --- Influencers ---
export interface InfluencerResult {
  id: string;
  platform: "youtube" | "instagram";
  handle: string | null;
  display_name: string | null;
  profile_url: string;
  subscribers: number | null;
  snippet: string | null;
  recommendation_reason: string | null;
  relevance_score: number | null;
  search_query: string | null;
  created_at: string;
}

export const influencers = {
  search: (projectId: string, nicheId?: string | null, nicheSlug?: string, platforms = ["youtube", "instagram"]) =>
    request<JobStatus>("/influencers/search", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        niche_id: nicheId,
        niche_slug: nicheSlug,
        platforms,
        num_results: 25,
      }),
    }),
  listResults: (projectId: string, nicheSlug?: string, platform?: string) => {
    const params = new URLSearchParams({ project_id: projectId });
    if (nicheSlug) params.set("niche_slug", nicheSlug);
    if (platform) params.set("platform", platform);
    return request<InfluencerResult[]>(`/influencers/results?${params}`);
  },
};

// --- Content (Block B: Dominar SEO) ---
export interface ContentBriefItem {
  id: string;
  project_id: string;
  niche: string;
  keyword: string;
  category: string;
  source: string;
  opportunity_score: number | null;
  competitor_coverage: Record<string, number> | null;
  prompt_text: string | null;
  title: string | null;
  outline: { sections: Array<{ h2: string; points: string[]; keyword_hint: string }> } | null;
  meta_description: string | null;
  target_word_count: number | null;
  target_domain: string | null;
  target_domain_rationale: string | null;
  provider: string | null;
  model_used: string | null;
  tokens_used: number | null;
  status: string;
  created_at: string;
  recommendation_type: "keyword" | "prompt";
  geo_prompt_id?: string;
  suggested_skill?: string;
  skill_context?: string;
  buyer_stage?: string;
  generated_content?: string;
  search_volume?: number | null;
  cpc?: number | null;
  ev?: number | null;
  kd?: number | null;
  competitor_position?: number | null;
}

export interface KeywordSuggestion {
  keyword: string;
  category: string;
  rationale: string;
  source: string;
  volume?: number | null;
  cpc?: number | null;
}

export const content = {
  recommend: (projectId: string, niche: string) =>
    request<{ keywords: number; prompts: number; total: number }>("/content/recommend", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, niche }),
    }),
  listBriefs: (projectId: string, niche?: string, status?: string, category?: string, recommendationType?: string) => {
    const params = new URLSearchParams({ project_id: projectId });
    if (niche) params.set("niche", niche);
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (recommendationType) params.set("recommendation_type", recommendationType);
    return request<ContentBriefItem[]>(`/content/briefs?${params}`);
  },
  getBrief: (briefId: string) =>
    request<ContentBriefItem>(`/content/briefs/${briefId}`),
  updateBrief: (briefId: string, data: Partial<{ status: string; keyword: string; category: string; title: string; target_domain: string; generated_content: string }>) =>
    request<ContentBriefItem>(`/content/briefs/${briefId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteBrief: (briefId: string) =>
    request<void>(`/content/briefs/${briefId}`, { method: "DELETE" }),
  addManual: (projectId: string, data: { niche: string; keyword: string; category?: string }) =>
    request<ContentBriefItem>(`/content/briefs/add?project_id=${projectId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  generateArticle: (briefId: string) =>
    request<ContentBriefItem>(`/content/briefs/${briefId}/generate-article`, {
      method: "POST",
    }),
  suggestKeywords: (projectId: string, niche: string, count = 20) =>
    request<KeywordSuggestion[]>("/content/suggest-keywords", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, niche, count }),
    }),
};

// --- Brief ---
export interface SeoGap {
  keyword: string;
  top_competitor: string;
  competitor_position: number;
}

export interface GeoGap {
  prompt_text: string;
  competitors_mentioned: string[];
}

export interface BriefData {
  project_name: string;
  niche_name: string;
  client_name: string;
  generated_at: string;
  seo_gaps: SeoGap[];
  geo_gaps: GeoGap[];
  client_seo_keywords: number;
  total_seo_keywords: number;
  client_geo_prompts: number;
  total_geo_prompts: number;
  narrative: string;
}

export const brief = {
  get: (projectId: string, nicheSlug: string) =>
    request<BriefData>(`/projects/${projectId}/niches/${nicheSlug}/brief`),
};

// --- Influencer Brief ---
export interface InfluencerBriefData {
  brief: string;
  generated_at: string;
  client_name: string;
  niche_name: string;
}

export const influencerBrief = {
  get: (projectId: string, nicheSlug: string, regenerate = false) =>
    request<InfluencerBriefData>(
      `/projects/${projectId}/niches/${nicheSlug}/influencer-brief${regenerate ? "?regenerate=true" : ""}`
    ),
  save: (projectId: string, nicheSlug: string, brief: string) =>
    request<InfluencerBriefData>(`/projects/${projectId}/niches/${nicheSlug}/influencer-brief`, {
      method: "PUT",
      body: JSON.stringify({ brief }),
    }),
};

// --- Sancho AI ---
export const sancho = {
  chat: (
    projectId: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    currentPage?: string
  ) =>
    request<{ reply: string }>(`/projects/${projectId}/sancho`, {
      method: "POST",
      body: JSON.stringify({ messages, current_page: currentPage ?? null }),
    }),
  chatGeneral: (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    currentPage?: string
  ) =>
    request<{ reply: string }>("/sancho/chat", {
      method: "POST",
      body: JSON.stringify({ messages, current_page: currentPage ?? null }),
    }),
};
