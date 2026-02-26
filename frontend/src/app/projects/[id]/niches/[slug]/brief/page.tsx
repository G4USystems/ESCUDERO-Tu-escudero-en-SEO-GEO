"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { brief as briefApi, type BriefData } from "@/lib/api";
import {
  ArrowLeft,
  RefreshCw,
  TrendingDown,
  Eye,
  MessageSquare,
  Search,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

export default function BriefPage() {
  const params = useParams();
  const projectId = params.id as string;
  const slug = params.slug as string;

  const [data, setData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await briefApi.get(projectId, slug);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando el brief");
    } finally {
      setLoading(false);
    }
  }, [projectId, slug]);

  useEffect(() => {
    load();
  }, [load]);

  const generatedAt = data
    ? new Date(data.generated_at).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/projects/${projectId}/niches/${slug}`}
            className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al nicho
          </Link>
          <h2 className="text-xl font-black text-comic-ink tracking-tight">
            Brief SEO+GEO
          </h2>
          {generatedAt && (
            <p className="text-xs text-comic-ink-soft mt-0.5">
              Generado el {generatedAt}
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-white px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Generando..." : "Regenerar"}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-10 text-center shadow-comic-xs">
          <RefreshCw className="h-6 w-6 animate-spin text-comic-rust mx-auto mb-3" />
          <p className="text-sm font-bold text-comic-ink">
            Analizando visibilidad y generando brief...
          </p>
          <p className="text-xs text-comic-ink-soft mt-1">
            Esto puede tardar unos segundos
          </p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-sm border-2 border-red-400 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Brief content */}
      {data && !loading && (
        <div className="space-y-4">

          {/* Narrative */}
          <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-5 shadow-comic-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-sm bg-comic-ink px-2 py-0.5 text-[10px] font-black text-comic-yellow uppercase tracking-wider">
                Brief · {data.niche_name}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-comic-ink whitespace-pre-line">
              {data.narrative}
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-4 shadow-comic-xs">
              <div className="flex items-center gap-2 mb-2">
                <Search className="h-4 w-4 text-comic-cyan" />
                <span className="text-xs font-black text-comic-ink uppercase tracking-wide">SEO</span>
              </div>
              <div className="text-2xl font-black text-comic-ink">
                {data.client_seo_keywords}
                <span className="text-sm font-medium text-comic-ink-soft">/{data.total_seo_keywords}</span>
              </div>
              <p className="text-xs text-comic-ink-soft mt-0.5">keywords en top 10</p>
              {data.total_seo_keywords > 0 && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-comic-aged overflow-hidden">
                  <div
                    className="h-full rounded-full bg-comic-cyan"
                    style={{ width: `${(data.client_seo_keywords / data.total_seo_keywords) * 100}%` }}
                  />
                </div>
              )}
            </div>

            <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-4 shadow-comic-xs">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-comic-rust" />
                <span className="text-xs font-black text-comic-ink uppercase tracking-wide">GEO</span>
              </div>
              <div className="text-2xl font-black text-comic-ink">
                {data.client_geo_prompts}
                <span className="text-sm font-medium text-comic-ink-soft">/{data.total_geo_prompts}</span>
              </div>
              <p className="text-xs text-comic-ink-soft mt-0.5">prompts con mención</p>
              {data.total_geo_prompts > 0 && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-comic-aged overflow-hidden">
                  <div
                    className="h-full rounded-full bg-comic-rust"
                    style={{ width: `${(data.client_geo_prompts / data.total_geo_prompts) * 100}%` }}
                  />
                </div>
          )}
            </div>
          </div>

          {/* SEO Gaps */}
          {data.seo_gaps.length > 0 && (
            <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b-2 border-comic-ink/10">
                <TrendingDown className="h-4 w-4 text-comic-rust" />
                <span className="text-sm font-black text-comic-ink">
                  Gaps SEO — {data.seo_gaps.length} keywords sin cubrir
                </span>
              </div>
              <div className="divide-y divide-comic-ink/5">
                {data.seo_gaps.map((gap, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-comic-ink truncate">{gap.keyword}</p>
                      <p className="text-xs text-comic-ink-soft">
                        {gap.top_competitor} en #{gap.competitor_position}
                      </p>
                    </div>
                    <span className="ml-3 shrink-0 rounded-sm border border-comic-rust/30 bg-comic-rust/10 px-2 py-0.5 text-[10px] font-black text-comic-rust">
                      #{gap.competitor_position}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GEO Gaps */}
          {data.geo_gaps.length > 0 && (
            <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b-2 border-comic-ink/10">
                <Eye className="h-4 w-4 text-comic-navy" />
                <span className="text-sm font-black text-comic-ink">
                  Gaps GEO — {data.geo_gaps.length} prompts donde no apareces
                </span>
              </div>
              <div className="divide-y divide-comic-ink/5">
                {data.geo_gaps.map((gap, i) => (
                  <div key={i} className="px-4 py-3">
                    <p className="text-xs text-comic-ink leading-relaxed line-clamp-2">
                      &ldquo;{gap.prompt_text}&rdquo;
                    </p>
                    <p className="text-[11px] text-comic-ink-soft mt-1">
                      Mencionan: {gap.competitors_mentioned.join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No gaps */}
          {data.seo_gaps.length === 0 && data.geo_gaps.length === 0 && (
            <div className="rounded-sm border-2 border-comic-sage/40 bg-comic-sage/5 p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-comic-sage shrink-0" />
              <p className="text-sm text-comic-ink">
                Sin gaps detectados — {data.client_name} aparece en todas las posiciones rastreadas.
              </p>
            </div>
          )}

          {/* No analysis yet */}
          {data.total_seo_keywords === 0 && data.total_geo_prompts === 0 && (
            <div className="rounded-sm border-2 border-comic-ink/20 bg-comic-aged/30 p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-comic-ink-soft shrink-0" />
              <div>
                <p className="text-sm font-bold text-comic-ink">Sin análisis disponible</p>
                <p className="text-xs text-comic-ink-soft mt-0.5">
                  Ejecuta primero el análisis SEO y GEO para este nicho.
                </p>
                <Link
                  href={`/projects/${projectId}/niches/${slug}/analyze`}
                  className="mt-2 inline-block text-xs font-black text-comic-rust hover:underline"
                >
                  Ir a analizar →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
