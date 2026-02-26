"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  niches as nichesApi,
  projects as projectsApi,
  prompts as promptsApi,
  seo,
  domains,
  type NicheDetail,
  type ProjectDetail,
  type Prompt,
  type PromptTopic,
  type SerpQuery,
  type ExclusionRule,
} from "@/lib/api";
import { useJobPolling } from "@/hooks/useJobPolling";
import { KeywordBuilder } from "@/components/configure/KeywordBuilder";
import { PromptSelector } from "@/components/configure/PromptSelector";
import { ExclusionRules } from "@/components/configure/ExclusionRules";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Settings,
  Rocket,
  Search,
  MessageSquare,
  Shield,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from "lucide-react";

export default function ConfigurePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const slug = params.slug as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [niche, setNiche] = useState<NicheDetail | null>(null);
  const [promptTopics, setPromptTopics] = useState<PromptTopic[]>([]);
  const [existingPrompts, setExistingPrompts] = useState<Prompt[]>([]);
  const [existingQueries, setExistingQueries] = useState<SerpQuery[]>([]);
  const [exclusionRules, setExclusionRules] = useState<ExclusionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { job, isRunning } = useJobPolling(activeJobId);

  // Collapsible panels
  const [expandedPanel, setExpandedPanel] = useState<string | null>("keywords");

  const togglePanel = (panel: string) => {
    setExpandedPanel((prev) => (prev === panel ? null : panel));
  };

  const loadData = useCallback(async () => {
    try {
      const nicheData = await nichesApi.get(projectId, slug);
      const [proj, topics, proms, queries, rules] = await Promise.all([
        projectsApi.get(projectId),
        promptsApi.topics(projectId),
        promptsApi.list(projectId, nicheData.id),
        seo.listQueries(projectId, slug),
        domains.listRules(projectId),
      ]);
      setProject(proj);
      setNiche(nicheData);
      setPromptTopics(topics);
      setExistingPrompts(proms);
      setExistingQueries(queries);
      setExclusionRules(rules);
    } catch (e) {
      console.error("Failed to load configure data:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload queries when SERP job completes or fails
  useEffect(() => {
    if (job?.status === "completed" || job?.status === "failed") {
      seo.listQueries(projectId, slug).then(setExistingQueries);
      setActiveJobId(null);
    }
  }, [job?.status, projectId, slug]);

  if (loading) {
    return <div className="py-8 text-center text-comic-ink-soft">Cargando configuracion...</div>;
  }

  if (!project || !niche) {
    return <div className="py-8 text-center text-comic-ink-soft">No encontrado.</div>;
  }

  const clientBrand = project.brands.find((b) => b.is_client);
  const brandName = clientBrand?.name ?? project.name;
  const brandDomain = clientBrand?.domain ?? null;
  const clientCompanyType = clientBrand?.company_type ?? null;
  const competitorNames = niche.competitors.map((c) => c.name);
  const competitorDomains = niche.competitors.map((c) => c.domain).filter(Boolean) as string[];

  const handleKeywordsSubmit = async (keywords: string[], nicheSlug: string) => {
    const jobStatus = await seo.createBatch(projectId, keywords, nicheSlug);
    const updatedQueries = await seo.listQueries(projectId, slug);
    setExistingQueries(updatedQueries);
    setActiveJobId(jobStatus.id);
  };

  const handleUpdateQuery = async (queryId: string, keyword: string) => {
    await seo.updateQuery(queryId, keyword);
    const updatedQueries = await seo.listQueries(projectId, slug);
    setExistingQueries(updatedQueries);
  };

  const handleDeleteQuery = async (queryId: string) => {
    await seo.deleteQuery(queryId);
    const updatedQueries = await seo.listQueries(projectId, slug);
    setExistingQueries(updatedQueries);
  };

  const handlePromptsImport = async (
    promptsData: { topic_id: string; text: string; language: string }[]
  ) => {
    await promptsApi.importBatch(
      projectId,
      promptsData.map((p) => ({ ...p, niche_id: niche.id }))
    );
    await loadData();
  };

  const handleClearPrompts = async () => {
    if (!confirm("¿Borrar todos los prompts de este nicho?")) return;
    await promptsApi.deleteByNiche(projectId, niche.id);
    await loadData();
  };

  const handleCreateRule = async (rule: {
    project_id: string;
    rule_name: string;
    rule_type: string;
    rule_value: Record<string, unknown>;
    description?: string;
  }) => {
    await domains.createRule(rule);
    await loadData();
  };

  const handleDeleteRule = async (ruleId: string) => {
    await domains.deleteRule(ruleId);
    await loadData();
  };

  // Readiness check
  const hasKeywords = existingQueries.length > 0 || isRunning;
  const hasPrompts = existingPrompts.length > 0;
  const isReady = hasKeywords && hasPrompts;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/projects/${projectId}/niches/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a {niche.name}
        </Link>
      </div>

      {/* Header */}
      <div>
        <h2 className="text-xl font-black tracking-tight text-comic-ink flex items-center gap-2">
          <Settings className="h-5 w-5 text-comic-cyan" />
          Fase 3 — Configurar &quot;{niche.name}&quot;
        </h2>
        <p className="mt-1 text-sm text-comic-ink-soft">
          Configura las keywords SEO, los prompts GEO y las reglas de exclusion. Haz click en cada panel para expandirlo.
        </p>
      </div>

      {/* Progress indicator */}
      {isRunning && job && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-4 shadow-comic-xs">
          <div className="mb-2 flex justify-between text-sm font-bold text-comic-ink">
            <span>Buscando en Google...</span>
            <span>{Math.round(job.progress * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm border border-comic-ink bg-comic-aged">
            <div
              className="h-full rounded-sm bg-comic-cyan transition-all"
              style={{ width: `${job.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ═══ Collapsible Config Panels ═══ */}
      <div className="space-y-2">
        {/* ── Keywords SEO ── */}
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
          <button
            onClick={() => togglePanel("keywords")}
            className="flex w-full items-center justify-between px-4 py-3 hover:bg-comic-aged/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Search className="h-4 w-4 text-comic-cyan" />
              <span className="text-sm font-bold text-comic-ink">Keywords SEO</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-sm border border-comic-ink bg-comic-cyan px-2 py-0.5 text-xs font-black text-white">
                {existingQueries.length}
              </span>
              {hasKeywords && <CheckCircle2 className="h-3.5 w-3.5 text-comic-sage" />}
              {expandedPanel === "keywords" ? (
                <ChevronUp className="h-4 w-4 text-comic-ink-soft" />
              ) : (
                <ChevronDown className="h-4 w-4 text-comic-ink-soft" />
              )}
            </div>
          </button>
          {expandedPanel === "keywords" && (
            <div className="border-t-2 border-comic-ink px-4 py-4">
              <KeywordBuilder
                nicheName={niche.name}
                nicheDescription={niche.description}
                nicheSlug={niche.slug}
                competitorNames={competitorNames}
                brandName={brandName}
                market={project.market}
                language={project.language}
                existingQueries={existingQueries}
                clientCompanyType={clientCompanyType}
                onSubmit={handleKeywordsSubmit}
                onUpdateQuery={handleUpdateQuery}
                onDeleteQuery={handleDeleteQuery}
              />
            </div>
          )}
        </div>

        {/* ── Prompts GEO ── */}
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
          <button
            onClick={() => togglePanel("prompts")}
            className="flex w-full items-center justify-between px-4 py-3 hover:bg-comic-aged/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="h-4 w-4 text-comic-rust" />
              <span className="text-sm font-bold text-comic-ink">Prompts GEO</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-sm border border-comic-ink bg-comic-rust px-2 py-0.5 text-xs font-black text-white">
                {existingPrompts.length}
              </span>
              {hasPrompts && <CheckCircle2 className="h-3.5 w-3.5 text-comic-sage" />}
              {expandedPanel === "prompts" ? (
                <ChevronUp className="h-4 w-4 text-comic-ink-soft" />
              ) : (
                <ChevronDown className="h-4 w-4 text-comic-ink-soft" />
              )}
            </div>
          </button>
          {expandedPanel === "prompts" && (
            <div className="border-t-2 border-comic-ink px-4 py-4">
              <PromptSelector
                projectId={projectId}
                nicheName={niche.name}
                nicheDescription={niche.description}
                brandName={brandName}
                competitorNames={competitorNames}
                language={project.language}
                existingPrompts={existingPrompts}
                topics={promptTopics}
                clientCompanyType={clientCompanyType}
                onImport={handlePromptsImport}
                onClear={existingPrompts.length > 0 ? handleClearPrompts : undefined}
              />
            </div>
          )}
        </div>

        {/* ── Exclusiones ── */}
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
          <button
            onClick={() => togglePanel("exclusions")}
            className="flex w-full items-center justify-between px-4 py-3 hover:bg-comic-aged/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-comic-navy" />
              <span className="text-sm font-bold text-comic-ink">Exclusiones</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-sm border border-comic-ink bg-comic-navy px-2 py-0.5 text-xs font-black text-white">
                {exclusionRules.length}
              </span>
              {expandedPanel === "exclusions" ? (
                <ChevronUp className="h-4 w-4 text-comic-ink-soft" />
              ) : (
                <ChevronDown className="h-4 w-4 text-comic-ink-soft" />
              )}
            </div>
          </button>
          {expandedPanel === "exclusions" && (
            <div className="border-t-2 border-comic-ink px-4 py-4">
              <ExclusionRules
                projectId={projectId}
                brandDomain={brandDomain}
                competitorDomains={competitorDomains}
                market={project.market}
                existingRules={exclusionRules}
                onCreateRule={handleCreateRule}
                onDeleteRule={handleDeleteRule}
              />
            </div>
          )}
        </div>
      </div>

      {/* ═══ Readiness & Navigation ═══ */}
      <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-4 shadow-comic-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
          <span className={cn("flex items-center gap-1.5", hasKeywords ? "text-comic-sage" : "text-comic-ink-soft")}>
            {hasKeywords ? <CheckCircle2 className="h-3.5 w-3.5" /> : "○"}
            Keywords ({existingQueries.length})
          </span>
          <span className={cn("flex items-center gap-1.5", hasPrompts ? "text-comic-sage" : "text-comic-ink-soft")}>
            {hasPrompts ? <CheckCircle2 className="h-3.5 w-3.5" /> : "○"}
            Prompts ({existingPrompts.length})
          </span>
          <span className={cn("flex items-center gap-1.5", exclusionRules.length > 0 ? "text-comic-sage" : "text-comic-ink-soft")}>
            {exclusionRules.length > 0 ? <CheckCircle2 className="h-3.5 w-3.5" /> : "○"}
            Exclusiones ({exclusionRules.length})
          </span>
        </div>

        {!isReady && (
          <p className="text-xs text-comic-ink-soft">
            Necesitas al menos 1 keyword y 1 prompt para poder analizar.
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => router.push(`/projects/${projectId}/niches/${slug}`)}
            className="flex items-center gap-2 rounded-sm border-2 border-comic-ink bg-comic-paper px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al nicho
          </button>

          <button
            onClick={() => router.push(`/projects/${projectId}/niches/${slug}/analyze`)}
            disabled={!isReady}
            className={cn(
              "flex items-center gap-2 rounded-sm border-2 border-comic-ink px-4 py-2 text-sm font-bold shadow-comic-xs transition-all",
              isReady
                ? "bg-comic-yellow text-comic-ink hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                : "bg-comic-aged text-comic-ink-soft cursor-not-allowed"
            )}
          >
            <Rocket className="h-4 w-4" />
            Ejecutar Analisis
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
