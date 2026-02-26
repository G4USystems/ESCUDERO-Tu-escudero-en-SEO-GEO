"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  analysis,
  projects as projectsApi,
  type ProjectDetail,
  type KeyOpportunity,
} from "@/lib/api";
import {
  ArrowLeft,
  Zap,
  TrendingUp,
  Globe,
  Search,
  Link2,
  LayoutGrid,
  Users,
  Loader2,
  RefreshCw,
  Filter,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Badge configs ────────────────────────────────────────────────────

const priorityConfig: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-red-100", text: "text-red-700", label: "Critico" },
  high:     { bg: "bg-orange-100", text: "text-orange-700", label: "Alto" },
  medium:   { bg: "bg-yellow-100", text: "text-yellow-700", label: "Medio" },
  low:      { bg: "bg-gray-100", text: "text-gray-500", label: "Bajo" },
};

const domainTypeConfig: Record<string, { bg: string; text: string; label: string }> = {
  editorial:     { bg: "bg-green-100", text: "text-green-700", label: "Editorial" },
  ugc:           { bg: "bg-yellow-100", text: "text-yellow-700", label: "UGC/Foro" },
  reference:     { bg: "bg-slate-100", text: "text-slate-600", label: "Referencia" },
  corporate:     { bg: "bg-orange-100", text: "text-orange-700", label: "Empresa" },
  competitor:    { bg: "bg-red-100", text: "text-red-700", label: "Competidor" },
  institutional: { bg: "bg-blue-100", text: "text-blue-600", label: "Institucional" },
  aggregator:    { bg: "bg-purple-100", text: "text-purple-600", label: "Agregador" },
};

const actionLabels: Record<string, string> = {
  pitch_inclusion: "Solicitar inclusion en ranking",
  request_review: "Solicitar review de tu producto",
  pitch_guest_post: "Proponer guest post / articulo",
  content_collaboration: "Colaboracion de contenido",
  community_engagement: "Engagement en comunidad",
  strategic_partnership: "Partnership estrategico",
  backlink_outreach: "Outreach para backlink",
  general_outreach: "Contacto general",
};

const providerConfig: Record<string, { bg: string; text: string; label: string }> = {
  openai:     { bg: "bg-emerald-100", text: "text-emerald-700", label: "GPT-4o" },
  anthropic:  { bg: "bg-orange-100", text: "text-orange-700", label: "Claude" },
  gemini:     { bg: "bg-blue-100", text: "text-blue-700", label: "Gemini" },
  perplexity: { bg: "bg-purple-100", text: "text-purple-700", label: "Perplexity" },
};

// ── Score bar component ──────────────────────────────────────────────

