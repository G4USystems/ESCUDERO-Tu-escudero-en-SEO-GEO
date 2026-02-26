"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MessageSquare, Sparkles, Plus, Loader2, Info, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { prompts as promptsApi, type Prompt, type PromptTopic } from "@/lib/api";

const MAX_PROMPTS = 8;

/**
 * Strategic GEO Prompt Selector — generates prompts to test LLM visibility.
 *
 * Prompts are organized by STRATEGIC GEO OBJECTIVE:
 *   1. DESCUBRIMIENTO  — "¿La IA sabe que existo?"
 *   2. RECOMENDACIÓN   — "¿La IA me recomienda cuando alguien pregunta por mi categoría?"
 *   3. COMPARACIÓN     — "¿Cómo me posiciona la IA frente a mis competidores?"
 *   4. ALTERNATIVAS    — "¿Aparezco cuando buscan alternativas a mis competidores?"
 *   5. PROBLEMA→SOLUCIÓN — "¿La IA sugiere mi tipo de servicio como solución?"
 *   6. AUTORIDAD       — "¿La IA me considera un referente en mi sector?"
 *
 * Uses company_type (from domain intelligence) for contextually correct prompts.
 */

type PromptCategory = "discovery" | "recommendation" | "comparison" | "alternatives" | "problem" | "authority" | "content_gap" | "influencer" | "media_intelligence";

interface PromptSuggestion {
  text: string;
  category: PromptCategory;
  selected: boolean;
}

const CATEGORY_CONFIG: Record<
  PromptCategory,
  { label: string; emoji: string; color: string; bgSelected: string; strategy: string }
> = {
  discovery: {
    label: "Descubrimiento",
    emoji: "🔍",
    color: "bg-slate-100 text-slate-800 border-slate-200",
    bgSelected: "border-slate-300 bg-slate-50",
    strategy:
      "Verifica si los LLMs saben que tu empresa existe. Si no te conocen, necesitas generar más contenido indexable y menciones en medios.",
  },
  recommendation: {
    label: "Recomendación",
    emoji: "⭐",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    bgSelected: "border-purple-300 bg-purple-50",
    strategy:
      "Testea si los LLMs te recomiendan cuando alguien busca tu tipo de servicio. Esta es la métrica GEO más importante: ser la respuesta recomendada.",
  },
  comparison: {
    label: "Comparación directa",
    emoji: "⚔️",
    color: "bg-orange-100 text-orange-800 border-orange-200",
    bgSelected: "border-orange-300 bg-orange-50",
    strategy:
      "Evalúa cómo te posiciona la IA frente a competidores específicos. Identifica qué diferenciadores destaca (o no) la IA sobre tu marca.",
  },
  alternatives: {
    label: "Alternativas a competidores",
    emoji: "🔄",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    bgSelected: "border-blue-300 bg-blue-50",
    strategy:
      "Comprueba si apareces como alternativa cuando preguntan por tus competidores. Gran oportunidad para captar usuarios insatisfechos.",
  },
  problem: {
    label: "Problema → Solución",
    emoji: "💡",
    color: "bg-green-100 text-green-800 border-green-200",
    bgSelected: "border-green-300 bg-green-50",
    strategy:
      "Testea si la IA sugiere tu tipo de servicio cuando alguien describe un problema que tú resuelves. Clave para captar demanda latente.",
  },
  authority: {
    label: "Autoridad / Liderazgo",
    emoji: "🏆",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    bgSelected: "border-amber-300 bg-amber-50",
    strategy:
      "Evalúa si la IA te posiciona como referente o líder en tu sector. Refleja la percepción de autoridad de tu marca en el ecosistema de IA.",
  },
  content_gap: {
    label: "Gap de contenido",
    emoji: "📝",
    color: "bg-teal-100 text-teal-800 border-teal-200",
    bgSelected: "border-teal-300 bg-teal-50",
    strategy:
      "Pregunta a la IA dónde publicar y qué medios cubren tu sector. Identifica oportunidades de guest posts, artículos patrocinados y menciones editoriales.",
  },
  influencer: {
    label: "Influencers / Creadores",
    emoji: "🎥",
    color: "bg-pink-100 text-pink-800 border-pink-200",
    bgSelected: "border-pink-300 bg-pink-50",
    strategy:
      "Descubre qué creadores de contenido y YouTubers menciona la IA para tu sector. Son influencers potenciales para colaboraciones.",
  },
  media_intelligence: {
    label: "Inteligencia de Medios",
    emoji: "🕵️",
    color: "bg-indigo-100 text-indigo-800 border-indigo-200",
    bgSelected: "border-indigo-300 bg-indigo-50",
    strategy:
      "Pregunta directamente a los LLMs qué fuentes usan para formar sus recomendaciones. Revela los medios que impulsan la visibilidad de tus competidores en IA — esos son tus targets prioritarios para backlinks y contenido.",
  },
};

