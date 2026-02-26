"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  geo,
  prompts as promptsApi,
  type AggregatedResult,
  type GeoRun,
  type JobStatus,
} from "@/lib/api";
import { useJobPolling } from "@/hooks/useJobPolling";
import { cn } from "@/lib/utils";

// ── Token estimation (based on real test data) ──
// Per prompt × per provider: 3 turns, avg ~1,880 tokens total
const TOKENS_PER_PROMPT_PROVIDER = 1_880;
const PROVIDERS_DEFAULT = ["openai", "anthropic", "gemini", "perplexity"];

const PROVIDER_PRICING: Record<string, { input: number; output: number; label: string }> = {
  openai:     { input: 2.50,  output: 10.00, label: "GPT-4o" },
  anthropic:  { input: 3.00,  output: 15.00, label: "Claude Sonnet" },
  gemini:     { input: 0.038, output: 0.15,  label: "Gemini Flash" },
  perplexity: { input: 3.00,  output: 15.00, label: "Sonar Pro" },
};

function estimateCost(promptCount: number, providers: string[]): { tokens: number; cost: number } {
  const totalTokens = promptCount * providers.length * TOKENS_PER_PROMPT_PROVIDER;
  // Rough split: 30% input, 70% output
  const inputTokens = totalTokens * 0.3;
  const outputTokens = totalTokens * 0.7;
  let cost = 0;
  for (const p of providers) {
    const pricing = PROVIDER_PRICING[p];
    if (!pricing) continue;
    const perProvider = promptCount * TOKENS_PER_PROMPT_PROVIDER;
    cost += (perProvider * 0.3 / 1_000_000) * pricing.input;
    cost += (perProvider * 0.7 / 1_000_000) * pricing.output;
  }
  return { tokens: totalTokens, cost };
}

