"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  niches as nichesApi,
  projects as projectsApi,
  prompts as promptsApi,
  seo,
  geo,
  analysis,
  domains,
  type NicheDetail,
  type ProjectDetail,
  type Prompt,
  type SerpQuery,
  type ExclusionRule,
} from "@/lib/api";
import { AnalysisLauncher, type AnalysisJob } from "@/components/analysis/AnalysisLauncher";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Zap,
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  Shield,
  MessageSquare,
  Search,
  Pencil,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";

const MAX_GEO_PROMPTS = 8;

export default function AnalyzePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const slug = params.slug as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [niche, setNiche] = useState<NicheDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastAnalysisDate, setLastAnalysisDate] = useState<string | null>(null);

  // Inline data
  const [promptsList, setPromptsList] = useState<Prompt[]>([]);
  const [queriesList, setQueriesList] = useState<SerpQuery[]>([]);
  const [rulesList, setRulesList] = useState<ExclusionRule[]>([]);

  // Expand panels
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);

  // Add forms
  const [newExclusionDomain, setNewExclusionDomain] = useState("");
  const [addingExclusion, setAddingExclusion] = useState(false);

  // Prompt editing
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingPromptText, setEditingPromptText] = useState("");

  // Job tracking
  const [jobs, setJobs] = useState<AnalysisJob[]>([
    {
      id: "seo",
      label: "SEO — Busqueda en Google",
      description: "Buscando keywords en Google Espana y clasificando resultados (~1 min)",
      status: "idle",
      progress: 0,
      jobId: null,
      error: null,
      stepInfo: null,
    },
    {
      id: "geo",
      label: "GEO — Visibilidad en IAs",
      description: "Enviando prompts a ChatGPT, Claude, Gemini y Perplexity (~3-5 min)",
      status: "idle",
      progress: 0,
      jobId: null,
      error: null,
      stepInfo: null,
    },
    {
      id: "gap",
      label: "Gap Analysis — Oportunidades",
      description: "Comparando donde estan competidores vs tu marca (instantaneo)",
      status: "idle",
      progress: 0,
      jobId: null,
      error: null,
      stepInfo: null,
    },
  ]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const nicheData = await nichesApi.get(projectId, slug);
      const [proj, proms, queries, rules, geoRuns] = await Promise.all([
        projectsApi.get(projectId),
        promptsApi.list(projectId, nicheData.id),
        seo.listQueries(projectId, slug),
        domains.listRules(projectId),
        geo.listRuns(projectId, nicheData.id),
      ]);
      setProject(proj);
      setNiche(nicheData);
      setPromptsList(proms);
      setQueriesList(queries);
      setRulesList(rules);

      // Compute last analysis date from most recent completed GEO run only
      // (SEO last_fetched_at can be set by the wizard during setup, so it's not a reliable indicator)
      const lastGeoDate = geoRuns
        .filter((r) => r.completed_at)
        .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0]
        ?.completed_at ?? null;
      if (lastGeoDate) {
        setLastAnalysisDate(lastGeoDate);
      }
    } catch (e) {
      console.error("Failed to load analyze data:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, slug]);

  useEffect(() => {
    loadData();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadData]);

  const togglePanel = (panel: string) => {
    setExpandedPanel((prev) => (prev === panel ? null : panel));
  };

  // ── Delete handlers ──
  const handleDeletePrompt = async (promptId: string) => {
    await promptsApi.delete(projectId, promptId);
    setPromptsList((prev) => prev.filter((p) => p.id !== promptId));
  };

  const handleDeleteQuery = async (queryId: string) => {
    await seo.deleteQuery(queryId);
    setQueriesList((prev) => prev.filter((q) => q.id !== queryId));
  };

  const handleDeleteRule = async (ruleId: string) => {
    await domains.deleteRule(ruleId);
    setRulesList((prev) => prev.filter((r) => r.id !== ruleId));
  };

  // ── Update prompt handler ──
  const handleUpdatePrompt = async (promptId: string, newText: string) => {
    const updated = await promptsApi.update(projectId, promptId, newText);
    setPromptsList((prev) => prev.map((p) => (p.id === promptId ? { ...p, text: updated.text } : p)));
  };

  // ── Add exclusion handler ──
  const handleAddExclusion = async () => {
    const val = newExclusionDomain.trim().toLowerCase();
    if (!val) return;
    setAddingExclusion(true);
    try {
      const rule = await domains.createRule({
        project_id: projectId,
        rule_name: `Excluir ${val}`,
        rule_type: "domain_exact",
        rule_value: { domains: [val] },
        description: "Exclusion manual",
      });
      setRulesList((prev) => [...prev, rule]);
      setNewExclusionDomain("");
    } finally {
      setAddingExclusion(false);
    }
  };

  // ── Job management (unchanged logic) ──
  const updateJob = (id: string, update: Partial<AnalysisJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...update } : j)));
  };

  const pollJob = async (jobId: string, analysisJobId: string) => {
    try {
      const status = await geo.getJobStatus(jobId);
      updateJob(analysisJobId, {
        progress: status.progress,
        status: status.status === "completed" ? "completed" : status.status === "failed" ? "failed" : "running",
        error: status.error,
        stepInfo: status.step_info ?? null,
      });
      return status.status;
    } catch {
      return "failed";
    }
  };

  const startPolling = (jobId: string, analysisJobId: string, onComplete?: () => void) => {
    const startTime = Date.now();
    const MAX_POLL_MS = 30 * 60 * 1000; // 30 min — GEO can take 15-20 min
    const interval = setInterval(async () => {
      const status = await pollJob(jobId, analysisJobId);
      if (status === "completed" || status === "failed") {
        clearInterval(interval);
        onComplete?.();
      } else if (Date.now() - startTime > MAX_POLL_MS) {
        clearInterval(interval);
        updateJob(analysisJobId, { status: "failed", error: "Timeout: el job tardo demasiado" });
        onComplete?.();
      }
    }, 3000);
    pollJob(jobId, analysisJobId);
    return interval;
  };

  const launchGeo = async () => {
    updateJob("geo", { status: "running", progress: 0, error: null });
    try {
      const jobStatus = await geo.createRun(projectId, niche?.id ?? null);
      updateJob("geo", { jobId: jobStatus.id });
      // Resolve with the GeoRun ID (not the BackgroundJob ID) so gap analysis uses the right ID
      const geoRunId = jobStatus.run_id ?? jobStatus.id;
      return new Promise<string>((resolve) => {
        startPolling(jobStatus.id, "geo", () => resolve(geoRunId));
      });
    } catch (e) {
      updateJob("geo", { status: "failed", error: e instanceof Error ? e.message : "Error" });
      throw e;
    }
  };

  const launchSeo = async () => {
    updateJob("seo", { status: "running", progress: 0, error: null });
    const queries = await seo.listQueries(projectId, slug);
    if (queries.length === 0) {
      updateJob("seo", { status: "completed", progress: 1 });
      return;
    }
    const unfetched = queries.filter((q) => !q.last_fetched_at);
    if (unfetched.length > 0) {
      try {
        // Batch-fetch ALL unfetched queries (not just the first one)
        const jobStatus = await seo.fetchBatch(projectId, unfetched.map((q) => q.id));
        updateJob("seo", { jobId: jobStatus.id });
        return new Promise<void>((resolve) => {
          startPolling(jobStatus.id, "seo", () => {
            updateJob("seo", { status: "completed", progress: 1 });
            resolve();
          });
        });
      } catch {
        updateJob("seo", { status: "completed", progress: 1 });
      }
    } else {
      updateJob("seo", { status: "completed", progress: 1 });
    }
  };

  const launchGap = async (geoRunId?: string) => {
    updateJob("gap", { status: "running", progress: 0, error: null });
    try {
      const jobStatus = await analysis.createGapAnalysis(projectId, geoRunId, niche?.id, slug);
      updateJob("gap", { jobId: jobStatus.id });
      return new Promise<void>((resolve) => {
        startPolling(jobStatus.id, "gap", () => resolve());
      });
    } catch (e) {
      updateJob("gap", { status: "failed", error: e instanceof Error ? e.message : "Error" });
    }
  };

  const handleLaunchAll = async () => {
    try {
      const [geoRunId] = await Promise.all([launchGeo(), launchSeo()]);
      await launchGap(geoRunId);
    } catch (e) {
      console.error("Analysis failed:", e);
    }
  };

  const handleLaunchSingle = async (jobId: string) => {
    if (jobId === "geo") await launchGeo();
    else if (jobId === "seo") await launchSeo();
    else if (jobId === "gap") {
      const seoOk = jobs.find((j) => j.id === "seo")?.status === "completed";
      const geoOk = jobs.find((j) => j.id === "geo")?.status === "completed";
      if (!seoOk || !geoOk) return;
      await launchGap();
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-comic-ink-soft">Cargando...</div>;
  }

  if (!project || !niche) {
    return <div className="py-8 text-center text-comic-ink-soft">No encontrado.</div>;
  }

  const promptCount = promptsList.length;
  const queryCount = queriesList.length;
  const ruleCount = rulesList.length;
  const tooManyPrompts = promptCount > MAX_GEO_PROMPTS;
  const canLaunch = (promptCount > 0 || queryCount > 0) && !tooManyPrompts;
  const allCompleted = jobs.every((j) => j.status === "completed");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/projects/${projectId}/niches/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a {niche.name}
        </Link>
      </div>

      <div>
        <h2 className="text-xl font-black tracking-tight text-comic-ink flex items-center gap-2">
          <Zap className="h-5 w-5 text-comic-yellow" />
          Fase 4 — Analizar &quot;{niche.name}&quot;
        </h2>
        <p className="mt-1 text-sm text-comic-ink-soft">
          Lanza los análisis SEO (Google) y GEO (IAs) para este nicho. Primero SEO, después GEO.
        </p>
      </div>

      {/* ═══ Expandable Config Panels ═══ */}
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
                {queryCount}
              </span>
              {expandedPanel === "keywords" ? (
                <ChevronUp className="h-4 w-4 text-comic-ink-soft" />
              ) : (
                <ChevronDown className="h-4 w-4 text-comic-ink-soft" />
              )}
            </div>
          </button>
          {expandedPanel === "keywords" && (
            <div className="border-t-2 border-comic-ink px-4 py-3 max-h-64 overflow-y-auto">
              {queriesList.length === 0 ? (
                <p className="text-xs text-comic-ink-soft py-2">
                  Sin keywords. Ve a Configurar para generar keywords SEO.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {queriesList.map((q) => (
                    <span
                      key={q.id}
                      className="inline-flex items-center gap-1 rounded-sm border border-comic-ink bg-comic-aged/30 px-2 py-1 text-xs font-semibold text-comic-ink group"
                    >
                      {q.keyword}
                      {q.last_fetched_at && (
                        <span className="text-comic-sage">&#x2713;</span>
                      )}
                      <button
                        onClick={() => handleDeleteQuery(q.id)}
                        className="ml-0.5 text-comic-ink-soft/30 hover:text-comic-red transition-colors"
                        title="Eliminar keyword"
                      >
                        &#x2715;
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
            <div className="flex items-center gap-2">
              {promptCount > MAX_GEO_PROMPTS && (
                <span className="flex items-center gap-1 rounded-sm border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  {promptCount}/{MAX_GEO_PROMPTS} — elimina {promptCount - MAX_GEO_PROMPTS} para poder analizar
                </span>
              )}
              <span className={cn(
                "rounded-sm border border-comic-ink px-2 py-0.5 text-xs font-black text-white",
                promptCount > MAX_GEO_PROMPTS ? "bg-amber-500" : "bg-comic-rust"
              )}>
                {promptCount}
              </span>
              {expandedPanel === "prompts" ? (
                <ChevronUp className="h-4 w-4 text-comic-ink-soft" />
              ) : (
                <ChevronDown className="h-4 w-4 text-comic-ink-soft" />
              )}
            </div>
          </button>
          {expandedPanel === "prompts" && (
            <div className="border-t-2 border-comic-ink px-4 py-3 max-h-80 overflow-y-auto space-y-1">
              <p className="text-[10px] text-comic-ink-soft mb-2">
                Máximo {MAX_GEO_PROMPTS} prompts (límite del sistema). Haz click en el lápiz para editar o en la papelera para eliminar.
              </p>
              {promptsList.length === 0 ? (
                <p className="text-xs text-comic-ink-soft py-2">
                  Sin prompts. Ve a Configurar para generar prompts.
                </p>
              ) : (
                promptsList.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-start justify-between gap-2 rounded-sm border border-comic-aged px-3 py-2 hover:bg-comic-aged/20"
                  >
                    {editingPromptId === p.id ? (
                      <>
                        <textarea
                          value={editingPromptText}
                          onChange={(e) => setEditingPromptText(e.target.value)}
                          className="flex-1 rounded-sm border-2 border-comic-ink bg-comic-paper px-2 py-1 text-xs text-comic-ink focus:outline-none focus:ring-2 focus:ring-comic-rust resize-none"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            onClick={async () => {
                              if (editingPromptText.trim()) {
                                await handleUpdatePrompt(p.id, editingPromptText.trim());
                              }
                              setEditingPromptId(null);
                            }}
                            className="rounded-sm p-1 text-comic-sage hover:bg-comic-sage/10"
                            title="Guardar"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setEditingPromptId(null)}
                            className="rounded-sm p-1 text-comic-ink-soft/40 hover:text-comic-red hover:bg-comic-red/10"
                            title="Cancelar"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-comic-ink flex-1 line-clamp-2">{p.text}</p>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => {
                              setEditingPromptId(p.id);
                              setEditingPromptText(p.text);
                            }}
                            className="rounded-sm p-1 text-comic-ink-soft/40 hover:text-comic-cyan hover:bg-comic-cyan/10"
                            title="Editar"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDeletePrompt(p.id)}
                            className="rounded-sm p-1 text-comic-ink-soft/40 hover:text-comic-red hover:bg-comic-red/10"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
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
                {ruleCount}
              </span>
              {expandedPanel === "exclusions" ? (
                <ChevronUp className="h-4 w-4 text-comic-ink-soft" />
              ) : (
                <ChevronDown className="h-4 w-4 text-comic-ink-soft" />
              )}
            </div>
          </button>
          {expandedPanel === "exclusions" && (
            <div className="border-t-2 border-comic-ink px-4 py-3 space-y-3">
              <p className="text-[10px] text-comic-ink-soft">
                Estas reglas son compartidas por todos los nichos de esta campaña. Borra las que no apliquen a este nicho.
              </p>
              {/* Existing rules */}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {rulesList.length === 0 ? (
                  <p className="text-xs text-comic-ink-soft py-2">
                    Sin reglas de exclusion.
                  </p>
                ) : (
                  rulesList.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-sm border border-comic-aged px-3 py-2 hover:bg-comic-aged/20"
                    >
                      <div>
                        <p className="text-xs font-bold text-comic-ink">{r.rule_name}</p>
                        {r.description && (
                          <p className="text-[10px] text-comic-ink-soft">{r.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteRule(r.id)}
                        className="shrink-0 rounded-sm p-1 text-comic-ink-soft/40 hover:text-comic-red hover:bg-comic-red/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add manual exclusion */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newExclusionDomain}
                  onChange={(e) => setNewExclusionDomain(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddExclusion()}
                  placeholder="dominio.com"
                  className="flex-1 rounded-sm border-2 border-comic-ink bg-comic-paper px-3 py-1.5 text-xs text-comic-ink placeholder:text-comic-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-comic-rust"
                />
                <button
                  onClick={handleAddExclusion}
                  disabled={addingExclusion || !newExclusionDomain.trim()}
                  className={cn(
                    "flex items-center gap-1 rounded-sm border-2 border-comic-ink px-3 py-1.5 text-xs font-bold transition-all",
                    addingExclusion || !newExclusionDomain.trim()
                      ? "bg-comic-aged text-comic-ink-soft cursor-not-allowed"
                      : "bg-comic-navy text-white hover:bg-comic-ink"
                  )}
                >
                  <Plus className="h-3 w-3" />
                  Agregar
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ═══ Analysis launcher ═══ */}
      <section className="rounded-sm border-2 border-comic-ink bg-comic-paper p-5 shadow-comic-sm">
        <AnalysisLauncher
          jobs={jobs}
          onLaunchAll={handleLaunchAll}
          onLaunchSingle={handleLaunchSingle}
          canLaunch={canLaunch}
          promptCount={promptCount}
          queryCount={queryCount}
          lastAnalysisDate={lastAnalysisDate}
          resultsHref={`/projects/${projectId}/niches/${slug}/results`}
          disabledReason={
            tooManyPrompts
              ? `Tienes ${promptCount} prompts — el máximo es ${MAX_GEO_PROMPTS}. Ve a Configurar y elimina ${promptCount - MAX_GEO_PROMPTS} prompt${promptCount - MAX_GEO_PROMPTS !== 1 ? "s" : ""}.`
              : !canLaunch
                ? "Necesitas al menos 1 prompt o 1 keyword configurados. Ve a Configurar primero."
                : undefined
          }
        />
      </section>

      {/* ═══ Next step ═══ */}
      {allCompleted && (
        <div className="rounded-sm border-2 border-comic-sage bg-comic-yellow-pale p-4 shadow-comic-xs">
          <p className="text-sm font-bold text-comic-sage">
            Analisis completado. Ya puedes ver los resultados.
          </p>
          <button
            onClick={() => router.push(`/projects/${projectId}/niches/${slug}/results`)}
            className="mt-2 flex items-center gap-2 rounded-sm border-2 border-comic-ink bg-comic-sage px-4 py-2 text-sm font-bold text-white shadow-comic-xs hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
          >
            Ver Resultados
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
