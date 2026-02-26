"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Trash2, Sparkles } from "lucide-react";
import type { ExclusionRule } from "@/lib/api";

/**
 * Pre-configured exclusion rules based on the Monzo Spain workflow.
 * These are the domains we learned to exclude: banks, neobanks, fintech competitors.
 */

interface RuleSuggestion {
  rule_name: string;
  description: string;
  rule_type: string;
  rule_value: Record<string, unknown>;
  selected: boolean;
}

function generateExclusionSuggestions(
  brandDomain: string | null,
  competitorDomains: string[],
  market: string
): RuleSuggestion[] {
  const suggestions: RuleSuggestion[] = [];

  // 1. Always exclude the client brand domain
  if (brandDomain) {
    suggestions.push({
      rule_name: `Excluir dominio propio (${brandDomain})`,
      description: "Tu propio sitio no es una oportunidad editorial",
      rule_type: "domain_exact",
      rule_value: { domains: [brandDomain] },
      selected: true,
    });
  }

  // 2. Exclude competitor official sites
  const compDomains = competitorDomains.filter(Boolean);
  if (compDomains.length > 0) {
    suggestions.push({
      rule_name: "Excluir sitios oficiales de competidores",
      description: "Los competidores no van a darte espacio editorial",
      rule_type: "domain_exact",
      rule_value: { domains: compDomains },
      selected: true,
    });
  }

  // 3. Spain market: Exclude banks and neobanks (REGLA CRITICA #1 from our workflow)
  if (market === "es") {
    suggestions.push({
      rule_name: "Excluir bancos espanoles y neobancos",
      description: "Sitios oficiales de bancos y sus blogs. Son competidores del sector, no medios editoriales.",
      rule_type: "domain_contains",
      rule_value: {
        domains: [
          // Bancos españoles
          "bbva.com", "bbva.es",
          "bankinter.com",
          "caixabank.es", "caixabank.com",
          "openbank.es",
          "ing.es",
          "santander.es",
          "sabadell.com",
          "unicaja.es",
          "kutxabank.es",
          "abanca.com",
          "cuentasclaras.es", // ABANCA blog
          "imaginbank.com",
          "evo.es",
          // Neobancos
          "n26.com",
          "revolut.com",
          "wise.com",
          "bnext.es",
          "vivid.money",
          "bunq.com",
        ],
      },
      selected: true,
    });

    suggestions.push({
      rule_name: "Excluir empresas fintech del sector",
      description: "Apps financieras, microcréditos, y empresas del sector que no darian espacio a tu marca.",
      rule_type: "domain_contains",
      rule_value: {
        domains: [
          "fintonic.com",
          "banktrack.com",
          "b100.es",
          "dineo.es",
          "pibank.es",
          "cetelem.es",
          "cofidis.es",
          "younited-credit.com",
        ],
      },
      selected: true,
    });

    suggestions.push({
      rule_name: "Excluir plataformas genericas no relevantes",
      description: "Redes sociales, Wikipedia, plataformas donde no puedes hacer outreach editorial",
      rule_type: "domain_contains",
      rule_value: {
        domains: [
          "wikipedia.org",
          "facebook.com",
          "twitter.com",
          "x.com",
          "instagram.com",
          "linkedin.com",
          "youtube.com",
          "reddit.com",
          "tiktok.com",
          "trustpilot.com",
          "trustpilot.es",
        ],
      },
      selected: true,
    });
  }

  return suggestions;
}

interface ExclusionRulesProps {
  projectId: string;
  brandDomain: string | null;
  competitorDomains: string[];
  market: string;
  existingRules: ExclusionRule[];
  onCreateRule: (rule: {
    project_id: string;
    rule_name: string;
    rule_type: string;
    rule_value: Record<string, unknown>;
    description?: string;
  }) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
}

