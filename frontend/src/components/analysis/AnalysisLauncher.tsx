"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Play, CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw } from "lucide-react";

// ── Windmill spinner (from Sancho_CMO design, CSS-only) ─────────────
function WindmillSpinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      style={{ animationDuration: "2.5s" }}
      viewBox="0 0 64 64"
      fill="none"
    >
      <circle cx="32" cy="32" r="5" fill="currentColor" />
      <path d="M32 27L28 4L36 4L32 27Z" fill="currentColor" />
      <path d="M37 32L60 28L60 36L37 32Z" fill="currentColor" opacity="0.85" />
      <path d="M32 37L36 60L28 60L32 37Z" fill="currentColor" opacity="0.7" />
      <path d="M27 32L4 36L4 28L27 32Z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

// ── Sancho Panza quotes while analysis runs ─────────────────────────
const SANCHO_QUOTES = [
  { text: "Paciencia y barajar.", source: "Sancho Panza, II parte, cap. XXIV" },
  { text: "La diligencia es madre de la buena ventura.", source: "Sancho Panza, I parte, cap. XLVI" },
  { text: "No hay camino que no se acabe, como no se le oponga la pereza.", source: "Sancho Panza, II parte, cap. XXXIII" },
  { text: "Duerme, amigo Sancho, que yo velere por los dos.", source: "Don Quijote, I parte, cap. XX" },
  { text: "El que larga vida vive, mucho mal ha de pasar.", source: "Sancho Panza, II parte, cap. XXXII" },
  { text: "Mientras se duerme, todos somos iguales.", source: "Sancho Panza, II parte, cap. XLIII" },
];


export interface AnalysisJob {
  id: string;
  label: string;
  description: string;
  status: "idle" | "running" | "completed" | "failed";
  progress: number;
  jobId: string | null;
  error: string | null;
  stepInfo: Record<string, unknown> | null;
}

// ── Token estimation constants ──────────────────────────────────────
const GEO_TOKENS_PER_PROMPT_PROVIDER = 1_880; // 3 turns avg
const GEO_PROVIDERS = ["openai", "anthropic", "gemini", "perplexity"];

const GEO_PROVIDER_PRICING: Record<string, { input: number; output: number; label: string }> = {
  openai:     { input: 2.50,  output: 10.00, label: "GPT-4o" },
  anthropic:  { input: 3.00,  output: 15.00, label: "Claude Sonnet" },
  gemini:     { input: 0.038, output: 0.15,  label: "Gemini Flash" },
  perplexity: { input: 3.00,  output: 15.00, label: "Sonar Pro" },
};

// SEO: SERP API cost per query + minor LLM fallback for classification
const SEO_SERP_COST_PER_QUERY = 0.01; // ~$0.01 per SERP call (Serper)
const SEO_LLM_TOKENS_PER_QUERY = 50;  // ~20% of queries need LLM fallback, avg ~250 tokens each

// Gap: purely DB, zero cost
const GAP_TOKENS = 0;
const GAP_COST = 0;


function estimateGeo(promptCount: number) {
  const totalTokens = promptCount * GEO_PROVIDERS.length * GEO_TOKENS_PER_PROMPT_PROVIDER;
  let cost = 0;
  for (const p of GEO_PROVIDERS) {
    const pricing = GEO_PROVIDER_PRICING[p];
    const perProvider = promptCount * GEO_TOKENS_PER_PROMPT_PROVIDER;
    cost += (perProvider * 0.3 / 1_000_000) * pricing.input;
    cost += (perProvider * 0.7 / 1_000_000) * pricing.output;
  }
  return { tokens: totalTokens, cost, providers: GEO_PROVIDERS.length };
}

function estimateSeo(queryCount: number) {
  const serpCost = queryCount * SEO_SERP_COST_PER_QUERY;
  const llmTokens = queryCount * SEO_LLM_TOKENS_PER_QUERY;
  // LLM cost for classification fallback is negligible (~$0.0001/query)
  const llmCost = (llmTokens / 1_000_000) * 2.50; // GPT-4o input price
  return { tokens: llmTokens, cost: serpCost + llmCost, serpCalls: queryCount };
}

function formatCostES(cost: number): string {
  if (cost === 0) return "0,00 $";
  if (cost < 0.01) return `${(cost * 100).toFixed(1)} ¢`;
  return `${cost.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

function formatTokens(tokens: number): string {
  if (tokens === 0) return "0";
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(0)}K`;
}

// ── Component ───────────────────────────────────────────────────────

interface AnalysisLauncherProps {
  jobs: AnalysisJob[];
  onLaunchAll: () => Promise<void>;
  onLaunchSingle: (jobId: string) => Promise<void>;
  canLaunch: boolean;
  disabledReason?: string;
  promptCount?: number;
  queryCount?: number;
  lastAnalysisDate?: string | null;
}

