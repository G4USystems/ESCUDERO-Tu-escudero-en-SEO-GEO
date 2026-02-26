"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Search, Sparkles, Loader2, ChevronDown, ChevronUp, Info, Pencil, Trash2, Check, X } from "lucide-react";
import type { SerpQuery } from "@/lib/api";

/**
 * Strategic SEO Keyword Builder.
 *
 * Generates keyword suggestions organized by STRATEGIC CATEGORY:
 *   1. RANKING       — find editorial ranking/comparativa articles where you can get featured
 *   2. VS/ALTERNATIVA — intercept searches comparing or looking for alternatives to competitors
 *   3. REVIEW        — find where competitors are reviewed, get YOUR brand reviewed there
 *   4. SOLUCIÓN      — educational/guide content where your service type is discussed
 *   5. TRANSACCIONAL — high-intent keywords from people ready to buy/hire
 *   6. REPUTACIÓN    — monitor your own brand's search presence
 *
 * Uses company_type (from domain intelligence) instead of hardcoded patterns.
 */

type KeywordCategory = "ranking" | "vs" | "review" | "solution" | "transactional" | "reputation" | "content_gap" | "influencer";

interface KeywordSuggestion {
  keyword: string;
  type: KeywordCategory;
  selected: boolean;
}

const CURRENT_YEAR = "2026";

const CATEGORY_CONFIG: Record<
  KeywordCategory,
  { label: string; color: string; bgSelected: string; strategy: string }
> = {
  ranking: {
    label: "Ranking / Comparativa",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    bgSelected: "border-purple-300 bg-purple-50",
    strategy:
      "Encuentra artículos editoriales tipo 'mejores X en España'. Son las páginas donde tu marca necesita aparecer para SEO.",
  },
  vs: {
    label: "VS / Alternativas",
    color: "bg-orange-100 text-orange-800 border-orange-200",
    bgSelected: "border-orange-300 bg-orange-50",
    strategy:
      "Intercepta búsquedas de usuarios que comparan o buscan alternativas a tus competidores. Alta intención y oportunidad de captar tráfico.",
  },
  review: {
    label: "Review / Opiniones",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    bgSelected: "border-blue-300 bg-blue-50",
    strategy:
      "Identifica dónde se publican reviews de competidores. Consigue que tu marca también sea analizada en esos medios.",
  },
  solution: {
    label: "Solución / Guía",
    color: "bg-green-100 text-green-800 border-green-200",
    bgSelected: "border-green-300 bg-green-50",
    strategy:
      "Contenido educativo donde se discute tu categoría de servicio. Posiciónate como referente aportando conocimiento.",
  },
  transactional: {
    label: "Intención de compra",
    color: "bg-red-100 text-red-800 border-red-200",
    bgSelected: "border-red-300 bg-red-50",
    strategy:
      "Keywords de usuarios listos para contratar. Aparece en las páginas que Google muestra para estas búsquedas comerciales.",
  },
  reputation: {
    label: "Reputación de marca",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    bgSelected: "border-amber-300 bg-amber-50",
    strategy:
      "Monitorea tu propia presencia en Google. Asegúrate de que tu marca aparece correctamente cuando buscan por ti.",
  },
  content_gap: {
    label: "Gap de contenido",
    color: "bg-teal-100 text-teal-800 border-teal-200",
    bgSelected: "border-teal-300 bg-teal-50",
    strategy:
      "Identifica los medios y blogs que ya publican sobre tu sector. Son oportunidades para publicar artículos patrocinados, guest posts o conseguir menciones editoriales.",
  },
  influencer: {
    label: "Influencers / YouTube",
    color: "bg-pink-100 text-pink-800 border-pink-200",
    bgSelected: "border-pink-300 bg-pink-50",
    strategy:
      "Encuentra vídeos de YouTube y creadores que posicionan en Google para tu sector. Son influencers potenciales para colaboraciones y menciones.",
  },
};