export function ExclusionRules({
  projectId,
  brandDomain,
  competitorDomains,
  market,
  existingRules,
  onCreateRule,
  onDeleteRule,
}: ExclusionRulesProps) {
  const [suggestions, setSuggestions] = useState<RuleSuggestion[]>([]);
  const [generated, setGenerated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const handleGenerate = () => {
    const sugs = generateExclusionSuggestions(brandDomain, competitorDomains, market);
    // Filter out rules that already exist (by name)
    const existingNames = new Set(existingRules.map((r) => r.rule_name.toLowerCase()));
    const filtered = sugs.filter((s) => !existingNames.has(s.rule_name.toLowerCase()));
    setSuggestions(filtered);
    setGenerated(true);
  };

  const toggleSuggestion = (idx: number) => {
    setSuggestions((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, selected: !s.selected } : s))
    );
  };

  const handleApply = async () => {
    const selected = suggestions.filter((s) => s.selected);
    if (selected.length === 0) return;
    setSubmitting(true);
    setSavedCount(null);
    try {
      for (const s of selected) {
        await onCreateRule({
          project_id: projectId,
          rule_name: s.rule_name,
          rule_type: s.rule_type,
          rule_value: s.rule_value,
          description: s.description,
        });
      }
      setSavedCount(selected.length);
      setSuggestions((prev) => prev.filter((s) => !s.selected));
      setTimeout(() => setSavedCount(null), 5000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    setDeletingId(ruleId);
    try {
      await onDeleteRule(ruleId);
    } finally {
      setDeletingId(null);
    }
  };

  const selectedCount = suggestions.filter((s) => s.selected).length;

  return (
    <div className="space-y-4">
      {/* Description */}
      <p className="text-xs text-comic-ink-soft">
        Dominios que se excluyen del analisis. Bancos, competidores y redes sociales no son oportunidades editoriales.
      </p>

      {/* Save confirmation */}
      {savedCount !== null && (
        <div className="rounded-sm border-2 border-comic-sage bg-comic-sage/10 px-3 py-2 text-xs font-bold text-comic-sage">
          Guardado — {savedCount} regla{savedCount !== 1 ? "s" : ""} de exclusion aplicadas.
        </div>
      )}

      {/* Existing rules */}
      {existingRules.length > 0 && (
        <div className="space-y-1">
          {existingRules.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-sm border border-comic-ink/15 bg-comic-aged/20 px-3 py-2">
              <div>
                <p className="text-xs font-bold text-comic-ink">{r.rule_name}</p>
                {r.description && (
                  <p className="text-[11px] text-comic-ink-soft">{r.description}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(r.id)}
                disabled={deletingId === r.id}
                className="shrink-0 rounded-sm p-1 text-comic-ink-soft/40 hover:text-comic-rust hover:bg-comic-rust/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Generate suggestions */}
      {!generated && (
        <button
          onClick={handleGenerate}
          className="flex items-center gap-2 rounded-sm border-2 border-dashed border-comic-rust/30 bg-comic-rust/5 px-4 py-3 text-sm font-bold text-comic-rust hover:bg-comic-rust/10 w-full justify-center transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          Sugerir reglas de exclusion
        </button>
      )}

      {generated && suggestions.length > 0 && (
        <div className="space-y-1">
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              onClick={() => toggleSuggestion(idx)}
              className={cn(
                "flex items-start gap-2 rounded-sm border px-3 py-2 text-left text-xs w-full transition-colors",
                s.selected
                  ? "border-comic-navy/30 bg-comic-navy/5"
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
              <div className="flex-1">
                <p className="font-bold text-comic-ink">{s.rule_name}</p>
                <p className="text-[11px] text-comic-ink-soft">{s.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {generated && suggestions.length === 0 && (
        <div className="rounded-sm border-2 border-dashed border-comic-ink/20 p-4 text-center text-xs text-comic-ink-soft">
          Todas las reglas sugeridas ya estan aplicadas.
        </div>
      )}

      {/* Apply button */}
      {generated && selectedCount > 0 && (
        <button
          onClick={handleApply}
          disabled={submitting}
          className={cn(
            "flex items-center gap-2 rounded-sm border-2 border-comic-ink px-4 py-2 text-xs font-bold shadow-comic-xs transition-all",
            submitting
              ? "bg-comic-aged text-comic-ink-soft cursor-not-allowed"
              : "bg-comic-navy text-white hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          )}
        >
          {submitting ? "Aplicando..." : `Aplicar ${selectedCount} regla${selectedCount !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
