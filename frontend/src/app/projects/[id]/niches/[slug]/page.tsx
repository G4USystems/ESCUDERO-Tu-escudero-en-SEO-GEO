"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  niches as nichesApi,
  projects as projectsApi,
  prompts as promptsApi,
  seo,
  geo,
  domains,
  content,
  influencers as influencersApi,
  type NicheDetail,
  type NicheBrief,
  type Brand,
  type Prompt,
  type SerpQuery,
  type ExclusionRule,
  type GeoRun,
} from "@/lib/api";
import { CompetitorList } from "@/components/niche/CompetitorList";
import { BriefEditor } from "@/components/niche/BriefEditor";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Target,
  Search,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  Play,
  BarChart3,
  Handshake,
  Zap,
  FileText,
  Settings,
  Circle,
  Users,
  Pencil,
  Check,
  X,
} from "lucide-react";

function StepRow({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-comic-sage mt-0.5 shrink-0" />
      ) : (
        <Circle className="h-3.5 w-3.5 text-comic-ink/20 mt-0.5 shrink-0" />
      )}
      <span className={cn("text-xs", done ? "text-comic-ink font-medium" : "text-comic-ink-soft")}>
        {label}
        {detail && <span className="ml-1 text-comic-ink-soft font-normal">{detail}</span>}
      </span>
    </div>
  );
}

