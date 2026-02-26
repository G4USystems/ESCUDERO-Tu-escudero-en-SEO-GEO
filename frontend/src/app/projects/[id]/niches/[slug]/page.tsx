"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  ChevronRight,
  Play,
  BarChart3,
  Handshake,
  Zap,
  FileText,
  Settings,
  Users,
  Pencil,
  Check,
  X,
  CheckCircle2,
  Circle,
  RefreshCw,
} from "lucide-react";

function StepRow({ done, label, detail }: { done: boolean; label: string; detail?: string }) {
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
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const slug = params.slug as string;
  const forceConfig = searchParams.get("config") === "1";

  const [niche, setNiche] = useState<NicheDetail | null>(null);
  const [allBrands, setAllBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline description editing
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);

  // Full state for modules view
  const [queries, setQueries] = useState<SerpQuery[]>([]);
  const [rules, setRules] = useState<ExclusionRule[]>([]);
  const [geoRuns, setGeoRuns] = useState<GeoRun[]>([]);
  const [articleCount, setArticleCount] = useState(0);
  const [influencerCount, setInfluencerCount] = useState(0);
  const [keywordCount, setKeywordCount] = useState(0);
  const [promptCount, setPromptCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [, nicheData, brandsData, q, proms, rl, gRuns, briefs, infResults] = await Promise.all([
        projectsApi.get(projectId),
        nichesApi.get(projectId, slug),
        projectsApi.listBrands(projectId),
        seo.listQueries(projectId, slug).catch(() => [] as SerpQuery[]),
        promptsApi.list(projectId).catch(() => []),
        domains.listRules(projectId).catch(() => [] as ExclusionRule[]),
        geo.listRuns(projectId).catch(() => [] as GeoRun[]),
        content.listBriefs(projectId, slug).catch(() => []),
        influencersApi.listResults(projectId, slug).catch(() => []),
      ]);
      setNiche(nicheData);
      setAllBrands(brandsData);
      setQueries(q);
      setKeywordCount(q.length);
      setPromptCount(proms.filter((p: { niche_id: string | null }) => p.niche_id === nicheData.id).length);
      setRules(rl);
      setGeoRuns(gRuns);
      setArticleCount(briefs.filter((b: { status: string }) => b.status === "generated" || b.status === "approved").length);
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
      return { ...prev, competitors: prev.competitors.map((c) => (c.id === updated.id ? updated : c)) };
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

  // ── Computed state ────────────────────────────────────────────────────────────
  const hasCompetitors = niche.competitors.length > 0;
  const ruleCount = rules.length;
  const seoCompleted = queries.some((q) => q.last_fetched_at !== null);
  const geoCompleted = geoRuns.some((r) => r.status === "completed");
  const analysisRan = seoCompleted || geoCompleted;
  const isConfigured = keywordCount > 0 && promptCount > 0;

  // ── Niche header (shared between both views) ──────────────────────────────────
  const nicheHeader = (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-comic-ink bg-comic-rust/10">
        <Target className="h-5 w-5 text-comic-rust" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-black text-comic-ink">{niche.name}</h2>
        {editingDesc ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              autoFocus
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              rows={3}
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
          >
            {niche.description ? (
              <p className="text-sm text-comic-ink-soft pr-14">{niche.description}</p>
            ) : (
              <p className="text-sm text-comic-ink-soft/40 italic pr-14">Añadir descripción...</p>
            )}
            <span className="absolute right-1 top-0.5 flex items-center gap-0.5 rounded-sm border border-comic-ink/20 bg-white px-1.5 py-0.5 text-[10px] text-comic-ink-soft opacity-0 group-hover:opacity-100 transition-opacity">
              <Pencil className="h-2.5 w-2.5" />
              Editar
            </span>
          </div>
        )}
      </div>
    </div>
  );

  // ── VIEW A: not configured OR forced config mode → config form ───────────────
  if (!hasCompetitors || forceConfig) {
    return (
      <div className="space-y-6">
        <div>
          <Link href={`/projects/${projectId}`} className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a la campaña
          </Link>
        </div>

        {nicheHeader}

        <BriefEditor projectId={projectId} nicheSlug={slug} brief={niche.brief} onSave={handleSaveBrief} />

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

        {hasCompetitors ? (
          <div className="pt-2">
            <button
              onClick={() => router.push(`/projects/${projectId}/niches/${slug}`)}
              className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            >
              Guardar
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-comic-ink-soft/60 italic">
            Añade al menos un competidor para poder continuar.
          </p>
        )}
      </div>
    );
  }

  // ── VIEW B: configured → 3 strategy modules ──────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link href={`/projects/${projectId}`} className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a la campaña
        </Link>
        {/* Edit config link */}
        <Link
          href={`/projects/${projectId}/niches/${slug}/configure`}
          className="inline-flex items-center gap-1 text-[11px] text-comic-ink-soft hover:text-comic-ink transition-colors"
        >
          <Settings className="h-3 w-3" />
          Editar configuración
        </Link>
      </div>

      {nicheHeader}

      {/* ── Block 1: Partnerships ─────────────────────────────────────────── */}
      <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
        <div className="flex items-start gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-comic-ink bg-comic-cyan/10">
            <Handshake className="h-5 w-5 text-comic-navy" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-base font-black text-comic-ink">Partnerships</div>
                <div className="text-xs text-comic-ink-soft mt-0.5">
                  Tus competidores ya aparecen en medios editoriales independientes. Analiza dónde están ellos y dónde no estás tú — esos son tus mejores candidatos para conseguir menciones, reviews y artículos patrocinados.
                </div>
              </div>
              {analysisRan && (
                <span className="flex items-center gap-1 rounded-sm bg-comic-sage/10 border border-comic-sage px-2 py-0.5 text-[10px] font-bold text-comic-sage shrink-0">
                  <CheckCircle2 className="h-3 w-3" />
                  Análisis completado
                </span>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              <StepRow done={keywordCount > 0} label="Keywords SEO configuradas" detail={keywordCount > 0 ? `(${keywordCount})` : undefined} />
              <StepRow done={promptCount > 0} label="Prompts GEO configurados" detail={promptCount > 0 ? `(${promptCount})` : undefined} />
              {ruleCount > 0 && <StepRow done={true} label="Reglas de exclusión activas" detail={`(${ruleCount})`} />}
              <StepRow done={seoCompleted} label="Análisis SERP ejecutado" />
              <StepRow done={geoCompleted} label="Análisis GEO ejecutado" />
            </div>
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
                Añade al menos 1 keyword y 1 prompt para ejecutar el análisis.
              </p>
            )}
          </div>
        </div>
        <div className="border-t border-comic-ink/10 bg-comic-aged/30 px-5 py-2 flex items-center gap-4 text-[10px] text-comic-ink-soft">
          <span>Keywords SEO</span>
          <span>Prompts GEO</span>
          <span>Exclusiones</span>
        </div>
      </div>

      {/* ── Block 2: Dominar SEO ──────────────────────────────────────────── */}
      <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
        <div className="flex items-start gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-comic-ink bg-comic-rust/10">
            <Zap className="h-5 w-5 text-comic-rust" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-base font-black text-comic-ink">Dominar SEO</div>
                <div className="text-xs text-comic-ink-soft mt-0.5">
                  Descubre las keywords donde rankean tus competidores pero tú no apareces. Genera artículos optimizados con IA para publicarlos en tu web y reclamar esas posiciones.
                </div>
              </div>
              {articleCount > 0 && (
                <span className="flex items-center gap-1 rounded-sm bg-comic-rust/10 border border-comic-rust/30 px-2 py-0.5 text-[10px] font-bold text-comic-rust shrink-0">
                  <FileText className="h-3 w-3" />
                  {articleCount} artículo{articleCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              <StepRow done={false} label="Analiza los dominios competidores en DataForSEO" />
              <StepRow done={false} label="Selecciona keywords por volumen, EV, CPC y KD" />
              <StepRow done={articleCount > 0} label="Genera artículos optimizados con IA" detail={articleCount > 0 ? `(${articleCount} generados)` : undefined} />
            </div>
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
        <div className="border-t border-comic-ink/10 bg-comic-aged/30 px-5 py-2 flex items-center gap-4 text-[10px] text-comic-ink-soft">
          <span>Volumen mensual</span>
          <span>EV estimado</span>
          <span>CPC</span>
          <span>Keyword Difficulty</span>
        </div>
      </div>

      {/* ── Block 3: Influencers ─────────────────────────────────────────── */}
      <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
        <div className="flex items-start gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-comic-ink bg-comic-rust/10">
            <Users className="h-5 w-5 text-comic-rust" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-base font-black text-comic-ink">Influencers</div>
                <div className="text-xs text-comic-ink-soft mt-0.5">
                  Encuentra creadores de YouTube e Instagram con audiencia en este nicho. Genera el brief editorial con IA y actívalos para que presenten tu marca a su comunidad.
                </div>
              </div>
              {influencerCount > 0 && (
                <span className="flex items-center gap-1 rounded-sm bg-comic-rust/10 border border-comic-rust/30 px-2 py-0.5 text-[10px] font-bold text-comic-rust shrink-0">
                  <Users className="h-3 w-3" />
                  {influencerCount} perfil{influencerCount !== 1 ? "es" : ""}
                </span>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              <StepRow done={influencerCount > 0} label="Búsqueda de influencers ejecutada" detail={influencerCount > 0 ? `(${influencerCount} encontrados)` : undefined} />
              <StepRow done={false} label="Valida relevancia y audiencia" />
              <StepRow done={false} label="Contacta para colaboraciones o menciones" />
            </div>
            <div className="mt-4">
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
        <div className="border-t border-comic-ink/10 bg-comic-aged/30 px-5 py-2 flex items-center gap-4 text-[10px] text-comic-ink-soft">
          <span>▶ YouTube</span>
          <span>◉ Instagram</span>
          <span>Audiencia verificada</span>
        </div>
      </div>

      {/* ── Reconfigure hint ──────────────────────────────────────────────── */}
      <div className="rounded-sm border border-comic-ink/15 bg-comic-aged/40 px-4 py-3 flex items-start gap-3">
        <RefreshCw className="h-4 w-4 text-comic-ink-soft shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] text-comic-ink-soft leading-relaxed">
            <span className="font-bold text-comic-ink">¿Los resultados no son los esperados?</span>{" "}
            Revisa la configuración del nicho — puedes ajustar el brief, añadir competidores o reconfigurar las keywords y prompts.
          </p>
          <Link
            href={`/projects/${projectId}/niches/${slug}/configure`}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-comic-rust hover:underline"
          >
            <Settings className="h-3 w-3" />
            Reconfigurar nicho →
          </Link>
        </div>
      </div>
    </div>
  );
}