const STATUS_ICONS = {
  idle: <Clock className="h-4 w-4 text-comic-ink-soft" />,
  running: <WindmillSpinner className="h-4 w-4 text-comic-cyan" />,
  completed: <CheckCircle2 className="h-4 w-4 text-comic-sage" />,
  failed: <XCircle className="h-4 w-4 text-comic-red" />,
};

export function AnalysisLauncher({
  jobs,
  onLaunchAll,
  onLaunchSingle,
  canLaunch,
  disabledReason,
  promptCount = 0,
  queryCount = 0,
  lastAnalysisDate,
}: AnalysisLauncherProps) {
  const [launching, setLaunching] = useState(false);
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const anyRunning = jobs.some((j) => j.status === "running");
  const allCompleted = jobs.every((j) => j.status === "completed");
  const hasExistingResults = !!lastAnalysisDate;

  // Rotate Sancho quotes every 20s while running
  useEffect(() => {
    if (!anyRunning) return;
    setQuoteIdx(Math.floor(Math.random() * SANCHO_QUOTES.length));
    const timer = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % SANCHO_QUOTES.length);
    }, 20_000);
    return () => clearInterval(timer);
  }, [anyRunning]);

  const geoEst = estimateGeo(promptCount);
  const seoEst = estimateSeo(queryCount);
  const totalTokens = geoEst.tokens + seoEst.tokens + GAP_TOKENS;
  const totalCost = geoEst.cost + seoEst.cost + GAP_COST;

  const estimates: Record<string, { tokens: number; cost: number; detail: string }> = {
    geo: {
      tokens: geoEst.tokens,
      cost: geoEst.cost,
      detail: `${promptCount} prompts × ${geoEst.providers} providers × 3 turnos`,
    },
    seo: {
      tokens: seoEst.tokens,
      cost: seoEst.cost,
      detail: `${queryCount} keywords × SERP API + clasificacion`,
    },
    gap: {
      tokens: 0,
      cost: 0,
      detail: "Solo calculo local, sin coste API",
    },
  };

  const handleLaunchAll = async () => {
    setLaunching(true);
    try {
      await onLaunchAll();
    } finally {
      setLaunching(false);
    }
  };

  const handleMainButtonClick = () => {
    if (hasExistingResults) {
      setShowConfirm(true);
    } else {
      handleLaunchAll();
    }
  };

  const handleConfirmRelaunch = () => {
    setShowConfirm(false);
    handleLaunchAll();
  };

  const formattedDate = lastAnalysisDate
    ? new Date(lastAnalysisDate).toLocaleString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-4">
      {/* Header + Launch button */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-black text-comic-ink uppercase tracking-wide">
            Ejecutar Analisis
          </h4>
          <p className="text-xs text-comic-ink-soft mt-0.5">
            {allCompleted
              ? "Analisis completado. Puedes ver los resultados."
              : "Lanza los análisis SEO (Google) y GEO (IAs) para este nicho. Primero SEO, después GEO."}
          </p>
        </div>
        {!allCompleted && (
          <button
            onClick={handleMainButtonClick}
            disabled={!canLaunch || launching || anyRunning}
            className={cn(
              "flex items-center gap-2 rounded-sm border-2 border-comic-ink px-5 py-2.5 text-sm font-black shadow-comic-sm transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none",
              !canLaunch || launching || anyRunning
                ? "bg-comic-aged text-comic-ink-soft cursor-not-allowed"
                : hasExistingResults
                  ? "bg-comic-rust text-white"
                  : "bg-comic-yellow text-comic-ink"
            )}
          >
            {anyRunning ? (
              <>
                <WindmillSpinner className="h-4 w-4" />
                Analizando...
              </>
            ) : hasExistingResults ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Re-lanzar
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Lanzar todo
              </>
            )}
          </button>
        )}
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="rounded-sm border-2 border-comic-rust bg-comic-paper p-4 shadow-comic-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-comic-rust shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-comic-ink">
                ¿Seguro que quieres re-lanzar el análisis?
              </p>
              <p className="text-xs text-comic-ink-soft mt-1">
                Ya tenemos resultados del <span className="font-semibold text-comic-ink">{formattedDate}</span>. El nuevo análisis sobreescribirá los datos existentes.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleConfirmRelaunch}
                  className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-rust px-3 py-1.5 text-xs font-bold text-white shadow-comic-xs hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                >
                  <RefreshCw className="h-3 w-3" />
                  Sí, relanzar
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="rounded-sm border-2 border-comic-ink bg-comic-aged px-3 py-1.5 text-xs font-bold text-comic-ink hover:bg-comic-aged/70 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Total estimation banner */}
      {!allCompleted && canLaunch && !anyRunning && (promptCount > 0 || queryCount > 0) && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-yellow-pale p-3 shadow-comic-xs comic-halftone-yellow">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-comic-ink">
              Consumo total estimado
            </p>
            <div className="flex items-center gap-4">
              <span className="text-sm font-black text-comic-ink">
                ~{formatTokens(totalTokens)} tokens
              </span>
              <span className="text-sm font-black text-comic-rust">
                ~{formatCostES(totalCost)}
              </span>
              <span className="text-[10px] text-comic-ink-soft">
                (menos de {Math.ceil(totalCost)} USD)
              </span>
            </div>
          </div>
        </div>
      )}

      {!canLaunch && disabledReason && (
        <p className="text-xs text-comic-ink-soft">{disabledReason}</p>
      )}

      {/* Sancho Panza quote while running */}
      {anyRunning && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-4 shadow-comic-xs text-center">
          <p className="text-sm italic text-comic-ink leading-relaxed">
            &ldquo;{SANCHO_QUOTES[quoteIdx].text}&rdquo;
          </p>
          <p className="mt-1 text-[10px] text-comic-ink-soft font-semibold">
            — {SANCHO_QUOTES[quoteIdx].source}
          </p>
        </div>
      )}

      {/* Job cards */}
      <div className="space-y-2">
        {jobs.map((job) => {
          const est = estimates[job.id];
          // Gap requires SEO + GEO completed
          const seoJob = jobs.find((j) => j.id === "seo");
          const geoJob = jobs.find((j) => j.id === "geo");
          const gapBlocked =
            job.id === "gap" &&
            (seoJob?.status !== "completed" || geoJob?.status !== "completed");

          return (
            <div
              key={job.id}
              className={cn(
                "rounded-sm border-2 border-comic-ink bg-comic-paper p-4 shadow-comic-xs",
                job.status === "completed" && "border-comic-sage/50 bg-comic-paper",
                job.status === "failed" && "border-comic-red/50",
                gapBlocked && job.status === "idle" && "opacity-60",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {STATUS_ICONS[job.status]}
                  <div>
                    <p className="text-sm font-bold text-comic-ink">{job.label}</p>
                    <p className="text-xs text-comic-ink-soft">
                      {gapBlocked && job.status === "idle"
                        ? "Requiere que SEO y GEO esten completados"
                        : job.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Token estimate badge */}
                  {job.status === "idle" && est && !gapBlocked && (
                    <div className="hidden sm:flex items-center gap-2 text-right">
                      <div>
                        <p className="text-xs font-bold text-comic-ink">
                          {formatTokens(est.tokens)} tokens
                        </p>
                        <p className="text-[10px] text-comic-rust font-semibold">
                          {formatCostES(est.cost)}
                        </p>
                      </div>
                    </div>
                  )}
                  {job.status === "idle" && canLaunch && !gapBlocked && (
                    <button
                      onClick={() => onLaunchSingle(job.id)}
                      disabled={anyRunning}
                      className="flex items-center gap-1 rounded-sm border border-comic-ink px-3 py-1.5 text-xs font-bold text-comic-rust hover:bg-comic-aged disabled:opacity-50"
                    >
                      <Play className="h-3 w-3" />
                      Ejecutar
                    </button>
                  )}
                </div>
              </div>

              {/* Detail line for idle state */}
              {job.status === "idle" && est && (
                <p className="mt-1.5 ml-7 text-[10px] text-comic-ink-soft">
                  {est.detail}
                </p>
              )}

              {/* Progress bar + current step */}
              {job.status === "running" && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-comic-ink-soft">
                    <span>Progreso</span>
                    <span className="font-bold">{Math.round(job.progress * 100)}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-sm border border-comic-ink bg-comic-aged">
                    <div
                      className="h-full bg-comic-cyan transition-all"
                      style={{ width: `${job.progress * 100}%` }}
                    />
                  </div>
                  {/* Current step info */}
                  {job.stepInfo && (
                    <p className="mt-1.5 text-[11px] text-comic-ink-soft italic truncate">
                      {job.id === "seo" && !!job.stepInfo.current_keyword && (
                        <>
                          Buscando: <span className="font-semibold not-italic">{String(job.stepInfo.current_keyword)}</span>
                          {!!job.stepInfo.step && !!job.stepInfo.total && (
                            <span className="ml-1 not-italic">({String(job.stepInfo.step)}/{String(job.stepInfo.total)})</span>
                          )}
                        </>
                      )}
                      {job.id === "geo" && !!job.stepInfo.current_prompt && (
                        <>
                          Prompt{!!job.stepInfo.step && !!job.stepInfo.total && (
                            <span className="not-italic ml-0.5">
                              {String(job.stepInfo.step)}/{String(job.stepInfo.total)}
                            </span>
                          )}: <span className="font-semibold not-italic">{String(job.stepInfo.current_prompt)}</span>...
                        </>
                      )}
                    </p>
                  )}
                </div>
              )}

              {/* Error */}
              {job.status === "failed" && job.error && (
                <p className="mt-2 text-xs text-comic-red font-semibold">{job.error}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