export default function NicheWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const slug = params.slug as string;

  const [niche, setNiche] = useState<NicheDetail | null>(null);
  const [allBrands, setAllBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline description editing
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);

  const [queries, setQueries] = useState<SerpQuery[]>([]);
  const [promptsList, setPromptsList] = useState<Prompt[]>([]);
  const [rules, setRules] = useState<ExclusionRule[]>([]);
  const [geoRuns, setGeoRuns] = useState<GeoRun[]>([]);
  const [articleCount, setArticleCount] = useState(0);
  const [influencerCount, setInfluencerCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [, nicheData, brandsData, q, proms, rl, gRuns, briefs, infResults] = await Promise.all([
        projectsApi.get(projectId),
        nichesApi.get(projectId, slug),
        projectsApi.listBrands(projectId),
        seo.listQueries(projectId, slug).catch(() => [] as SerpQuery[]),
        promptsApi.list(projectId).catch(() => [] as Prompt[]),
        domains.listRules(projectId).catch(() => [] as ExclusionRule[]),
        geo.listRuns(projectId).catch(() => [] as GeoRun[]),
        content.listBriefs(projectId, slug).catch(() => []),
        influencersApi.listResults(projectId, slug).catch(() => []),
      ]);
      setNiche(nicheData);
      setAllBrands(brandsData);
      setQueries(q);
      setPromptsList(proms);
      setRules(rl);
      setGeoRuns(gRuns);
      setArticleCount(
        briefs.filter((b) => b.status === "generated" || b.status === "approved").length
      );
      setInfluencerCount(infResults.length);
    } catch (e) {
      console.error("Failed to load niche:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <div className="py-8 text-center text-comic-ink-soft">Cargando nicho...</div>;
  }

  if (!niche) {
    return <div className="py-8 text-center text-comic-ink-soft">Nicho no encontrado.</div>;
  }

  const handleAddExisting = async (brandId: string) => {
    await nichesApi.addCompetitor(projectId, slug, brandId);
    await loadData();
  };

  const handleAddNew = async (data: { name: string; domain?: string }): Promise<Brand> => {
    const brand = await projectsApi.createBrand(projectId, {
      name: data.name,
      domain: data.domain,
      is_client: false,
    });
    await nichesApi.addCompetitor(projectId, slug, brand.id);
    await loadData();
    return brand;
  };

  const handleRemove = async (brandId: string) => {
    await nichesApi.removeCompetitor(projectId, slug, brandId);
    await loadData();
  };

  const handleBrandUpdated = (updated: Brand) => {
    setAllBrands((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setNiche((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        competitors: prev.competitors.map((c) => (c.id === updated.id ? updated : c)),
      };
    });
  };

  const handleSaveDesc = async () => {
    setSavingDesc(true);
    try {
      const updated = await nichesApi.update(projectId, slug, { description: descDraft.trim() || undefined });
      setNiche((prev) => prev ? { ...prev, description: updated.description } : prev);
      setEditingDesc(false);
    } finally {
      setSavingDesc(false);
    }
  };

  const handleSaveBrief = async (brief: NicheBrief) => {
    await nichesApi.update(projectId, slug, { brief });
    setNiche((prev) => (prev ? { ...prev, brief } : prev));
  };

  // ── Computed state ──────────────────────────────────────────────────────────
  const keywordCount = queries.length;
  const promptCount = promptsList.length;
  const ruleCount = rules.length;
  const seoCompleted = queries.some((q) => q.last_fetched_at !== null);
  const geoCompleted = geoRuns.some((r) => r.status === "completed");
  const analysisRan = seoCompleted || geoCompleted;
  const isConfigured = keywordCount > 0 && promptCount > 0;
  const hasCompetitors = niche.competitors.length > 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a la campaña
        </Link>
      </div>

      {/* Niche header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-comic-ink bg-comic-rust/10">
          <Target className="h-5 w-5 text-comic-rust" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black text-comic-ink">{niche.name}</h2>

          {/* Description — inline editable */}
          {editingDesc ? (
            <div className="mt-1 space-y-1.5">
              <textarea
                autoFocus
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                rows={4}
                className="w-full rounded-sm border-2 border-comic-ink/30 bg-white px-2.5 py-1.5 text-sm text-comic-ink focus:border-comic-ink focus:outline-none resize-y"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveDesc}
                  disabled={savingDesc}
                  className="flex items-center gap-1 rounded-sm border-2 border-comic-ink bg-comic-yellow px-2.5 py-1 text-[11px] font-black text-comic-ink disabled:opacity-50"
                >
                  <Check className="h-3 w-3" />
                  {savingDesc ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={() => setEditingDesc(false)}
                  className="flex items-center gap-1 rounded-sm border border-comic-ink/20 px-2.5 py-1 text-[11px] text-comic-ink-soft hover:text-comic-ink"
                >
                  <X className="h-3 w-3" />
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div
              className="group relative mt-0.5 cursor-pointer rounded-sm hover:bg-comic-aged/30 transition-colors -mx-1 px-1 py-0.5"
              onClick={() => { setDescDraft(niche.description ?? ""); setEditingDesc(true); }}
              title="Haz clic para editar la descripción"
            >
              {niche.description ? (
                <p className="text-sm text-comic-ink-soft pr-14">{niche.description}</p>
              ) : (
                <p className="text-sm text-comic-ink-soft/40 italic pr-14">Añadir descripción del nicho...</p>
              )}
              <span className="absolute right-1 top-0.5 flex items-center gap-0.5 rounded-sm border border-comic-ink/20 bg-white px-1.5 py-0.5 text-[10px] text-comic-ink-soft opacity-0 group-hover:opacity-100 transition-opacity">
                <Pencil className="h-2.5 w-2.5" />
                Editar
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Brief modules A-D */}
      <BriefEditor
        projectId={projectId}
        nicheSlug={slug}
        brief={niche.brief}
        onSave={handleSaveBrief}
      />

      {/* Competitors */}
      <section className="max-w-lg">
        <CompetitorList
          projectId={projectId}
          nicheSlug={slug}
          competitors={niche.competitors}
          allBrands={allBrands}
          onAdd={handleAddExisting}
          onAddNew={handleAddNew}
          onRemove={handleRemove}
          onBrandUpdated={handleBrandUpdated}
        />
      </section>

      {/* ═══ The two main blocks — only visible once competitors are added ═══ */}
      {hasCompetitors && (
        <section className="space-y-4">

          {/* ── Sancho prompt ─────────────────────────────────────────────────── */}
          <div className="relative rounded-sm border-2 border-comic-ink bg-comic-yellow/30 px-4 py-3 shadow-comic-xs">
            {/* Speech bubble tail */}
            <div className="absolute -top-2.5 left-6 h-0 w-0 border-l-[8px] border-r-[8px] border-b-[10px] border-l-transparent border-r-transparent border-b-comic-ink" />
            <div className="absolute -top-[8px] left-[25px] h-0 w-0 border-l-[9px] border-r-[9px] border-b-[11px] border-l-transparent border-r-transparent border-b-comic-yellow/30" />
            <p className="text-[11px] font-black text-comic-ink uppercase tracking-wide mb-0.5">
              Sancho
            </p>
            <p className="text-sm text-comic-ink italic leading-snug">
              &ldquo;Dígame vuesa merced, ¿cómo quiere proceder ahora?&rdquo;
            </p>
            <p className="mt-1.5 text-[11px] text-comic-ink-soft">
              Elige una estrategia — puedes trabajar ambas en paralelo
            </p>
          </div>

          <h3 className="text-sm font-black text-comic-ink uppercase tracking-wide">
            Estrategia de contenido
          </h3>

          {/* ── Block 1: Partnerships ────────────────────────────────────────── */}
          <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
            <div className="flex items-start gap-4 p-5">
              {/* Icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-comic-ink bg-comic-cyan/10">
                <Handshake className="h-5 w-5 text-comic-navy" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-base font-black text-comic-ink">Partnerships</div>
                    <div className="text-xs text-comic-ink-soft mt-0.5">
                      Dónde publicar — identifica medios editoriales para ganar visibilidad en Google e IAs
                    </div>
                  </div>
                  {analysisRan && (
                    <span className="flex items-center gap-1 rounded-sm bg-comic-sage/10 border border-comic-sage px-2 py-0.5 text-[10px] font-bold text-comic-sage shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                      Análisis completado
                    </span>
                  )}
                </div>

                {/* Steps */}
                <div className="mt-3 space-y-1.5">
                  <StepRow
                    done={keywordCount > 0}
                    label="Keywords SEO configuradas"
                    detail={keywordCount > 0 ? `(${keywordCount})` : undefined}
                  />
                  <StepRow
                    done={promptCount > 0}
                    label="Prompts GEO configurados"
                    detail={promptCount > 0 ? `(${promptCount})` : undefined}
                  />
                  {ruleCount > 0 && (
                    <StepRow
                      done={true}
                      label="Reglas de exclusión activas"
                      detail={`(${ruleCount})`}
                    />
                  )}
                  <StepRow
                    done={seoCompleted}
                    label="Análisis SERP ejecutado"
                  />
                  <StepRow
                    done={geoCompleted}
                    label="Análisis GEO ejecutado"
                  />
                </div>

                {/* CTAs */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => router.push(`/projects/${projectId}/niches/${slug}/configure`)}
                    className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-paper px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Configurar
                  </button>

                  <button
                    onClick={() => router.push(`/projects/${projectId}/niches/${slug}/analyze`)}
                    disabled={!isConfigured}
                    className={cn(
                      "flex items-center gap-1.5 rounded-sm border-2 border-comic-ink px-3 py-1.5 text-xs font-bold shadow-comic-xs transition-all",
                      isConfigured
                        ? "bg-comic-yellow text-comic-ink hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                        : "bg-comic-aged text-comic-ink-soft cursor-not-allowed"
                    )}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {analysisRan ? "Re-analizar" : "Ejecutar análisis"}
                  </button>

                  {analysisRan && (
                    <button
                      onClick={() => router.push(`/projects/${projectId}/niches/${slug}/results`)}
                      className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-navy text-white px-3 py-1.5 text-xs font-bold shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      Ver resultados
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {!isConfigured && (
                  <p className="mt-2 text-[11px] text-comic-ink-soft">
                    Añade al menos 1 keyword y 1 prompt para poder ejecutar el análisis.
                  </p>
                )}
              </div>
            </div>

            {/* Bottom hint */}
            <div className="border-t border-comic-ink/10 bg-comic-aged/30 px-5 py-2 flex items-center gap-4 text-[10px] text-comic-ink-soft">
              <span className="flex items-center gap-1"><Search className="h-3 w-3" /> Keywords SEO</span>
              <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Prompts GEO</span>
              <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Exclusiones</span>
            </div>
          </div>

          {/* ── Block 2: Dominar SEO ─────────────────────────────────────────── */}
          <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
            <div className="flex items-start gap-4 p-5">
              {/* Icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-comic-ink bg-comic-rust/10">
                <Zap className="h-5 w-5 text-comic-rust" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-base font-black text-comic-ink">Dominar SEO</div>
                    <div className="text-xs text-comic-ink-soft mt-0.5">
                      Qué publicar — descubre qué keywords posicionan tus competidores y genera artículos listos para publicar
                    </div>
                  </div>
                  {articleCount > 0 && (
                    <span className="flex items-center gap-1 rounded-sm bg-comic-rust/10 border border-comic-rust/30 px-2 py-0.5 text-[10px] font-bold text-comic-rust shrink-0">
                      <FileText className="h-3 w-3" />
                      {articleCount} artículo{articleCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Steps */}
                <div className="mt-3 space-y-1.5">
                  <StepRow
                    done={false}
                    label="Analiza los dominios competidores en DataForSEO"
                  />
                  <StepRow
                    done={false}
                    label="Selecciona keywords por volumen de búsqueda, EV, CPC y KD"
                  />
                  <StepRow
                    done={articleCount > 0}
                    label="Genera artículos optimizados con IA"
                    detail={articleCount > 0 ? `(${articleCount} generados)` : undefined}
                  />
                </div>

                {/* CTAs */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => router.push(`/projects/${projectId}/niches/${slug}/dominar`)}
                    className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Investigar keywords
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>

                  {articleCount > 0 && (
                    <button
                      onClick={() => router.push(`/projects/${projectId}/niches/${slug}/contenido`)}
                      className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-paper px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Ver artículos
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom hint */}
            <div className="border-t border-comic-ink/10 bg-comic-aged/30 px-5 py-2 flex items-center gap-4 text-[10px] text-comic-ink-soft">
              <span>Volumen mensual</span>
              <span>EV estimado</span>
              <span>CPC</span>
              <span>Keyword Difficulty</span>
            </div>
          </div>

          {/* ── Block 3: Influencers ──────────────────────────────────────────── */}
          <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
            <div className="flex items-start gap-4 p-5">
              {/* Icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-comic-ink bg-comic-rust/10">
                <Users className="h-5 w-5 text-comic-rust" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-base font-black text-comic-ink">Influencers</div>
                    <div className="text-xs text-comic-ink-soft mt-0.5">
                      Quién amplifica — creadores de YouTube e Instagram relevantes para ganar visibilidad orgánica
                    </div>
                  </div>
                  {influencerCount > 0 && (
                    <span className="flex items-center gap-1 rounded-sm bg-comic-rust/10 border border-comic-rust/30 px-2 py-0.5 text-[10px] font-bold text-comic-rust shrink-0">
                      <Users className="h-3 w-3" />
                      {influencerCount} perfil{influencerCount !== 1 ? "es" : ""}
                    </span>
                  )}
                </div>

                {/* Steps */}
                <div className="mt-3 space-y-1.5">
                  <StepRow
                    done={influencerCount > 0}
                    label="Búsqueda de influencers ejecutada"
                    detail={influencerCount > 0 ? `(${influencerCount} perfiles encontrados)` : undefined}
                  />
                  <StepRow
                    done={false}
                    label="Valida relevancia y audiencia"
                  />
                  <StepRow
                    done={false}
                    label="Contacta para colaboraciones o menciones"
                  />
                </div>

                {/* CTAs */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => router.push(`/projects/${projectId}/niches/${slug}/influencers`)}
                    className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                  >
                    <Users className="h-3.5 w-3.5" />
                    {influencerCount > 0 ? "Ver influencers" : "Buscar influencers"}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom hint */}
            <div className="border-t border-comic-ink/10 bg-comic-aged/30 px-5 py-2 flex items-center gap-4 text-[10px] text-comic-ink-soft">
              <span className="flex items-center gap-1"><span className="font-bold">▶</span> YouTube</span>
              <span className="flex items-center gap-1"><span className="font-bold">◉</span> Instagram</span>
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Audiencia verificada</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
