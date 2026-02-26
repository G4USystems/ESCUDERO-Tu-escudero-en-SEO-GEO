"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  niches as nichesApi,
  projects as projectsApi,
  content,
  type NicheDetail,
  type ProjectDetail,
  type ContentBriefItem,
  type KeywordSuggestion,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Zap,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  Pencil,
  Check,
  X,
  Search,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Globe,
} from "lucide-react";

function ColHeader({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span className="group relative inline-flex items-center gap-0.5 cursor-help">
      {label}
      <span className="text-[9px] text-comic-ink-soft/50 leading-none">ⓘ</span>
      {/* Tooltip opens downward to avoid overflow-hidden clipping */}
      <span className="pointer-events-none absolute top-full right-0 mt-1.5 z-50 w-52 rounded-sm border border-comic-ink/20 bg-white px-2.5 py-2 text-[11px] text-comic-ink leading-snug shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal text-left font-normal normal-case tracking-normal">
        {tooltip}
      </span>
    </span>
  );
}

function formatVol(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  if (v >= 10_000) return `${Math.round(v / 1000)}K`;
  if (v >= 1_000) return `${(v / 1000).toFixed(1)}K`;
  return String(v);
}

function formatCpc(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return `$${v.toFixed(2)}`;
}

function kdColor(kd: number | null | undefined): string {
  if (kd == null) return "text-comic-ink-soft";
  if (kd <= 30) return "text-emerald-600 font-bold";
  if (kd <= 60) return "text-amber-600 font-bold";
  return "text-red-600 font-bold";
}