export default function GeoPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [runs, setRuns] = useState<GeoRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<GeoRun | null>(null);
  const [metrics, setMetrics] = useState<AggregatedResult | null>(null);
  const [launching, setLaunching] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [promptCount, setPromptCount] = useState(0);
  const { job, isRunning } = useJobPolling(activeJobId);

  const loadRuns = useCallback(() => {
    geo.listRuns(projectId).then((r) => {
      setRuns(r);
      if (r.length > 0 && !selectedRun) setSelectedRun(r[0]);
    });
  }, [projectId, selectedRun]);

  useEffect(() => {
    loadRuns();
    promptsApi.list(projectId).then((p) => setPromptCount(p.length));
  }, [loadRuns, projectId]);

  useEffect(() => {
    if (!selectedRun || selectedRun.status !== "completed") {
      setMetrics(null);
      return;
    }
    geo.getMetrics(selectedRun.id).then(setMetrics).catch(console.error);
  }, [selectedRun]);

  useEffect(() => {
    if (job?.status === "completed") {
      loadRuns();
      setActiveJobId(null);
    }
  }, [job?.status, loadRuns]);

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      const jobStatus = await geo.createRun(projectId);
      setActiveJobId(jobStatus.id);
    } catch (e) {
      console.error(e);
    } finally {
      setLaunching(false);
    }
  };

  const estimate = estimateCost(promptCount, PROVIDERS_DEFAULT);

  return (
    <div className="space-y-6">
      {/* ═══ Header — Comic style ═══ */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-comic-ink">
            GEO Visibility Analysis
          </h2>
          <p className="text-sm text-comic-ink-soft">
            Descubre donde apareces en ChatGPT, Claude, Gemini y Perplexity
          </p>
        </div>
        <button
          onClick={handleLaunch}
          disabled={launching || isRunning}
          className={cn(
            "rounded-sm border-2 border-comic-ink bg-comic-rust px-5 py-2.5 text-sm font-bold text-white shadow-comic-sm transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none",
            (launching || isRunning) && "opacity-50 cursor-not-allowed"
          )}
        >
          {isRunning
            ? `Analizando... ${Math.round((job?.progress ?? 0) * 100)}%`
            : launching
            ? "Lanzando..."
            : "Lanzar Analisis GEO"}
        </button>
      </div>

      {/* ═══ Token estimation panel ═══ */}
      {promptCount > 0 && !isRunning && !metrics && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-yellow-pale p-4 shadow-comic-xs comic-halftone-yellow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-comic-ink">Estimacion antes de lanzar</p>
              <p className="text-xs text-comic-ink-soft mt-1">
                {promptCount} prompts x {PROVIDERS_DEFAULT.length} providers x 3 turnos
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-comic-ink">
                ~{(estimate.tokens / 1000).toFixed(0)}K tokens
              </p>
              <p className="text-sm font-black text-comic-rust">
                {estimate.cost < 1
                  ? `~${Math.round(estimate.cost * 100)} centavos USD`
                  : `~${estimate.cost.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`}
              </p>
              <p className="text-[10px] text-comic-ink-soft mt-0.5">
                (menos de {Math.ceil(estimate.cost)} USD)
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {PROVIDERS_DEFAULT.map((p) => {
              const pricing = PROVIDER_PRICING[p];
              const perProvider = promptCount * TOKENS_PER_PROMPT_PROVIDER;
              const provCost = (perProvider * 0.3 / 1_000_000) * pricing.input + (perProvider * 0.7 / 1_000_000) * pricing.output;
              return (
                <div key={p} className="rounded-sm border border-comic-ink bg-comic-paper px-2 py-1.5 text-center">
                  <p className="text-[10px] font-bold text-comic-ink-soft">{pricing.label}</p>
                  <p className="text-xs font-bold text-comic-ink">{(perProvider / 1000).toFixed(0)}K</p>
                  <p className="text-[10px] text-comic-rust">
                    {provCost < 0.01
                      ? `${(provCost * 100).toFixed(1)} ¢`
                      : `${provCost.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Progress bar — Comic style ═══ */}
      {isRunning && job && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-4 shadow-comic-xs">
          <div className="mb-2 flex justify-between text-sm font-bold text-comic-ink">
            <span>Analisis en progreso...</span>
            <span>{Math.round(job.progress * 100)}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-sm border-2 border-comic-ink bg-comic-aged">
            <div
              className="h-full bg-comic-cyan transition-all"
              style={{ width: `${job.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ═══ Run selector — Comic pills ═══ */}
      {runs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {runs.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedRun(r)}
              className={cn(
                "shrink-0 rounded-sm border-2 border-comic-ink px-3 py-1.5 text-sm font-bold transition-all",
                selectedRun?.id === r.id
                  ? "bg-comic-rust text-white shadow-comic-xs"
                  : "bg-comic-paper text-comic-ink hover:bg-comic-aged"
              )}
            >
              {r.name || new Date(r.created_at).toLocaleDateString()}
              <span className={cn(
                "ml-2 text-xs",
                selectedRun?.id === r.id ? "text-white/70" : "text-comic-ink-soft"
              )}>
                {r.status}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ═══ Metrics ═══ */}
      {metrics && (
        <div className="space-y-6">
          {/* Summary cards — Comic panels */}
          <div className="comic-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div className="p-4 text-center">
              <p className="text-xs font-bold text-comic-ink-soft uppercase tracking-wide">Prompts</p>
              <p className="text-3xl font-black text-comic-rust">{metrics.total_prompts}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs font-bold text-comic-ink-soft uppercase tracking-wide">Respuestas</p>
              <p className="text-3xl font-black text-comic-cyan">{metrics.total_responses}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs font-bold text-comic-ink-soft uppercase tracking-wide">Marcas</p>
              <p className="text-3xl font-black text-comic-navy">{metrics.brands.length}</p>
            </div>
          </div>

          {/* Brand visibility table — Comic style */}
          <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-sm overflow-hidden">
            <div className="border-b-2 border-comic-ink bg-comic-navy px-4 py-2">
              <h3 className="text-sm font-black text-white uppercase tracking-wide">Visibilidad de Marcas</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-comic-ink bg-comic-aged">
                  <th className="px-4 py-2.5 text-left text-xs font-black text-comic-ink uppercase">Marca</th>
                  <th className="px-4 py-2.5 text-right text-xs font-black text-comic-ink uppercase">Visibilidad</th>
                  <th className="px-4 py-2.5 text-right text-xs font-black text-comic-ink uppercase">Pos. Media</th>
                  <th className="px-4 py-2.5 text-center text-xs font-black text-comic-ink uppercase">Sentiment</th>
                  <th className="px-4 py-2.5 text-right text-xs font-black text-comic-ink uppercase">Menciones</th>
                </tr>
              </thead>
              <tbody>
                {metrics.brands.map((b) => (
                  <tr key={b.brand_name} className="border-b border-comic-aged last:border-0 hover:bg-comic-yellow-pale/30">
                    <td className="px-4 py-3 text-sm font-bold text-comic-ink">{b.brand_name}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "text-sm font-black",
                        b.visibility_pct > 50 ? "text-comic-sage" :
                        b.visibility_pct > 0 ? "text-comic-rust" : "text-comic-ink-soft"
                      )}>
                        {b.visibility_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-comic-ink">
                      {b.avg_position?.toFixed(1) ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "rounded-sm border border-comic-ink px-2 py-0.5 text-xs font-bold",
                        b.sentiment_label === "positive" && "bg-comic-sage text-white",
                        b.sentiment_label === "neutral" && "bg-comic-aged text-comic-ink",
                        b.sentiment_label === "negative" && "bg-comic-red text-white"
                      )}>
                        {b.sentiment_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-black text-comic-ink">
                      {b.mention_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ═══ Editorial Targets — Comic style ═══ */}
          {metrics.top_cited_domains.length > 0 && (() => {
            const editorial = metrics.top_cited_domains.filter(
              (d) => d.domain_type === "editorial" && !d.is_excluded
            );
            const corporate = metrics.top_cited_domains.filter(
              (d) => d.domain_type === "corporate" && !d.is_excluded
            );
            const other = metrics.top_cited_domains.filter(
              (d) => d.domain_type !== "editorial" && d.domain_type !== "corporate" && !d.is_excluded
            );
            return (
              <div className="space-y-6">
                {editorial.length > 0 && (
                  <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-sm overflow-hidden">
                    <div className="border-b-2 border-comic-ink bg-comic-sage px-4 py-2 flex items-center justify-between">
                      <h3 className="text-sm font-black text-white uppercase tracking-wide">
                        Medios Editoriales Target
                      </h3>
                      <span className="rounded-sm bg-white/20 px-2 py-0.5 text-xs font-bold text-white">
                        {editorial.length} medios
                      </span>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b-2 border-comic-ink bg-comic-aged">
                          <th className="px-4 py-2 text-left text-xs font-black text-comic-ink uppercase">Dominio</th>
                          <th className="px-4 py-2 text-left text-xs font-black text-comic-ink uppercase">Titulo</th>
                          <th className="px-4 py-2 text-center text-xs font-black text-comic-ink uppercase">Tipo</th>
                          <th className="px-4 py-2 text-center text-xs font-black text-comic-ink uppercase">Citas</th>
                          <th className="px-4 py-2 text-center text-xs font-black text-comic-ink uppercase">Sponsored</th>
                          <th className="px-4 py-2 text-left text-xs font-black text-comic-ink uppercase">Providers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editorial.map((d) => (
                          <tr key={d.domain} className="border-b border-comic-aged last:border-0 hover:bg-comic-yellow-pale/30">
                            <td className="px-4 py-2 text-sm font-bold">
                              {d.urls?.[0] ? (
                                <a href={d.urls[0]} target="_blank" rel="noopener noreferrer" className="text-comic-cyan hover:text-comic-rust transition-colors">
                                  {d.domain}
                                </a>
                              ) : d.domain}
                            </td>
                            <td className="px-4 py-2 text-sm text-comic-ink-soft truncate max-w-[200px]">
                              {d.title || "-"}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={cn(
                                "rounded-sm border border-comic-ink px-2 py-0.5 text-xs font-bold",
                                d.content_type === "ranking" && "bg-comic-cyan text-white",
                                d.content_type === "review" && "bg-comic-navy text-white",
                                d.content_type === "solution" && "bg-comic-yellow text-comic-ink",
                                d.content_type === "other" && "bg-comic-aged text-comic-ink",
                              )}>
                                {d.content_type}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-sm border border-comic-ink bg-comic-rust text-xs font-black text-white">
                                {d.count}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center text-sm">
                              {d.accepts_sponsored ? (
                                <span className="font-black text-comic-sage">SI</span>
                              ) : (
                                <span className="text-comic-ink-soft">-</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-sm text-comic-ink-soft font-semibold">
                              {d.providers.join(", ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {corporate.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-black text-comic-ink uppercase tracking-wide">
                      Dominios Competidores
                      <span className="ml-2 text-xs font-normal normal-case text-comic-ink-soft">
                        Sitios corporativos citados por IAs
                      </span>
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {corporate.map((d) => (
                        <div key={d.domain} className="flex items-center justify-between rounded-sm border-2 border-comic-ink bg-comic-paper px-3 py-2 shadow-comic-xs">
                          <span className="truncate text-sm font-bold text-comic-ink">{d.domain}</span>
                          <span className="ml-2 shrink-0 rounded-sm bg-comic-aged px-1.5 py-0.5 text-xs font-bold text-comic-ink">{d.count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {other.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-black text-comic-ink uppercase tracking-wide">
                      Otras Fuentes
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {other.map((d) => (
                        <div key={d.domain} className="flex items-center justify-between rounded-sm border border-comic-ink bg-comic-paper px-3 py-2">
                          <div className="flex items-center gap-2 truncate">
                            <span className="truncate text-sm font-semibold text-comic-ink">{d.domain}</span>
                            {d.domain_type && (
                              <span className="shrink-0 rounded-sm bg-comic-aged px-1.5 py-0.5 text-[10px] font-bold text-comic-ink-soft">
                                {d.domain_type}
                              </span>
                            )}
                          </div>
                          <span className="ml-2 shrink-0 text-xs font-bold text-comic-ink-soft">{d.count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ Empty state — Comic style ═══ */}
      {runs.length === 0 && !isRunning && (
        <div className="rounded-sm border-2 border-dashed border-comic-ink p-12 text-center bg-comic-paper comic-halftone-cool">
          <p className="text-lg font-black text-comic-ink">Sin analisis GEO todavia</p>
          <p className="mt-2 text-sm text-comic-ink-soft">
            Lanza tu primer analisis para ver la visibilidad de marcas en IAs generativas.
          </p>
        </div>
      )}
    </div>
  );
}