function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-12 text-right">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-[10px] font-semibold w-8">{value.toFixed(0)}</span>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function KeyOpportunitiesPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [opportunities, setOpportunities] = useState<KeyOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [domainTypeFilter, setDomainTypeFilter] = useState<string>("all");
  const [show20xOnly, setShow20xOnly] = useState(false);

  // Expanded rows
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [proj, opps] = await Promise.all([
        projectsApi.get(projectId),
        analysis.getKeyOpportunities(projectId),
      ]);
      setProject(proj);
      setOpportunities(opps);
    } catch (e) {
      console.error("Failed to load key opportunities:", e);
      setError(e instanceof Error ? e.message : "Error loading data");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtered data ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = opportunities;
    if (priorityFilter !== "all") {
      result = result.filter((o) => o.priority === priorityFilter);
    }
    if (domainTypeFilter !== "all") {
      result = result.filter((o) => o.domain_type === domainTypeFilter);
    }
    if (show20xOnly) {
      result = result.filter((o) => o.estimated_20x_potential);
    }
    return result;
  }, [opportunities, priorityFilter, domainTypeFilter, show20xOnly]);

  // ── Summary stats ──────────────────────────────────────────────────

  const stats = useMemo(() => {
    return {
      total: opportunities.length,
      critical: opportunities.filter((o) => o.priority === "critical").length,
      high: opportunities.filter((o) => o.priority === "high").length,
      with20x: opportunities.filter((o) => o.estimated_20x_potential).length,
      avgScore: opportunities.length > 0
        ? opportunities.reduce((sum, o) => sum + o.key_opportunity_score, 0) / opportunities.length
        : 0,
    };
  }, [opportunities]);

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Calculando Key Opportunities...
      </div>
    );
  }

  if (!project) {
    return <div className="py-8 text-center text-muted-foreground">Campaña no encontrada.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a la campaña
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Key Opportunities
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ranking unificado de medios: SEO + GEO + Backlinks + Content Gap + Densidad Competitiva
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); loadData(); }}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          Recalcular
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Total medios</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
          <p className="text-xs text-red-600">Criticos</p>
          <p className="text-2xl font-bold text-red-700">{stats.critical}</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3">
          <p className="text-xs text-orange-600">Alta prioridad</p>
          <p className="text-2xl font-bold text-orange-700">{stats.high}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            20x Potential
          </p>
          <p className="text-2xl font-bold text-amber-700">{stats.with20x}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Score medio</p>
          <p className="text-2xl font-bold">{stats.avgScore.toFixed(1)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-md border px-2 py-1 text-xs"
          >
            <option value="all">Todas las prioridades</option>
            <option value="critical">Critico</option>
            <option value="high">Alto</option>
            <option value="medium">Medio</option>
            <option value="low">Bajo</option>
          </select>
        </div>
        <select
          value={domainTypeFilter}
          onChange={(e) => setDomainTypeFilter(e.target.value)}
          className="rounded-md border px-2 py-1 text-xs"
        >
          <option value="all">Todos los tipos</option>
          <option value="editorial">Editorial</option>
          <option value="ugc">UGC / Foro</option>
          <option value="reference">Referencia</option>
          <option value="aggregator">Agregador</option>
        </select>
        <button
          onClick={() => setShow20xOnly(!show20xOnly)}
          className={cn(
            "flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
            show20xOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "text-muted-foreground"
          )}
        >
          <Sparkles className="h-3 w-3" />
          {show20xOnly ? "Solo 20x Potential" : "20x Potential"}
        </button>
      </div>

      {/* Opportunities list */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Zap className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            {opportunities.length === 0
              ? "No hay Key Opportunities. Ejecuta analisis GEO y SEO primero."
              : "No hay oportunidades que coincidan con los filtros."}
          </p>
          {opportunities.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Las Key Opportunities se generan combinando datos de las fases de analisis SEO, GEO y Gap Analysis.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((opp, idx) => {
            const isExpanded = expandedDomain === opp.domain;
            const pConfig = priorityConfig[opp.priority] || priorityConfig.low;
            const dtConfig = domainTypeConfig[opp.domain_type || ""] || { bg: "bg-gray-50", text: "text-gray-400", label: opp.domain_type || "—" };

            return (
              <div
                key={opp.domain}
                className={cn(
                  "rounded-lg border transition-all",
                  opp.priority === "critical" && "border-red-200 bg-red-50/30",
                  opp.priority === "high" && "border-orange-200 bg-orange-50/20",
                  opp.estimated_20x_potential && "ring-1 ring-amber-300",
                )}
              >
                {/* Main row */}
                <button
                  onClick={() => setExpandedDomain(isExpanded ? null : opp.domain)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {/* Rank */}
                  <span className="text-xs text-muted-foreground w-6 shrink-0">
                    #{idx + 1}
                  </span>

                  {/* Score circle */}
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shrink-0",
                    opp.key_opportunity_score >= 70 ? "bg-red-100 text-red-700" :
                    opp.key_opportunity_score >= 50 ? "bg-orange-100 text-orange-700" :
                    opp.key_opportunity_score >= 30 ? "bg-yellow-100 text-yellow-700" :
                    "bg-gray-100 text-gray-500"
                  )}>
                    {opp.key_opportunity_score.toFixed(0)}
                  </div>

                  {/* Domain info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">
                        {opp.display_name || opp.domain}
                      </span>
                      {opp.estimated_20x_potential && (
                        <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 font-semibold shrink-0">
                          <Star className="h-2.5 w-2.5" />
                          20x
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{opp.domain}</span>
                      <span className={cn("rounded-full px-1.5 py-0 text-[10px]", dtConfig.bg, dtConfig.text)}>
                        {dtConfig.label}
                      </span>
                      {opp.accepts_sponsored && (
                        <span className="rounded-full bg-green-100 px-1.5 py-0 text-[10px] text-green-700">
                          Sponsored OK
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score dimensions mini */}
                  <div className="hidden sm:flex items-center gap-1 shrink-0">
                    <div className="flex flex-col items-center" title="SEO">
                      <Search className="h-3 w-3 text-blue-500" />
                      <span className="text-[10px] font-medium">{opp.seo_score.toFixed(0)}</span>
                    </div>
                    <div className="flex flex-col items-center" title="GEO">
                      <Globe className="h-3 w-3 text-purple-500" />
                      <span className="text-[10px] font-medium">{opp.geo_score.toFixed(0)}</span>
                    </div>
                    <div className="flex flex-col items-center" title="Backlink">
                      <Link2 className="h-3 w-3 text-green-500" />
                      <span className="text-[10px] font-medium">{opp.backlink_score.toFixed(0)}</span>
                    </div>
                    <div className="flex flex-col items-center" title="Content Gap">
                      <LayoutGrid className="h-3 w-3 text-teal-500" />
                      <span className="text-[10px] font-medium">{opp.content_gap_score.toFixed(0)}</span>
                    </div>
                    <div className="flex flex-col items-center" title="Competidores">
                      <Users className="h-3 w-3 text-red-500" />
                      <span className="text-[10px] font-medium">{opp.competitive_density.toFixed(0)}</span>
                    </div>
                  </div>

                  {/* Priority badge */}
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium shrink-0", pConfig.bg, pConfig.text)}>
                    {pConfig.label}
                  </span>

                  {/* Competitors count */}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {opp.competitor_brands.length} comp.
                  </span>

                  {/* Expand */}
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t px-4 py-3 space-y-4">
                    {/* Score breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Dimensiones de scoring</p>
                        <ScoreBar value={opp.seo_score} label="SEO" color="bg-blue-500" />
                        <ScoreBar value={opp.geo_score} label="GEO" color="bg-purple-500" />
                        <ScoreBar value={opp.backlink_score} label="Backlink" color="bg-green-500" />
                        <ScoreBar value={opp.content_gap_score} label="Gap" color="bg-teal-500" />
                        <ScoreBar value={opp.competitive_density} label="Densidad" color="bg-red-500" />
                      </div>
                      <div className="space-y-3">
                        {/* Domain metrics */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Metricas del dominio</p>
                          <div className="flex gap-4 text-xs">
                            <span>DA: <strong>{opp.domain_authority ?? "N/A"}</strong></span>
                            <span>Trafico: <strong>{opp.monthly_traffic ? `${(opp.monthly_traffic / 1000).toFixed(0)}k` : "N/A"}</strong></span>
                          </div>
                        </div>

                        {/* GEO providers */}
                        {opp.geo_providers.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Citado por IAs</p>
                            <div className="flex gap-1 flex-wrap">
                              {opp.geo_providers.map((p) => {
                                const pc = providerConfig[p];
                                return pc ? (
                                  <span key={p} className={cn("rounded-full px-2 py-0.5 text-[10px]", pc.bg, pc.text)}>
                                    {pc.label}
                                  </span>
                                ) : (
                                  <span key={p} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{p}</span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Competitors on this domain */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Competidores presentes</p>
                          <div className="flex gap-1 flex-wrap">
                            {opp.competitor_brands.map((b) => (
                              <span key={b} className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] text-red-700">
                                {b}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Content types & keywords */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Tipos de contenido</p>
                        <div className="flex gap-1 flex-wrap">
                          {opp.content_types.map((ct) => (
                            <span key={ct} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{ct}</span>
                          ))}
                          {opp.content_types.length === 0 && <span className="text-[10px] text-muted-foreground">—</span>}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Keywords</p>
                        <div className="flex gap-1 flex-wrap">
                          {opp.keywords.slice(0, 5).map((kw) => (
                            <span key={kw} className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] text-blue-700">
                              {kw}
                            </span>
                          ))}
                          {opp.keywords.length === 0 && <span className="text-[10px] text-muted-foreground">—</span>}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Nichos</p>
                        <div className="flex gap-1 flex-wrap">
                          {opp.niches.map((n) => (
                            <span key={n} className="rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] text-purple-700">
                              {n}
                            </span>
                          ))}
                          {opp.niches.length === 0 && <span className="text-[10px] text-muted-foreground">—</span>}
                        </div>
                      </div>
                    </div>

                    {/* Top URLs */}
                    {opp.top_urls.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">URLs encontradas</p>
                        <div className="space-y-0.5">
                          {opp.top_urls.map((url, i) => (
                            <div key={i}>
                              {url.startsWith("(") ? (
                                <span className="text-[10px] text-muted-foreground">{url}</span>
                              ) : (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                  {url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80)}
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommended actions */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Acciones recomendadas</p>
                      <div className="flex gap-2 flex-wrap">
                        {opp.recommended_actions.map((action) => (
                          <span
                            key={action}
                            className="inline-flex items-center gap-1 rounded-md border bg-white px-2.5 py-1 text-xs font-medium shadow-sm"
                          >
                            <TrendingUp className="h-3 w-3 text-primary" />
                            {actionLabels[action] || action}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer stats */}
      {filtered.length > 0 && (
        <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
          <span>Mostrando: {filtered.length} de {opportunities.length}</span>
          <span>20x Potential: {filtered.filter((o) => o.estimated_20x_potential).length}</span>
          <span>Editorial: {filtered.filter((o) => o.domain_type === "editorial").length}</span>
          <span>UGC: {filtered.filter((o) => o.domain_type === "ugc").length}</span>
        </div>
      )}
    </div>
  );
}