export default function DominarPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const slug = params.slug as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [niche, setNiche] = useState<NicheDetail | null>(null);
  const [briefs, setBriefs] = useState<ContentBriefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommending, setRecommending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<KeywordSuggestion[]>([]);
  const [activeTab, setActiveTab] = useState<"keywords" | "prompts">("keywords");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [manualKeyword, setManualKeyword] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [proj, nicheData, briefsList] = await Promise.all([
        projectsApi.get(projectId),
        nichesApi.get(projectId, slug),
        content.listBriefs(projectId, slug),
      ]);
      setProject(proj);
      setNiche(nicheData);
      setBriefs(briefsList);
    } catch (e) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRecommend = async () => {
    setRecommending(true);
    try {
      await content.recommend(projectId, slug);
      setBriefs(await content.listBriefs(projectId, slug));
    } finally {
      setRecommending(false);
    }
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    setSuggestions([]);
    try {
      setSuggestions(await content.suggestKeywords(projectId, slug, 20));
    } finally {
      setSuggesting(false);
    }
  };

  const handleAddSuggestion = async (s: KeywordSuggestion) => {
    const added = await content.addManual(projectId, { niche: slug, keyword: s.keyword, category: s.category });
    setBriefs((prev) => [...prev, added]);
    setSuggestions((prev) => prev.filter((x) => x.keyword !== s.keyword));
  };

  const handleToggleSelect = async (brief: ContentBriefItem) => {
    const next = brief.status === "selected" ? "recommended" : "selected";
    await content.updateBrief(brief.id, { status: next });
    setBriefs((prev) => prev.map((b) => (b.id === brief.id ? { ...b, status: next } : b)));
  };

  const handleDelete = async (id: string) => {
    await content.deleteBrief(id);
    setBriefs((prev) => prev.filter((b) => b.id !== id));
  };

  const handleStartEdit = (brief: ContentBriefItem) => {
    setEditingId(brief.id);
    setEditingText(brief.keyword);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingText.trim()) return;
    await content.updateBrief(id, { keyword: editingText.trim() });
    setBriefs((prev) => prev.map((b) => (b.id === id ? { ...b, keyword: editingText.trim() } : b)));
    setEditingId(null);
  };

  const handleAddManual = async () => {
    const kw = manualKeyword.trim();
    if (!kw) return;
    const added = await content.addManual(projectId, { niche: slug, keyword: kw });
    setBriefs((prev) => [...prev, added]);
    setManualKeyword("");
  };

  if (loading) return <div className="py-8 text-center text-comic-ink-soft">Cargando...</div>;
  if (!project || !niche) return <div className="py-8 text-center text-comic-ink-soft">No encontrado.</div>;

  const recType = activeTab === "keywords" ? "keyword" : "prompt";
  const q = searchQuery.toLowerCase().trim();
  const tabBriefs = briefs
    .filter((b) => b.recommendation_type === recType)
    .filter((b) => !q || b.keyword.toLowerCase().includes(q))
    .sort((a, b) => {
      // Selected first, then by volume (desc)
      if (a.status === "selected" && b.status !== "selected") return -1;
      if (b.status === "selected" && a.status !== "selected") return 1;
      return (b.search_volume ?? 0) - (a.search_volume ?? 0);
    });

  const selectedCount = briefs.filter((b) => b.status === "selected").length;
  const competitorsWithDomain = niche.competitors.filter((c) => c.domain);
  const hasDomains = competitorsWithDomain.length > 0;

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
          <Zap className="h-5 w-5 text-comic-cyan" />
          Dominar SEO — Keywords
        </h2>
        <p className="mt-1 text-sm text-comic-ink-soft">
          Keywords donde rankean tus competidores en &quot;{niche.name}&quot; pero tú todavía no. Selecciona las que te interesan y genera artículos optimizados con IA listos para publicar en tu blog.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b-2 border-comic-ink/20">
        {(["keywords", "prompts"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSearchQuery(""); }}
            className={cn(
              "px-4 py-2 text-sm font-bold transition-colors relative",
              activeTab === tab ? "text-comic-ink" : "text-comic-ink-soft hover:text-comic-ink"
            )}
          >
            {tab === "keywords" ? "Keywords" : "GEO Prompts"}
            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-comic-rust" />}
          </button>
        ))}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleRecommend}
          disabled={recommending}
          className="flex items-center gap-2 rounded-sm border-2 border-comic-ink bg-comic-yellow px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-50"
        >
          {recommending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
          {recommending ? "Analizando..." : "Analizar Competencia"}
        </button>

        {/* Generar Artículos — also at the top so user doesn't need to scroll */}
        {selectedCount > 0 && (
          <button
            onClick={() => router.push(`/projects/${projectId}/niches/${slug}/dominar/generate`)}
            className="flex items-center gap-2 rounded-sm border-2 border-comic-ink bg-comic-rust px-4 py-2 text-sm font-bold text-white shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          >
            <ArrowRight className="h-4 w-4" />
            Generar {selectedCount} artículo{selectedCount !== 1 ? "s" : ""}
          </button>
        )}

        {activeTab === "keywords" && (
          <button
            onClick={handleSuggest}
            disabled={suggesting}
            className="flex items-center gap-2 rounded-sm border-2 border-comic-ink bg-comic-paper px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-50"
          >
            {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-comic-rust" />}
            {suggesting ? "Generando..." : "Sugerir con IA"}
          </button>
        )}

        {/* Manual add */}
        {activeTab === "keywords" && (
          <div className="flex items-center gap-1 ml-auto">
            <input
              type="text"
              value={manualKeyword}
              onChange={(e) => setManualKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddManual()}
              placeholder="Añadir keyword..."
              className="rounded-sm border-2 border-comic-ink/30 bg-comic-paper px-3 py-1.5 text-xs placeholder:text-comic-ink-soft/50 focus:border-comic-rust focus:outline-none w-44"
            />
            <button
              onClick={handleAddManual}
              disabled={!manualKeyword.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-sm border-2 border-comic-ink bg-comic-rust text-white shadow-comic-xs disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Warning: competitors without domains */}
      {!hasDomains && (
        <div className="flex items-start gap-3 rounded-sm border-2 border-amber-400/60 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 space-y-1">
            <p className="font-bold">Los competidores no tienen dominio configurado</p>
            <p>
              Para buscar las keywords donde rankean en DataForSEO, cada competidor necesita un dominio
              (ej: <span className="font-mono">revolut.com</span>). Edítalos en la sección de competidores del nicho.
            </p>
          </div>
          <Globe className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        </div>
      )}

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="rounded-sm border-2 border-comic-rust/30 bg-comic-rust/5 p-3 space-y-2">
          <p className="text-xs font-bold text-comic-rust flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            {suggestions.length} keywords sugeridos por IA — clic para añadir
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.keyword}
                onClick={() => handleAddSuggestion(s)}
                title={s.rationale}
                className="flex items-center gap-1.5 rounded-sm border border-comic-ink/20 bg-white px-2 py-1 text-xs hover:border-comic-rust hover:bg-comic-rust/5 transition-colors"
              >
                <Plus className="h-3 w-3 text-comic-rust shrink-0" />
                <span className="font-medium">{s.keyword}</span>
                {s.volume != null && s.volume > 0 && (
                  <span className="text-[10px] text-comic-ink-soft">{formatVol(s.volume)}/mo</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      {tabBriefs.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-comic-ink-soft pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === "keywords" ? "Buscar keywords..." : "Buscar prompts..."}
            className="w-full rounded-sm border-2 border-comic-ink/30 bg-comic-paper pl-8 pr-3 py-1.5 text-xs placeholder:text-comic-ink-soft/50 focus:border-comic-rust focus:outline-none"
          />
        </div>
      )}

      {/* ═══ Keywords table ═══ */}
      {activeTab === "keywords" && (
        <>
          {tabBriefs.length > 0 ? (
            <div className="rounded-sm border-2 border-comic-ink overflow-visible">
              {/* Table header */}
              <div className="grid grid-cols-[auto_1fr_72px_60px_60px_52px_64px] items-center gap-x-3 border-b-2 border-comic-ink bg-comic-aged/50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-comic-ink-soft relative z-10">
                <span />
                <span>Keyword</span>
                <span className="text-right">
                  <ColHeader label="Search/mo" tooltip="Búsquedas mensuales promedio en Google para esta keyword (España)." />
                </span>
                <span className="text-right">
                  <ColHeader label="EV" tooltip="Estimated Visits — tráfico mensual estimado que recibirías si rankeas en la posición actual del competidor. Se calcula con la curva de CTR por posición." />
                </span>
                <span className="text-right">
                  <ColHeader label="CPC" tooltip="Coste por clic en Google Ads. Un CPC alto indica intención comercial fuerte — es señal de que la keyword vale dinero." />
                </span>
                <span className="text-right">
                  <ColHeader label="Dif. SEO" tooltip="Dificultad SEO (0–100). Verde ≤30 = fácil de rankear. Ámbar 31–60 = competido. Rojo >60 = muy difícil." />
                </span>
                <span />
              </div>

              {/* Rows */}
              <div className="divide-y divide-comic-ink/10">
                {tabBriefs.map((brief) => {
                  const isSelected = brief.status === "selected";
                  const isEditing = editingId === brief.id;

                  return (
                    <div
                      key={brief.id}
                      className={cn(
                        "grid grid-cols-[auto_1fr_72px_60px_60px_52px_64px] items-center gap-x-3 px-3 py-2",
                        isSelected ? "bg-comic-sage/5" : "bg-comic-paper hover:bg-comic-aged/20"
                      )}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => !isEditing && handleToggleSelect(brief)}
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                          isSelected
                            ? "border-comic-sage bg-comic-sage text-white"
                            : "border-comic-ink/30 hover:border-comic-sage"
                        )}
                      >
                        {isSelected && <CheckCircle2 className="h-3 w-3" />}
                      </button>

                      {/* Keyword (editable) */}
                      {isEditing ? (
                        <div className="flex items-center gap-1 col-span-6">
                          <input
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(brief.id)}
                            className="flex-1 rounded-sm border-2 border-comic-rust/50 bg-white px-2 py-0.5 text-xs focus:outline-none"
                            autoFocus
                          />
                          <button onClick={() => handleSaveEdit(brief.id)} className="text-comic-sage hover:text-comic-sage/70">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-comic-ink-soft hover:text-red-500">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs font-medium text-comic-ink truncate">{brief.keyword}</span>
                          <span className="text-right text-xs tabular-nums text-comic-ink">{formatVol(brief.search_volume)}</span>
                          <span className="text-right text-xs tabular-nums text-comic-ink-soft">{formatVol(brief.ev)}</span>
                          <span className="text-right text-xs tabular-nums text-comic-ink-soft">{formatCpc(brief.cpc)}</span>
                          <span className={cn("text-right text-xs tabular-nums", kdColor(brief.kd))}>
                            {brief.kd != null ? brief.kd : "—"}
                          </span>
                          {/* Actions */}
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleStartEdit(brief)}
                              className="text-comic-ink-soft hover:text-comic-rust transition-colors"
                              title="Editar"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDelete(brief.id)}
                              className="text-comic-ink-soft hover:text-red-500 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-sm border-2 border-comic-ink/20 bg-comic-aged/30 p-8 text-center space-y-2">
              <p className="text-sm font-bold text-comic-ink">Sin keywords todavía</p>
              <p className="text-xs text-comic-ink-soft">
                {hasDomains
                  ? `Haz clic en "Analizar Competencia" para buscar en DataForSEO las keywords donde rankean: ${competitorsWithDomain.map((c) => c.domain).join(", ")}`
                  : "Añade el dominio de cada competidor en la página del nicho y luego haz clic en \"Analizar Competencia\"."}
              </p>
            </div>
          )}
        </>
      )}

      {/* ═══ GEO Prompts list ═══ */}
      {activeTab === "prompts" && (
        <>
          {tabBriefs.length > 0 ? (
            <div className="rounded-sm border-2 border-comic-ink overflow-hidden divide-y divide-comic-ink/10">
              {tabBriefs.map((brief) => {
                const isSelected = brief.status === "selected";
                const isEditing = editingId === brief.id;
                const truncated = brief.keyword.length > 100
                  ? brief.keyword.slice(0, 100) + "..."
                  : brief.keyword;

                return (
                  <div
                    key={brief.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3",
                      isSelected ? "bg-comic-sage/5" : "bg-comic-paper hover:bg-comic-aged/20"
                    )}
                  >
                    <button
                      onClick={() => handleToggleSelect(brief)}
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                        isSelected ? "border-comic-sage bg-comic-sage text-white" : "border-comic-ink/30 hover:border-comic-sage"
                      )}
                    >
                      {isSelected && <CheckCircle2 className="h-3 w-3" />}
                    </button>

                    {isEditing ? (
                      <div className="flex flex-1 items-start gap-2">
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          rows={3}
                          className="flex-1 rounded-sm border-2 border-comic-rust/50 bg-white px-2 py-1 text-xs focus:outline-none resize-none"
                          autoFocus
                        />
                        <button onClick={() => handleSaveEdit(brief.id)} className="text-comic-sage hover:text-comic-sage/70 mt-1">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-comic-ink-soft hover:text-red-500 mt-1">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-xs text-comic-ink leading-relaxed">{truncated}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => handleStartEdit(brief)} className="text-comic-ink-soft hover:text-comic-rust transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => handleDelete(brief.id)} className="text-comic-ink-soft hover:text-red-500 transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-sm border-2 border-comic-ink/20 bg-comic-aged/30 p-8 text-center space-y-2">
              <p className="text-sm font-bold text-comic-ink">Sin prompts GEO todavía</p>
              <p className="text-xs text-comic-ink-soft">
                Haz clic en &quot;Analizar Competencia&quot; para detectar prompts relevantes.
              </p>
            </div>
          )}
        </>
      )}

      {/* ═══ Footer navigation ═══ */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => router.push(`/projects/${projectId}/niches/${slug}`)}
          className="flex items-center gap-2 rounded-sm border-2 border-comic-ink bg-comic-paper px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>

        <div className="flex items-center gap-3">
          {selectedCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-bold text-comic-sage">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {selectedCount} seleccionado{selectedCount !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={() => router.push(`/projects/${projectId}/niches/${slug}/dominar/generate`)}
            disabled={selectedCount === 0}
            className={cn(
              "flex items-center gap-2 rounded-sm border-2 border-comic-ink px-4 py-2 text-sm font-bold shadow-comic-xs transition-all",
              selectedCount > 0
                ? "bg-comic-yellow text-comic-ink hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                : "bg-comic-aged text-comic-ink-soft cursor-not-allowed"
            )}
          >
            Generar Artículos
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