const CATEGORY_ORDER: PromptCategory[] = [
  "discovery",
  "recommendation",
  "comparison",
  "alternatives",
  "problem",
  "authority",
  "content_gap",
  "influencer",
  "media_intelligence",
];

function generatePromptSuggestions(
  nicheName: string,
  _nicheDescription: string | null,
  brandName: string,
  competitorNames: string[],
  language: string,
  clientCompanyType: string | null,
): PromptSuggestion[] {
  const suggestions: PromptSuggestion[] = [];
  const nicheLC = nicheName.toLowerCase();
  const isSpanish = language === "es";
  const hasDistinctNiche = !!clientCompanyType && clientCompanyType.toLowerCase() !== nicheLC;
  // companyType = "agencias de growth marketing para empresas fintech" (compound when distinct)
  const companyType = hasDistinctNiche ? `${clientCompanyType} para ${nicheLC}` : (clientCompanyType || nicheLC);
  // nicheShort strips "empresas/compañías/firmas" prefix for use as adjective in sentences
  // e.g. "empresas fintech" → "fintech" so "Mi empresa fintech" reads naturally
  const nicheShort = nicheLC.replace(/^(empresas de |empresas |compañías de |compañías |firmas de |firmas )/i, "").trim();
  const compList = competitorNames.slice(0, 3).join(", ");

  if (isSpanish) {
    // ── 1. DESCUBRIMIENTO ─────────────────────────────────────────
    suggestions.push({
      text: `¿Qué es ${brandName}? ¿A qué se dedican y cuál es su propuesta de valor?`,
      category: "discovery",
      selected: true,
    });
    suggestions.push({
      text: `¿Conoces la empresa ${brandName}? Cuéntame sobre ella.`,
      category: "discovery",
      selected: true,
    });

    // ── 2. RECOMENDACIÓN ──────────────────────────────────────────
    suggestions.push({
      text: `¿Cuáles son las mejores ${companyType} en España?`,
      category: "recommendation",
      selected: true,
    });
    suggestions.push({
      text: `Recomienda ${companyType}. Compara las principales opciones con pros y contras.`,
      category: "recommendation",
      selected: true,
    });
    suggestions.push({
      text: `Haz un ranking de las mejores ${companyType} en España en 2026.`,
      category: "recommendation",
      selected: true,
    });
    if (hasDistinctNiche) {
      suggestions.push({
        text: `Soy una empresa ${nicheShort} buscando ${clientCompanyType}. ¿Qué opciones tengo en España y cuál recomiendas?`,
        category: "recommendation",
        selected: true,
      });
    }

    // ── 3. COMPARACIÓN ────────────────────────────────────────────
    if (compList) {
      suggestions.push({
        text: `Compara ${brandName} con ${compList}. ¿Cuál es la mejor opción como ${companyType} y por qué?`,
        category: "comparison",
        selected: true,
      });
    }
    for (const comp of competitorNames.slice(0, 2)) {
      suggestions.push({
        text: `Entre ${brandName} y ${comp}, ¿cuál recomiendas como ${companyType}${hasDistinctNiche ? ` para una empresa ${nicheShort}` : ""}?`,
        category: "comparison",
        selected: true,
      });
    }
    suggestions.push({
      text: `¿Qué diferencia a ${brandName} de sus competidores como ${companyType}?`,
      category: "comparison",
      selected: true,
    });

    // ── 4. ALTERNATIVAS ───────────────────────────────────────────
    for (const comp of competitorNames.slice(0, 3)) {
      suggestions.push({
        text: `¿Cuáles son las mejores alternativas a ${comp} en España?`,
        category: "alternatives",
        selected: false,
      });
    }
    if (competitorNames.length > 0) {
      suggestions.push({
        text: `No estoy satisfecho con ${competitorNames[0]}. ¿Qué otras ${companyType} me recomiendas en España?`,
        category: "alternatives",
        selected: false,
      });
    }

    // ── 5. PROBLEMA → SOLUCIÓN ────────────────────────────────────
    if (hasDistinctNiche) {
      suggestions.push({
        text: `Mi empresa ${nicheShort} necesita crecer rápido. ¿Qué tipo de ayuda profesional necesito?`,
        category: "problem",
        selected: true,
      });
      suggestions.push({
        text: `Tengo una startup ${nicheShort} y necesito escalar. ¿Debería contratar ${companyType}? ¿Qué debo considerar?`,
        category: "problem",
        selected: true,
      });
      suggestions.push({
        text: `¿Qué estrategias de crecimiento recomiendas para startups ${nicheShort} en España?`,
        category: "problem",
        selected: true,
      });
    } else {
      suggestions.push({
        text: `Necesito mejorar mi presencia online. ¿Qué tipo de ${companyType} me recomiendas?`,
        category: "problem",
        selected: true,
      });
      suggestions.push({
        text: `¿Qué debería buscar al contratar ${companyType}? ¿Qué factores son los más importantes?`,
        category: "problem",
        selected: true,
      });
    }

    // ── 6. AUTORIDAD ──────────────────────────────────────────────
    suggestions.push({
      text: `¿Quiénes son los líderes en ${companyType} en España?`,
      category: "authority",
      selected: true,
    });
    suggestions.push({
      text: `¿Qué empresas son referentes en el sector de ${nicheLC} en España?`,
      category: "authority",
      selected: true,
    });
    suggestions.push({
      text: `¿Merece la pena contratar a ${brandName}? ¿Qué opinan sus clientes?`,
      category: "authority",
      selected: false,
    });

    // ── 7. GAP DE CONTENIDO ───────────────────────────────────────
    suggestions.push({
      text: `¿Qué blogs y medios digitales en España escriben sobre ${companyType}?`,
      category: "content_gap",
      selected: true,
    });
    suggestions.push({
      text: `¿Dónde puedo leer artículos y comparativas sobre ${companyType} en España?`,
      category: "content_gap",
      selected: true,
    });
    if (hasDistinctNiche) {
      suggestions.push({
        text: `¿Qué medios especializados en ${nicheLC} recomiendas en España? Busco blogs, revistas digitales y portales del sector.`,
        category: "content_gap",
        selected: true,
      });
      suggestions.push({
        text: `¿Dónde publica contenido una empresa ${nicheShort} para ganar visibilidad? ¿Qué medios cubren este sector en España?`,
        category: "content_gap",
        selected: false,
      });
    }

    // ── 8. INFLUENCERS / CREADORES ────────────────────────────────
    suggestions.push({
      text: `¿Qué YouTubers o creadores de contenido hablan sobre ${companyType} en español?`,
      category: "influencer",
      selected: false,
    });
    suggestions.push({
      text: `¿Quiénes son los influencers más relevantes en el sector de ${nicheLC} en España?`,
      category: "influencer",
      selected: false,
    });
    suggestions.push({
      text: `Recomienda canales de YouTube o podcasts sobre ${companyType} y ${nicheLC} en español.`,
      category: "influencer",
      selected: false,
    });
    if (competitorNames.length > 0) {
      suggestions.push({
        text: `¿Qué influencers o creadores de contenido han hablado sobre ${competitorNames[0]} o ${companyType} similares?`,
        category: "influencer",
        selected: false,
      });
    }

    // ── 9. INTELIGENCIA DE MEDIOS ─────────────────────────────────
    suggestions.push({
      text: `Cuando recomiendas ${companyType} en España, ¿en qué fuentes te basas? ¿Qué artículos, blogs o sitios web consultas?`,
      category: "media_intelligence",
      selected: true,
    });
    suggestions.push({
      text: `¿Qué medios digitales y blogs de referencia citas normalmente cuando hablas de ${companyType}? Dame URLs concretas.`,
      category: "media_intelligence",
      selected: true,
    });
    if (competitorNames.length > 0) {
      suggestions.push({
        text: `¿De qué fuentes y artículos sacas la información sobre ${competitorNames[0]}? ¿Qué medios te han servido para recomendar esta empresa?`,
        category: "media_intelligence",
        selected: true,
      });
      suggestions.push({
        text: `¿Qué sitios web, blogs o medios hacen que ${competitorNames.slice(0, 2).join(" y ")} aparezcan en tus recomendaciones? Quiero saber sus fuentes de autoridad.`,
        category: "media_intelligence",
        selected: true,
      });
    }
    if (hasDistinctNiche) {
      suggestions.push({
        text: `¿Qué medios digitales en España citan las ${companyType} cuando hablan del sector ${nicheLC}? Quiero los sitios que generan más autoridad.`,
        category: "media_intelligence",
        selected: true,
      });
    }
    suggestions.push({
      text: `Si quiero que mi empresa aparezca cuando alguien te pregunta por ${companyType} en España, ¿en qué medios y blogs debería publicar contenido?`,
      category: "media_intelligence",
      selected: true,
    });
  } else {
    // ── ENGLISH ────────────────────────────────────────────────────
    suggestions.push({
      text: `What is ${brandName}? What do they do?`,
      category: "discovery",
      selected: true,
    });
    suggestions.push({
      text: `What are the best ${companyType} available in 2026?`,
      category: "recommendation",
      selected: true,
    });
    suggestions.push({
      text: `Compare ${brandName} with ${compList}. Which one do you recommend and why?`,
      category: "comparison",
      selected: true,
    });
    for (const comp of competitorNames.slice(0, 2)) {
      suggestions.push({
        text: `What are the best alternatives to ${comp}?`,
        category: "alternatives",
        selected: true,
      });
    }
    suggestions.push({
      text: `I'm looking for ${companyType}. What should I consider and which do you recommend?`,
      category: "problem",
      selected: true,
    });
    suggestions.push({
      text: `Who are the leading ${companyType} in the industry?`,
      category: "authority",
      selected: true,
    });
    suggestions.push({
      text: `What blogs and media outlets write about ${companyType}?`,
      category: "content_gap",
      selected: true,
    });
    suggestions.push({
      text: `What YouTubers or content creators cover ${companyType}?`,
      category: "influencer",
      selected: true,
    });
    suggestions.push({
      text: `When you recommend ${companyType}, what sources do you rely on? What blogs and articles inform your recommendations?`,
      category: "media_intelligence",
      selected: true,
    });
    if (competitorNames.length > 0) {
      suggestions.push({
        text: `What media outlets and websites make ${competitorNames[0]} appear in your recommendations? I want to understand their authority sources.`,
        category: "media_intelligence",
        selected: true,
      });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const deduped = suggestions.filter((s) => {
    const key = s.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Return only up to MAX_PROMPTS selected (one per category, no unselected extras)
  const selectedPerCategory = new Set<string>();
  const result: PromptSuggestion[] = [];
  for (const s of deduped) {
    if (s.selected && !selectedPerCategory.has(s.category) && result.length < MAX_PROMPTS) {
      selectedPerCategory.add(s.category);
      result.push(s);
    }
  }
  return result;
}

interface PromptSelectorProps {
  projectId: string;
  nicheName: string;
  nicheDescription: string | null;
  brandName: string;
  competitorNames: string[];
  language: string;
  existingPrompts: Prompt[];
  topics: PromptTopic[];
  clientCompanyType: string | null;
  onImport: (prompts: { topic_id: string; text: string; language: string }[]) => Promise<void>;
  onClear?: () => Promise<void>;
}

export function PromptSelector({
  projectId,
  nicheName,
  nicheDescription,
  brandName,
  competitorNames,
  language,
  existingPrompts,
  topics,
  clientCompanyType,
  onImport,
  onClear,
}: PromptSelectorProps) {
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [generated, setGenerated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExisting, setShowExisting] = useState(false);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);

  const selectedCount = suggestions.filter((s) => s.selected).length;
  const remainingSlots = Math.max(0, MAX_PROMPTS - existingPrompts.length);
  const atLimit = existingPrompts.length >= MAX_PROMPTS;

  const handleGenerate = () => {
    const sugs = generatePromptSuggestions(nicheName, nicheDescription, brandName, competitorNames, language, clientCompanyType);
    const existingTexts = new Set(existingPrompts.map((p) => p.text.toLowerCase()));
    const filtered = sugs.filter((s) => !existingTexts.has(s.text.toLowerCase()));
    // Auto-deselect beyond remaining slots
    let autoSelected = 0;
    const capped = filtered.map((s) => {
      if (!s.selected) return s;
      if (autoSelected < remainingSlots) { autoSelected++; return s; }
      return { ...s, selected: false };
    });
    setSuggestions(capped);
    setGenerated(true);
  };

  const toggleSuggestion = (idx: number) => {
    setSuggestions((prev) => {
      const current = prev[idx];
      // Block selecting more if cap reached
      if (!current.selected && selectedCount >= remainingSlots) return prev;
      return prev.map((s, i) => (i === idx ? { ...s, selected: !s.selected } : s));
    });
  };

  const selectAllOfCategory = (category: PromptCategory) => {
    setSuggestions((prev) => {
      let count = prev.filter((s) => s.selected).length;
      return prev.map((s) => {
        if (s.category !== category || s.selected) return s;
        if (count >= remainingSlots) return s;
        count++;
        return { ...s, selected: true };
      });
    });
  };

  const addCustom = () => {
    if (!customPrompt.trim() || selectedCount >= remainingSlots) return;
    setSuggestions((prev) => [...prev, { text: customPrompt.trim(), category: "recommendation", selected: true }]);
    setCustomPrompt("");
  };

  const handleSubmit = async () => {
    const selected = suggestions.filter((s) => s.selected).slice(0, remainingSlots);
    if (selected.length === 0) return;

    // Fetch fresh topics if not loaded yet (backend auto-seeds on GET /topics)
    let resolvedTopics = topics;
    if (resolvedTopics.length === 0) {
      try {
        resolvedTopics = await promptsApi.topics(projectId);
      } catch {
        setError("No se pudieron cargar los topics. Recarga la página e inténtalo de nuevo.");
        return;
      }
    }

    // Build category → topic_id map
    const topicBySlug: Record<string, string> = {};
    for (const t of resolvedTopics) topicBySlug[t.slug] = t.id;
    const fallbackId = resolvedTopics[0]?.id ?? "";

    setSubmitting(true);
    setSavedCount(null);
    setError(null);
    try {
      await onImport(
        selected.map((s) => ({
          topic_id: topicBySlug[s.category] ?? fallbackId ?? "",
          text: s.text,
          language,
        }))
      );
      setSavedCount(selected.length);
      setSuggestions((prev) => prev.filter((s) => !s.selected));
      setTimeout(() => setSavedCount(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al importar prompts");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Description */}
      <div>
        <p className="text-xs text-comic-ink-soft">
          Preguntas estratégicas para ChatGPT, Claude, Gemini y Perplexity. Cada categoría mide un aspecto distinto de tu presencia en IA.
        </p>
        {clientCompanyType && (
          <p className="text-[11px] text-comic-rust mt-1 font-bold">
            Tipo de empresa: {clientCompanyType}
          </p>
        )}
      </div>

      {savedCount !== null && (
        <div className="rounded-sm border-2 border-comic-sage bg-comic-sage/10 px-3 py-2 text-xs font-bold text-comic-sage">
          Guardado — {savedCount} prompt{savedCount !== 1 ? "s" : ""} importados correctamente.
        </div>
      )}

      {error && (
        <div className="rounded-sm border-2 border-comic-rust bg-comic-rust/10 px-3 py-2 text-xs font-bold text-comic-rust">
          Error: {error}
        </div>
      )}

      {existingPrompts.length > 0 && (
        <div className="rounded-sm border border-comic-ink/15 bg-comic-aged/30 px-3 py-2">
          <div className="flex w-full items-center justify-between">
            <button
              onClick={() => setShowExisting(!showExisting)}
              className="flex items-center gap-1 text-xs text-comic-ink-soft hover:text-comic-ink"
            >
              {showExisting ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {existingPrompts.length} prompt{existingPrompts.length !== 1 ? "s" : ""} configurados
            </button>
            {onClear && (
              <button
                onClick={onClear}
                className="text-[11px] font-bold text-red-400 hover:text-red-600 transition-colors"
              >
                Limpiar todo
              </button>
            )}
          </div>
          {showExisting && (
            <div className="mt-2 space-y-1">
              {existingPrompts.map((p) => (
                <div
                  key={p.id}
                  className="rounded-sm border border-comic-ink/15 bg-comic-paper px-2.5 py-1.5 text-[11px] text-comic-ink-soft"
                >
                  {p.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {atLimit && !generated && (
        <div className="flex items-center justify-between rounded-sm border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-xs font-bold text-amber-800">
              Límite de {MAX_PROMPTS} prompts alcanzado. Usa &quot;Limpiar todo&quot; para regenerar.
            </span>
          </div>
        </div>
      )}

      {!generated && !atLimit && (
        <button
          onClick={handleGenerate}
          className="flex items-center gap-2 rounded-sm border-2 border-dashed border-comic-rust/30 bg-comic-rust/5 px-4 py-3 text-sm font-bold text-comic-rust hover:bg-comic-rust/10 w-full justify-center transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          Generar estrategia de prompts GEO para &quot;{nicheName}&quot;
          {existingPrompts.length > 0 && (
            <span className="ml-1 text-[11px] font-normal text-comic-rust/60">
              ({remainingSlots} slot{remainingSlots !== 1 ? "s" : ""} disponibles)
            </span>
          )}
        </button>
      )}

      {/* Suggestions grouped by strategic category */}
      {generated && suggestions.length > 0 && (
        <div className="space-y-4">
          {CATEGORY_ORDER.map((cat) => {
            const catSuggestions = suggestions.filter((s) => s.category === cat);
            if (catSuggestions.length === 0) return null;
            const config = CATEGORY_CONFIG[cat];
            const isExpanded = expandedStrategy === cat;
            return (
              <div key={cat}>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-sm border px-2 py-0.5 text-[11px] font-bold", config.color)}>
                      {config.emoji} {config.label} ({catSuggestions.filter((s) => s.selected).length}/{catSuggestions.length})
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
                    onClick={() => selectAllOfCategory(cat)}
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
                <div className="space-y-1">
                  {catSuggestions.map((s) => {
                    const idx = suggestions.indexOf(s);
                    return (
                      <button
                        key={idx}
                        onClick={() => toggleSuggestion(idx)}
                        className={cn(
                          "flex items-start gap-2 rounded-sm border px-3 py-2 text-left text-xs w-full transition-colors",
                          s.selected
                            ? config.bgSelected
                            : "border-comic-ink/10 bg-comic-aged/20 text-comic-ink-soft"
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] font-black",
                            s.selected ? "border-comic-ink bg-comic-ink text-white" : "border-comic-ink/20"
                          )}
                        >
                          {s.selected && "✓"}
                        </div>
                        <span className="flex-1 text-comic-ink">{s.text}</span>
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
          Todos los prompts sugeridos ya están importados. Puedes añadir prompts personalizados.
        </div>
      )}

      {generated && !atLimit && (
        <div className="flex gap-2">
          <input
            type="text"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            placeholder="Escribe un prompt personalizado..."
            disabled={selectedCount >= remainingSlots}
            className="flex-1 rounded-sm border-2 border-comic-ink/20 bg-white px-3 py-1.5 text-xs text-comic-ink placeholder:text-comic-ink-soft/40 focus:border-comic-rust focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <button
            onClick={addCustom}
            disabled={!customPrompt.trim() || selectedCount >= remainingSlots}
            className="rounded-sm border-2 border-comic-ink/20 p-1.5 text-comic-rust hover:bg-comic-rust/10 disabled:opacity-30 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}

      {generated && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-comic-ink-soft">
            {selectedCount} seleccionado{selectedCount !== 1 ? "s" : ""}
            {remainingSlots < MAX_PROMPTS && (
              <span className={cn("ml-1.5 font-bold", selectedCount >= remainingSlots ? "text-amber-600" : "text-comic-ink-soft")}>
                · {remainingSlots - selectedCount} slot{remainingSlots - selectedCount !== 1 ? "s" : ""} restante{remainingSlots - selectedCount !== 1 ? "s" : ""}
              </span>
            )}
          </span>
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedCount === 0}
            className={cn(
              "flex items-center gap-2 rounded-sm border-2 border-comic-ink px-4 py-2 text-xs font-bold shadow-comic-xs transition-all",
              submitting || selectedCount === 0
                ? "bg-comic-aged text-comic-ink-soft cursor-not-allowed"
                : "bg-comic-rust text-white hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <MessageSquare className="h-3.5 w-3.5" />
                Importar {selectedCount} prompts
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