function generateSuggestions(
  nicheName: string,
  _nicheDescription: string | null,
  competitorNames: string[],
  brandName: string,
  _market: string,
  language: string,
  clientCompanyType: string | null,
): KeywordSuggestion[] {
  const suggestions: KeywordSuggestion[] = [];
  const nicheLC = nicheName.toLowerCase();
  const isSpanish = language === "es";
  const companyType = clientCompanyType || nicheLC;
  const hasDistinctNiche = clientCompanyType && clientCompanyType.toLowerCase() !== nicheLC;

  if (isSpanish) {
    // ── RANKING / COMPARATIVA ──────────────────────────────────────
    suggestions.push({ keyword: `mejores ${companyType} España`, type: "ranking", selected: true });
    suggestions.push({ keyword: `mejores ${companyType} España ${CURRENT_YEAR}`, type: "ranking", selected: true });
    suggestions.push({ keyword: `comparativa ${companyType} España`, type: "ranking", selected: true });
    suggestions.push({ keyword: `top ${companyType} España ${CURRENT_YEAR}`, type: "ranking", selected: true });
    suggestions.push({ keyword: `ranking ${companyType} España`, type: "ranking", selected: false });
    if (hasDistinctNiche) {
      suggestions.push({ keyword: `mejores ${companyType} para ${nicheLC}`, type: "ranking", selected: true });
      suggestions.push({ keyword: `${companyType} para empresas ${nicheLC}`, type: "ranking", selected: true });
      suggestions.push({ keyword: `mejores ${companyType} para startups ${nicheLC}`, type: "ranking", selected: false });
    }

    // ── VS / ALTERNATIVAS ──────────────────────────────────────────
    for (const comp of competitorNames.slice(0, 4)) {
      suggestions.push({ keyword: `${brandName} vs ${comp}`, type: "vs", selected: true });
      suggestions.push({ keyword: `alternativas a ${comp}`, type: "vs", selected: true });
    }
    if (competitorNames.length >= 2) {
      suggestions.push({
        keyword: `${competitorNames[0]} vs ${competitorNames[1]}`,
        type: "vs",
        selected: false,
      });
    }

    // ── REVIEW / OPINIONES ─────────────────────────────────────────
    for (const comp of competitorNames.slice(0, 5)) {
      suggestions.push({ keyword: `${comp} opiniones`, type: "review", selected: true });
      suggestions.push({ keyword: `${comp} opiniones ${CURRENT_YEAR}`, type: "review", selected: false });
    }
    suggestions.push({ keyword: `${brandName} opiniones`, type: "reputation", selected: true });
    suggestions.push({ keyword: `${brandName} opiniones ${CURRENT_YEAR}`, type: "reputation", selected: true });

    // ── SOLUCIÓN / GUÍA ────────────────────────────────────────────
    suggestions.push({ keyword: `cómo elegir ${companyType}`, type: "solution", selected: true });
    suggestions.push({ keyword: `qué es una ${companyType} y para qué sirve`, type: "solution", selected: true });
    suggestions.push({ keyword: `${companyType} guía completa ${CURRENT_YEAR}`, type: "solution", selected: false });
    suggestions.push({ keyword: `qué hace una ${companyType}`, type: "solution", selected: false });
    if (hasDistinctNiche) {
      suggestions.push({ keyword: `cómo hacer crecer una empresa ${nicheLC}`, type: "solution", selected: true });
      suggestions.push({ keyword: `estrategia de crecimiento ${nicheLC} España`, type: "solution", selected: true });
      suggestions.push({ keyword: `guía ${companyType} para ${nicheLC}`, type: "solution", selected: false });
    }

    // ── TRANSACCIONAL ──────────────────────────────────────────────
    suggestions.push({ keyword: `contratar ${companyType} España`, type: "transactional", selected: true });
    suggestions.push({ keyword: `${companyType} precios España`, type: "transactional", selected: true });
    suggestions.push({ keyword: `${companyType} para pymes España`, type: "transactional", selected: false });
    if (hasDistinctNiche) {
      suggestions.push({ keyword: `contratar ${companyType} para ${nicheLC}`, type: "transactional", selected: false });
    }

    // ── REPUTACIÓN ─────────────────────────────────────────────────
    suggestions.push({ keyword: `${brandName} España`, type: "reputation", selected: true });
    suggestions.push({ keyword: `${brandName} review`, type: "reputation", selected: false });

    // ── GAP DE CONTENIDO — ¿dónde publicar? ────────────────────────
    suggestions.push({ keyword: `blog ${companyType} España`, type: "content_gap", selected: true });
    suggestions.push({ keyword: `artículos sobre ${companyType}`, type: "content_gap", selected: true });
    suggestions.push({ keyword: `medios especializados ${nicheLC} España`, type: "content_gap", selected: true });
    suggestions.push({ keyword: `dónde publicar sobre ${companyType}`, type: "content_gap", selected: false });
    if (hasDistinctNiche) {
      suggestions.push({ keyword: `blog ${nicheLC} España`, type: "content_gap", selected: true });
      suggestions.push({ keyword: `medios digitales ${nicheLC}`, type: "content_gap", selected: false });
      suggestions.push({ keyword: `revistas ${nicheLC} España`, type: "content_gap", selected: false });
    }

    // ── INFLUENCERS / YOUTUBE — encontrar creadores posicionados ────
    suggestions.push({ keyword: `${companyType} youtube España`, type: "influencer", selected: true });
    suggestions.push({ keyword: `mejores ${companyType} youtube`, type: "influencer", selected: true });
    for (const comp of competitorNames.slice(0, 3)) {
      suggestions.push({ keyword: `${comp} youtube`, type: "influencer", selected: true });
      suggestions.push({ keyword: `${comp} review youtube`, type: "influencer", selected: false });
    }
    if (hasDistinctNiche) {
      suggestions.push({ keyword: `${nicheLC} youtube España`, type: "influencer", selected: true });
      suggestions.push({ keyword: `cómo crecer ${nicheLC} youtube`, type: "influencer", selected: false });
    }
  } else {
    // ── ENGLISH ────────────────────────────────────────────────────
    suggestions.push({ keyword: `best ${companyType} ${CURRENT_YEAR}`, type: "ranking", selected: true });
    suggestions.push({ keyword: `top ${companyType} comparison`, type: "ranking", selected: true });
    suggestions.push({ keyword: `${companyType} comparison ${CURRENT_YEAR}`, type: "ranking", selected: true });
    for (const comp of competitorNames.slice(0, 3)) {
      suggestions.push({ keyword: `${brandName} vs ${comp}`, type: "vs", selected: true });
      suggestions.push({ keyword: `${comp} alternatives`, type: "vs", selected: true });
      suggestions.push({ keyword: `${comp} reviews`, type: "review", selected: true });
    }
    suggestions.push({ keyword: `how to choose ${companyType}`, type: "solution", selected: true });
    suggestions.push({ keyword: `what does a ${companyType} do`, type: "solution", selected: false });
    suggestions.push({ keyword: `hire ${companyType}`, type: "transactional", selected: true });
    suggestions.push({ keyword: `${brandName} reviews`, type: "reputation", selected: true });
    suggestions.push({ keyword: `${companyType} blog`, type: "content_gap", selected: true });
    suggestions.push({ keyword: `${companyType} youtube`, type: "influencer", selected: true });
    for (const comp of competitorNames.slice(0, 2)) {
      suggestions.push({ keyword: `${comp} youtube`, type: "influencer", selected: false });
    }
  }

  // Deduplicate by keyword (case-insensitive)
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    const key = s.keyword.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Category display order ────────────────────────────────────────
const CATEGORY_ORDER: KeywordCategory[] = [
  "ranking",
  "vs",
  "review",
  "solution",
  "transactional",
  "reputation",
  "content_gap",
  "influencer",
];

interface KeywordBuilderProps {
  nicheName: string;
  nicheDescription: string | null;
  nicheSlug: string;
  competitorNames: string[];
  brandName: string;
  market: string;
  language: string;
  existingQueries: SerpQuery[];
  clientCompanyType: string | null;
  onSubmit: (keywords: string[], niche: string) => Promise<void>;
  onUpdateQuery: (queryId: string, keyword: string) => Promise<void>;
  onDeleteQuery: (queryId: string) => Promise<void>;
}

export function KeywordBuilder({
  nicheName,
  nicheDescription,
  nicheSlug,
  competitorNames,
  brandName,
  market,
  language,
  existingQueries,
  clientCompanyType,
  onSubmit,
  onUpdateQuery,
  onDeleteQuery,
}: KeywordBuilderProps) {
  const existingKeywords = existingQueries.map((q) => q.keyword);
  const [suggestions, setSuggestions] = useState<KeywordSuggestion[]>([]);
  const [customKeywords, setCustomKeywords] = useState("");
  const [generated, setGenerated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExisting, setShowExisting] = useState(false);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleGenerate = () => {
    const sugs = generateSuggestions(nicheName, nicheDescription, competitorNames, brandName, market, language, clientCompanyType);
    const existingSet = new Set(existingKeywords.map((k) => k.toLowerCase()));
    const filtered = sugs.filter((s) => !existingSet.has(s.keyword.toLowerCase()));
    setSuggestions(filtered);
    setGenerated(true);
  };

  const toggleSuggestion = (idx: number) => {
    setSuggestions((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, selected: !s.selected } : s))
    );
  };

  const selectAllOfType = (type: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.type === type ? { ...s, selected: true } : s))
    );
  };

  const handleSubmit = async () => {
    const selected = suggestions.filter((s) => s.selected).map((s) => s.keyword);
    const custom = customKeywords
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean);
    const allKeywords = [...selected, ...custom];
    if (allKeywords.length === 0) return;

    setSubmitting(true);
    setSavedCount(null);
    setError(null);
    try {
      await onSubmit(allKeywords, nicheSlug);
      setSavedCount(allKeywords.length);
      setSuggestions((prev) => prev.filter((s) => !s.selected));
      setCustomKeywords("");
      setTimeout(() => setSavedCount(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar keywords");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCount = suggestions.filter((s) => s.selected).length;
  const customCount = customKeywords.split("\n").filter((k) => k.trim()).length;
  const totalCount = selectedCount + customCount;

  return (
    <div className="space-y-4">
      {/* Description */}
      <div>
        <p className="text-xs text-comic-ink-soft">
          Keywords organizadas por objetivo estratégico. Cada categoría ataca un ángulo distinto para fortalecer tu SEO.
        </p>
        {clientCompanyType && (
          <p className="text-[11px] text-comic-cyan mt-1 font-bold">
            Tipo de empresa: {clientCompanyType}
          </p>
        )}
      </div>

      {savedCount !== null && (
        <div className="rounded-sm border-2 border-comic-sage bg-comic-sage/10 px-3 py-2 text-xs font-bold text-comic-sage">
          Guardado — {savedCount} keyword{savedCount !== 1 ? "s" : ""} enviadas a buscar en Google.
        </div>
      )}

      {error && (
        <div className="rounded-sm border-2 border-comic-rust bg-comic-rust/10 px-3 py-2 text-xs font-bold text-comic-rust">
          Error: {error}
        </div>
      )}

      {existingQueries.length > 0 && (
        <div className="rounded-sm border border-comic-ink/15 bg-comic-aged/30 px-3 py-2">
          <button
            onClick={() => setShowExisting(!showExisting)}
            className="flex w-full items-center justify-between text-xs text-comic-ink-soft hover:text-comic-ink"
          >
            <span>
              Ya tienes {existingQueries.length} keyword{existingQueries.length !== 1 ? "s" : ""} guardadas
            </span>
            {showExisting ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showExisting && (
            <div className="mt-2 space-y-1">
              {existingQueries.map((q) => (
                <div key={q.id} className="flex items-center gap-1.5 group">
                  {editingId === q.id ? (
                    <>
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const trimmed = editValue.trim();
                            if (trimmed && trimmed !== q.keyword) {
                              setSavingEdit(true);
                              onUpdateQuery(q.id, trimmed).finally(() => {
                                setSavingEdit(false);
                                setEditingId(null);
                              });
                            } else {
                              setEditingId(null);
                            }
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        disabled={savingEdit}
                        className="flex-1 rounded-sm border-2 border-comic-cyan bg-white px-2 py-0.5 text-[11px] text-comic-ink focus:outline-none"
                      />
                      <button
                        onClick={() => {
                          const trimmed = editValue.trim();
                          if (trimmed && trimmed !== q.keyword) {
                            setSavingEdit(true);
                            onUpdateQuery(q.id, trimmed).finally(() => {
                              setSavingEdit(false);
                              setEditingId(null);
                            });
                          } else {
                            setEditingId(null);
                          }
                        }}
                        disabled={savingEdit}
                        className="rounded-sm p-0.5 text-comic-sage hover:bg-comic-sage/10"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-sm p-0.5 text-comic-ink-soft hover:bg-comic-ink/10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 rounded-sm border border-comic-ink/20 bg-comic-paper px-2 py-0.5 text-[11px] text-comic-ink">
                        {q.keyword}
                      </span>
                      <button
                        onClick={() => {
                          setEditingId(q.id);
                          setEditValue(q.keyword);
                        }}
                        className="rounded-sm p-0.5 text-comic-ink-soft/40 opacity-0 group-hover:opacity-100 hover:text-comic-cyan hover:bg-comic-cyan/10 transition-all"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => {
                          setDeletingId(q.id);
                          onDeleteQuery(q.id).finally(() => setDeletingId(null));
                        }}
                        disabled={deletingId === q.id}
                        className="rounded-sm p-0.5 text-comic-ink-soft/40 opacity-0 group-hover:opacity-100 hover:text-comic-rust hover:bg-comic-rust/10 transition-all"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!generated && (
        <button
          onClick={handleGenerate}
          className="flex items-center gap-2 rounded-sm border-2 border-dashed border-comic-rust/30 bg-comic-rust/5 px-4 py-3 text-sm font-bold text-comic-rust hover:bg-comic-rust/10 w-full justify-center transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          Generar estrategia de keywords para &quot;{nicheName}&quot;
        </button>
      )}

      {/* Suggestions grouped by strategic category */}
      {generated && suggestions.length > 0 && (
        <div className="space-y-4">
          {CATEGORY_ORDER.map((cat) => {
            const catSuggestions = suggestions.filter((s) => s.type === cat);
            if (catSuggestions.length === 0) return null;
            const config = CATEGORY_CONFIG[cat];
            const isExpanded = expandedStrategy === cat;
            return (
              <div key={cat}>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-sm border px-2 py-0.5 text-[11px] font-bold", config.color)}>
                      {config.label} ({catSuggestions.filter((s) => s.selected).length}/{catSuggestions.length})
                    </span>
                    <button
                      onClick={() => setExpandedStrategy(isExpanded ? null : cat)}
                      className="text-comic-ink-soft hover:text-comic-ink"
                      title="Ver estrategia"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => selectAllOfType(cat)}
                    className="text-[11px] text-comic-rust hover:underline font-bold"
                  >
                    Seleccionar todas
                  </button>
                </div>
                {isExpanded && (
                  <p className="mb-2 rounded-sm border border-comic-ink/10 bg-comic-aged/30 px-3 py-2 text-[11px] text-comic-ink-soft italic">
                    {config.strategy}
                  </p>
                )}
                <div className="grid gap-1">
                  {catSuggestions.map((s) => {
                    const idx = suggestions.indexOf(s);
                    return (
                      <button
                        key={idx}
                        onClick={() => toggleSuggestion(idx)}
                        className={cn(
                          "flex items-center gap-2 rounded-sm border px-3 py-1.5 text-left text-xs transition-colors",
                          s.selected
                            ? config.bgSelected
                            : "border-comic-ink/10 bg-comic-aged/20 text-comic-ink-soft"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] font-black",
                            s.selected ? "border-comic-ink bg-comic-ink text-white" : "border-comic-ink/20"
                          )}
                        >
                          {s.selected && "✓"}
                        </div>
                        <span className="text-comic-ink">{s.keyword}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {generated && suggestions.length === 0 && (
        <div className="rounded-sm border-2 border-dashed border-comic-ink/20 p-4 text-center text-xs text-comic-ink-soft">
          Todas las sugerencias ya están configuradas. Puedes añadir keywords personalizadas abajo.
        </div>
      )}

      {generated && (
        <div>
          <label className="mb-1 block text-[11px] font-bold text-comic-ink">Keywords personalizadas (una por línea)</label>
          <textarea
            value={customKeywords}
            onChange={(e) => setCustomKeywords(e.target.value)}
            placeholder={`${brandName} vs ${competitorNames[0] || "competidor"}\nalternativas a ${competitorNames[0] || "competidor"}\nmejores ${clientCompanyType || "empresas"} España`}
            rows={3}
            className="w-full rounded-sm border-2 border-comic-ink/20 bg-white px-3 py-2 text-xs text-comic-ink placeholder:text-comic-ink-soft/40 focus:border-comic-rust focus:outline-none"
          />
        </div>
      )}

      {generated && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-comic-ink-soft">
            {totalCount} keyword{totalCount !== 1 ? "s" : ""} seleccionada{totalCount !== 1 ? "s" : ""}
          </span>
          <button
            onClick={handleSubmit}
            disabled={submitting || totalCount === 0}
            className={cn(
              "flex items-center gap-2 rounded-sm border-2 border-comic-ink px-4 py-2 text-xs font-bold shadow-comic-xs transition-all",
              submitting || totalCount === 0
                ? "bg-comic-aged text-comic-ink-soft cursor-not-allowed"
                : "bg-comic-cyan text-white hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5" />
                Guardar {totalCount} keyword{totalCount !== 1 ? "s" : ""}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
