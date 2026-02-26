"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Brand } from "@/lib/api";
import { projects as projectsApi, niches as nichesApi } from "@/lib/api";
import {
  Globe,
  Trash2,
  Plus,
  X,
  Loader2,
  Sparkles,
  Check,
  ChevronDown,
  ChevronUp,
  Wand2,
} from "lucide-react";

interface CompetitorSuggestion {
  name: string;
  domain: string;
  description: string;
  rationale: string;
}

interface CompetitorListProps {
  projectId: string;
  nicheSlug: string;
  competitors: Brand[];
  allBrands?: Brand[];
  onAdd?: (brandId: string) => Promise<void>;
  onAddNew: (data: { name: string; domain?: string }) => Promise<Brand>;
  onRemove: (brandId: string) => Promise<void>;
  onBrandUpdated?: (brand: Brand) => void;
}

export function CompetitorList({
  projectId,
  nicheSlug,
  competitors,
  onAddNew,
  onRemove,
  onBrandUpdated,
}: CompetitorListProps) {
  const [mode, setMode] = useState<"idle" | "ai" | "manual">("idle");

  // AI suggestions state
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<CompetitorSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addingSuggestions, setAddingSuggestions] = useState(false);

  // Manual state
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [savingManual, setSavingManual] = useState(false);

  // Per-competitor analysis
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Expanded competitor details
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAnalyze = async (brandId: string) => {
    setAnalyzing(brandId);
    try {
      const updated = await projectsApi.analyzeBrand(projectId, brandId);
      onBrandUpdated?.(updated);
    } catch (e) {
      console.error("Analysis failed:", e);
    } finally {
      setAnalyzing(null);
    }
  };

  const handleRemove = async (brandId: string) => {
    setRemovingId(brandId);
    try {
      await onRemove(brandId);
    } finally {
      setRemovingId(null);
    }
  };

  // ── AI suggestions ──────────────────────────────────────────────
  const handleSuggest = async () => {
    setSuggesting(true);
    setSuggestions([]);
    setSelected(new Set());
    try {
      const res = await nichesApi.suggestCompetitors(projectId, nicheSlug);
      // Filter out already-added competitors by domain
      const existingDomains = new Set(competitors.map((c) => c.domain?.toLowerCase()).filter(Boolean));
      const filtered = res.suggestions.filter(
        (s) => !existingDomains.has(s.domain.toLowerCase())
      );
      setSuggestions(filtered);
      // Pre-select all by default
      setSelected(new Set(filtered.map((s) => s.domain)));
    } finally {
      setSuggesting(false);
    }
  };

  const toggleSuggestion = (domain: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const handleAddSelected = async () => {
    const toAdd = suggestions.filter((s) => selected.has(s.domain));
    if (!toAdd.length) return;
    setAddingSuggestions(true);
    try {
      for (const s of toAdd) {
        const brand = await onAddNew({ name: s.name, domain: s.domain });
        // Auto-analyze in background (don't await — let it run)
        if (brand?.id && brand.domain) {
          handleAnalyze(brand.id);
        }
      }
      setSuggestions([]);
      setSelected(new Set());
      setMode("idle");
    } finally {
      setAddingSuggestions(false);
    }
  };

  // ── Manual add ──────────────────────────────────────────────────
  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSavingManual(true);
    try {
      const brand = await onAddNew({
        name: newName.trim(),
        domain: newDomain.trim() || undefined,
      });
      if (brand?.id && brand.domain) {
        handleAnalyze(brand.id);
      }
      setNewName("");
      setNewDomain("");
      setMode("idle");
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-black text-comic-ink uppercase tracking-wide">
          Competidores ({competitors.length})
        </h4>
        {mode === "idle" && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setMode("ai"); handleSuggest(); }}
              className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-rust/10 px-2.5 py-1 text-xs font-bold text-comic-rust shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Sugerir con IA
            </button>
            <button
              onClick={() => setMode("manual")}
              className="flex items-center gap-1 rounded-sm border-2 border-comic-ink bg-comic-paper px-2.5 py-1 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            >
              <Plus className="h-3.5 w-3.5" />
              Manual
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {competitors.length === 0 && mode === "idle" && (
        <p className="text-xs text-comic-ink-soft">
          Sin competidores todavía. Usa &quot;Sugerir con IA&quot; para identificarlos automáticamente.
        </p>
      )}

      {/* Competitor list */}
      <div className="space-y-1.5">
        {competitors.map((c) => {
          const isExpanded = expandedId === c.id;
          const hasDetails = c.about_summary || c.service_description || c.target_market;
          return (
            <div
              key={c.id}
              className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <Globe className="h-3.5 w-3.5 shrink-0 text-comic-ink-soft" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-comic-ink">{c.name}</span>
                    {c.domain && (
                      <span className="text-[11px] text-comic-ink-soft">{c.domain}</span>
                    )}
                    {analyzing === c.id ? (
                      <span className="flex items-center gap-1 text-[11px] text-comic-rust">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Analizando...
                      </span>
                    ) : c.company_type ? (
                      <span className="rounded-sm border border-comic-navy/30 bg-comic-navy/10 px-1.5 py-0.5 text-[10px] font-bold text-comic-navy">
                        {c.company_type}
                      </span>
                    ) : c.domain ? (
                      <button
                        onClick={() => handleAnalyze(c.id)}
                        className="flex items-center gap-1 rounded-sm border border-comic-rust/30 bg-comic-rust/5 px-1.5 py-0.5 text-[10px] font-bold text-comic-rust hover:bg-comic-rust/10"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        Analizar
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {hasDetails && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      className="rounded-sm p-1 text-comic-ink-soft hover:text-comic-ink"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(c.id)}
                    disabled={removingId === c.id}
                    className="rounded-sm p-1 text-comic-ink-soft/50 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && hasDetails && (
                <div className="border-t border-comic-ink/10 bg-comic-aged/20 px-3 py-2 space-y-1">
                  {c.about_summary && (
                    <p className="text-[11px] text-comic-ink leading-relaxed">{c.about_summary}</p>
                  )}
                  {c.service_description && (
                    <p className="text-[11px] text-comic-ink-soft">
                      <span className="font-bold">Servicios:</span> {c.service_description}
                    </p>
                  )}
                  {c.target_market && (
                    <p className="text-[11px] text-comic-ink-soft">
                      <span className="font-bold">Mercado:</span> {c.target_market}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── AI Suggestions panel ── */}
      {mode === "ai" && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
          <div className="flex items-center justify-between border-b-2 border-comic-ink px-3 py-2.5 bg-comic-rust/5">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-comic-rust" />
              <span className="text-sm font-black text-comic-ink">Sugerencias de IA</span>
            </div>
            <button
              onClick={() => { setMode("idle"); setSuggestions([]); }}
              className="rounded-sm p-1 text-comic-ink-soft hover:text-comic-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {suggesting ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-comic-ink-soft">
              <Loader2 className="h-4 w-4 animate-spin text-comic-rust" />
              Sancho está identificando competidores...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-6 text-center text-xs text-comic-ink-soft">
              No se encontraron sugerencias nuevas.
            </div>
          ) : (
            <div>
              <div className="divide-y divide-comic-ink/10">
                {suggestions.map((s) => {
                  const isChecked = selected.has(s.domain);
                  return (
                    <div
                      key={s.domain}
                      onClick={() => toggleSuggestion(s.domain)}
                      className={cn(
                        "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                        isChecked ? "bg-comic-sage/10" : "hover:bg-comic-aged/30"
                      )}
                    >
                      <div className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-2 border-comic-ink transition-colors",
                        isChecked ? "bg-comic-sage border-comic-sage" : "bg-white"
                      )}>
                        {isChecked && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-comic-ink">{s.name}</span>
                          <span className="text-[11px] text-comic-ink-soft">{s.domain}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-comic-ink leading-relaxed">{s.description}</p>
                        <p className="mt-0.5 text-[11px] text-comic-rust italic">{s.rationale}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t-2 border-comic-ink px-3 py-2.5">
                <span className="text-xs text-comic-ink-soft">
                  {selected.size} de {suggestions.length} seleccionados
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setMode("idle"); setSuggestions([]); }}
                    className="rounded-sm px-3 py-1.5 text-xs font-bold text-comic-ink-soft hover:text-comic-ink"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddSelected}
                    disabled={selected.size === 0 || addingSuggestions}
                    className={cn(
                      "flex items-center gap-1.5 rounded-sm border-2 border-comic-ink px-3 py-1.5 text-xs font-bold shadow-comic-xs transition-all",
                      selected.size > 0 && !addingSuggestions
                        ? "bg-comic-yellow text-comic-ink hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                        : "bg-comic-aged text-comic-ink-soft cursor-not-allowed"
                    )}
                  >
                    {addingSuggestions ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    {addingSuggestions ? "Añadiendo..." : `Añadir ${selected.size}`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Manual add panel ── */}
      {mode === "manual" && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
          <div className="flex items-center justify-between border-b-2 border-comic-ink px-3 py-2.5">
            <span className="text-sm font-black text-comic-ink">Añadir manualmente</span>
            <button
              onClick={() => setMode("idle")}
              className="rounded-sm p-1 text-comic-ink-soft hover:text-comic-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <form onSubmit={handleAddManual} className="space-y-2.5 p-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del competidor *"
              className="w-full rounded-sm border-2 border-comic-ink/20 px-3 py-1.5 text-sm text-comic-ink placeholder:text-comic-ink-soft/40 focus:border-comic-rust focus:outline-none"
              autoFocus
              required
            />
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="Dominio (ej: competitor.com) — recomendado"
              className="w-full rounded-sm border-2 border-comic-ink/20 px-3 py-1.5 text-sm text-comic-ink placeholder:text-comic-ink-soft/40 focus:border-comic-rust focus:outline-none"
            />
            <p className="text-[11px] text-comic-ink-soft">
              Con dominio, analizamos automáticamente la empresa con IA.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMode("idle")}
                className="rounded-sm px-3 py-1.5 text-xs font-bold text-comic-ink-soft hover:text-comic-ink"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingManual || !newName.trim()}
                className={cn(
                  "flex items-center gap-1.5 rounded-sm border-2 border-comic-ink px-3 py-1.5 text-xs font-bold shadow-comic-xs transition-all",
                  !savingManual && newName.trim()
                    ? "bg-comic-yellow text-comic-ink hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                    : "bg-comic-aged text-comic-ink-soft cursor-not-allowed"
                )}
              >
                {savingManual ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                {savingManual ? "Añadiendo..." : "Añadir"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
