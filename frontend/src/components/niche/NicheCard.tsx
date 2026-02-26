"use client";

import Link from "next/link";
import { Target, Users, Trash2, Handshake, Zap, Settings, Play, CheckCircle2, AlertCircle, Circle, Star, Pencil } from "lucide-react";
import type { Niche } from "@/lib/api";
import type { NicheStats } from "@/hooks/useWizardState";

interface NicheCardProps {
  niche: Niche;
  projectId: string;
  stats?: NicheStats;
  onDelete?: (niche: Niche) => void;
}

type ReadyLevel = "no_competitors" | "no_config" | "no_analysis" | "ready";

function getReadyLevel(niche: Niche, stats?: NicheStats): ReadyLevel {
  if (niche.competitor_count === 0) return "no_competitors";
  // stats undefined = still loading → don't assume misconfigured
  if (!stats) return "no_config";
  // Require BOTH keywords and prompts to be configured
  if (!stats.keywordCount || !stats.promptCount) return "no_config";
  if (!stats.seoReady && !stats.geoReady) return "no_analysis";
  return "ready";
}

export function NicheCard({ niche, projectId, stats, onDelete }: NicheCardProps) {
  const level = getReadyLevel(niche, stats);
  const base = `/projects/${projectId}/niches/${niche.slug}`;

  return (
    <div className="group relative rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">

      {/* Main info */}
      <Link href={base} className="block p-4 pb-3">
          <div className="flex items-center gap-2 pr-14">
            <Target className="h-4 w-4 text-comic-rust shrink-0" />
            <h3 className="font-black text-comic-ink">{niche.name}</h3>
          </div>
          {niche.description && (
            <p className="mt-1 text-xs text-comic-ink-soft line-clamp-2">{niche.description}</p>
          )}
          <div className="mt-1.5 flex gap-3 text-xs text-comic-ink-soft">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {niche.competitor_count} competidor{niche.competitor_count !== 1 ? "es" : ""}
            </span>
          </div>
      </Link>

      {/* ── READY: status row + action buttons ── */}
      {level === "ready" && (
        <>
          {/* Configured status strip */}
          <div className="mx-4 mb-3 rounded-sm bg-comic-sage/10 border border-comic-sage/25 px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-comic-sage shrink-0" />
              <span className="text-[11px] font-black text-comic-sage">Configurado correctamente</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-comic-sage/70">
              <span className="flex items-center gap-0.5">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {stats?.keywordCount} kw
              </span>
              <span className="flex items-center gap-0.5">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {stats?.promptCount} prompts
              </span>
              {stats?.seoReady && (
                <span className="flex items-center gap-0.5">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  SEO
                </span>
              )}
              {stats?.geoReady && (
                <span className="flex items-center gap-0.5">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  GEO
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="border-t-2 border-comic-ink/10 grid grid-cols-3">
            <Link
              href={`${base}/results`}
              className="flex flex-col items-center justify-center gap-0.5 py-2.5 border-r-2 border-comic-ink/10 hover:bg-comic-cyan/10 transition-colors"
            >
              <span className="flex items-center gap-1 text-[11px] font-black text-comic-navy">
                <Handshake className="h-3.5 w-3.5" />
                Partnerships
              </span>
              {(stats?.seoReady || stats?.geoReady) ? (
                <span className="flex items-center gap-0.5 text-[9px] font-bold text-comic-sage">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Analizado
                </span>
              ) : (
                <span className="text-[9px] text-comic-ink-soft">Dónde publicar</span>
              )}
            </Link>
            <Link
              href={`${base}/dominar`}
              className="flex flex-col items-center justify-center gap-0.5 py-2.5 border-r-2 border-comic-ink/10 hover:bg-comic-rust/10 transition-colors"
            >
              <span className="flex items-center gap-1 text-[11px] font-black text-comic-rust">
                <Zap className="h-3.5 w-3.5" />
                Dominar
              </span>
              <span className="text-[9px] text-comic-ink-soft">SEO + GEO</span>
            </Link>
            <Link
              href={`${base}/influencers`}
              className="flex flex-col items-center justify-center gap-0.5 py-2.5 hover:bg-comic-yellow/10 transition-colors"
            >
              <span className="flex items-center gap-1 text-[11px] font-black text-comic-ink">
                <Star className="h-3.5 w-3.5" />
                Influencers
              </span>
              {stats?.influencerCount ? (
                <span className="flex items-center gap-0.5 text-[9px] font-bold text-comic-sage">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  {stats.influencerCount} perfiles
                </span>
              ) : (
                <span className="text-[9px] text-comic-ink-soft">Creadores</span>
              )}
            </Link>
          </div>
        </>
      )}

      {/* ── NOT READY: single-row next step CTA ── */}
      {level !== "ready" && (
        <div className="border-t-2 border-comic-ink/10">
          {level === "no_analysis" ? (
            <Link
              href={`${base}/analyze`}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-comic-yellow/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Circle className="h-3.5 w-3.5 text-comic-ink/20" />
                <span className="text-[11px] font-bold text-comic-ink-soft">Análisis SEO + GEO pendiente</span>
              </div>
              <span className="flex items-center gap-1 text-[11px] font-black text-comic-rust">
                <Play className="h-3 w-3" />
                Analizar
              </span>
            </Link>
          ) : level === "no_config" ? (
            <Link
              href={`${base}/configure`}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-comic-yellow/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Circle className="h-3.5 w-3.5 text-comic-ink/20" />
                <span className="text-[11px] font-bold text-comic-ink-soft">Keywords y prompts sin configurar</span>
              </div>
              <span className="flex items-center gap-1 text-[11px] font-black text-comic-ink">
                <Settings className="h-3 w-3" />
                Configurar
              </span>
            </Link>
          ) : (
            <Link
              href={base}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-comic-aged/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-comic-ink-soft/50" />
                <span className="text-[11px] font-bold text-comic-ink-soft/60">Sin competidores</span>
              </div>
              <span className="text-[11px] font-black text-comic-ink-soft/60">Añadir →</span>
            </Link>
          )}
        </div>
      )}

      {/* Pencil (→ config) + trash — appear on hover */}
      <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          href={`${base}?config=1`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-sm p-1.5 text-comic-ink-soft/50 hover:bg-comic-aged hover:text-comic-ink transition-colors"
          title="Configurar nicho"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Link>
        {onDelete && (
          <button
            onClick={(e) => { e.preventDefault(); onDelete(niche); }}
            className="rounded-sm p-1.5 text-comic-ink-soft/50 hover:bg-red-50 hover:text-red-500 transition-colors"
            title="Eliminar nicho"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
