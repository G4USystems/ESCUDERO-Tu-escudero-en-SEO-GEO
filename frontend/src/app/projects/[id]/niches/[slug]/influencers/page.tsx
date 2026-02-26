"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { influencers as influencersApi, geo, niches as nichesApi, type InfluencerResult } from "@/lib/api";
import { ArrowLeft, Users, ExternalLink, Play, RefreshCw, FileText } from "lucide-react";

/** Returns true if an influencer's name/handle matches a competitor brand. */
function isCompetitor(inf: InfluencerResult, competitorNames: string[]): boolean {
  const name = (inf.display_name ?? "").toLowerCase();
  const handle = (inf.handle ?? "").toLowerCase().replace(/^@/, "");
  return competitorNames.some(
    (comp) => name.includes(comp) || handle.includes(comp.replace(/\s+/g, ""))
  );
}

function formatAudience(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function PlatformBadge({ platform }: { platform: "youtube" | "instagram" }) {
  if (platform === "youtube") {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 whitespace-nowrap">
        <span className="text-[8px]">▶</span> YouTube
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-pink-200 bg-pink-50 px-1.5 py-0.5 text-[10px] font-bold text-pink-600 whitespace-nowrap">
      <span className="text-[8px]">◉</span> Instagram
    </span>
  );
}

export default function InfluencersPage() {
  const params = useParams();
  const projectId = params.id as string;
  const slug = params.slug as string;

  const [results, setResults] = useState<InfluencerResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [nicheId, setNicheId] = useState<string | null>(null);
  const [competitorNames, setCompetitorNames] = useState<string[]>([]);
  const [minAudience, setMinAudience] = useState(10_000);

  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchStep, setSearchStep] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadResults = async (compNames: string[]) => {
    const data = await influencersApi.listResults(projectId, slug);
    setResults(data.filter((r) => !isCompetitor(r, compNames)));
  };

  useEffect(() => {
    Promise.all([
      influencersApi.listResults(projectId, slug),
      nichesApi.get(projectId, slug).catch(() => null),
    ])
      .then(([infResults, nicheDetail]) => {
        const compNames = (nicheDetail?.competitors ?? [])
          .map((c: { name?: string }) => (c.name ?? "").toLowerCase())
          .filter(Boolean) as string[];
        setCompetitorNames(compNames);
        setNicheId(nicheDetail?.id ?? null);
        setResults(infResults.filter((r) => !isCompetitor(r, compNames)));
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [projectId, slug]);

  const handleSearch = async () => {
    setSearching(true);
    setSearchProgress(0);
    setSearchStep(null);
    setSearchError(null);
    try {
      const { id: jobId } = await influencersApi.search(projectId, nicheId, slug);
      pollRef.current = setInterval(async () => {
        try {
          const status = await geo.getJobStatus(jobId);
          setSearchProgress(status.progress ?? 0);
          const stepInfo = status.step_info as Record<string, unknown> | null;
          if (stepInfo?.platform) {
            setSearchStep(`Buscando en ${String(stepInfo.platform)}…`);
          }
          if (status.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setSearching(false);
            await loadResults(competitorNames);
          } else if (status.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setSearching(false);
            setSearchError(status.error ?? "Error desconocido");
          }
        } catch { /* keep polling */ }
      }, 2500);
    } catch (err) {
      setSearching(false);
      setSearchError(err instanceof Error ? err.message : "Error al lanzar la búsqueda");
    }
  };

  // Apply minimum audience filter (unknown audience = keep, we don't have the data yet)
  const displayed = results.filter(
    (r) => !r.subscribers || r.subscribers >= minAudience
  );
  const youtube = displayed.filter((r) => r.platform === "youtube");
  const instagram = displayed.filter((r) => r.platform === "instagram");

  const AUDIENCE_FILTERS = [
    { label: "Todos", value: 0 },
    { label: "1K+",   value: 1_000 },
    { label: "10K+",  value: 10_000 },
    { label: "100K+", value: 100_000 },
  ];

  if (loading) {
    return <div className="py-12 text-center text-sm text-comic-ink-soft">Cargando influencers...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href={`/projects/${projectId}/niches/${slug}`}
        className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver al nicho
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm border-2 border-comic-ink bg-comic-rust/10">
            <Users className="h-5 w-5 text-comic-rust" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-comic-ink tracking-tight">Influencers</h1>
            <p className="text-sm text-comic-ink-soft mt-0.5">
              {results.length > 0
                ? `${displayed.length} perfil${displayed.length !== 1 ? "es" : ""} — ${youtube.length} YouTube · ${instagram.length} Instagram`
                : "Sin resultados aún"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${projectId}/niches/${slug}/influencers/brief`}
            className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-white px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          >
            <FileText className="h-3.5 w-3.5" />
            Generar Brief
          </Link>
          <button
            onClick={handleSearch}
            disabled={searching}
            className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {searching ? "Buscando..." : results.length > 0 ? "Re-buscar" : "Buscar influencers"}
          </button>
        </div>
      </div>

      {/* Audience filter chips */}
      {results.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-black text-comic-ink-soft uppercase tracking-widest mr-1">Audiencia mín.</span>
          {AUDIENCE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setMinAudience(f.value)}
              className={`rounded-sm border px-2.5 py-0.5 text-[11px] font-bold transition-colors ${
                minAudience === f.value
                  ? "border-comic-ink bg-comic-ink text-white"
                  : "border-comic-ink/30 bg-white text-comic-ink-soft hover:border-comic-ink hover:text-comic-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {searching && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-4 shadow-comic-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-comic-ink-soft">
            <span>{searchStep ?? "Iniciando búsqueda…"}</span>
            <span className="font-bold">{Math.round(searchProgress * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm border border-comic-ink bg-comic-aged">
            <div className="h-full bg-comic-cyan transition-all" style={{ width: `${searchProgress * 100}%` }} />
          </div>
        </div>
      )}

      {searchError && <p className="text-xs text-comic-red font-semibold">{searchError}</p>}

      {results.length === 0 && !searching && (
        <div className="rounded-sm border-2 border-dashed border-comic-ink/20 p-10 text-center">
          <Users className="h-8 w-8 text-comic-ink/20 mx-auto mb-3" />
          <p className="text-sm text-comic-ink-soft mb-4">No hay influencers encontrados aún.</p>
          <button
            onClick={handleSearch}
            className="inline-flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          >
            <Play className="h-4 w-4" />
            Buscar ahora
          </button>
        </div>
      )}

      {/* Unified table */}
      {displayed.length > 0 && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-comic-ink bg-comic-aged/40">
                <th className="px-4 py-2.5 text-left text-[11px] font-black text-comic-ink uppercase tracking-wide w-8">#</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-black text-comic-ink uppercase tracking-wide w-24">Red</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-black text-comic-ink uppercase tracking-wide">Canal / Perfil</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-black text-comic-ink uppercase tracking-wide hidden sm:table-cell w-28">Audiencia</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-black text-comic-ink uppercase tracking-wide w-16">Enlace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-comic-ink/10">
              {displayed.map((inf, i) => (
                <tr key={inf.id} className="hover:bg-comic-aged/20 transition-colors">
                  <td className="px-4 py-3 text-xs text-comic-ink-soft font-mono">{i + 1}</td>
                  <td className="px-4 py-3">
                    <PlatformBadge platform={inf.platform} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-comic-ink leading-snug">
                      {inf.display_name ?? inf.handle ?? "—"}
                    </p>
                    {inf.handle && inf.display_name && (
                      <p className="text-[11px] text-comic-ink-soft mt-0.5">@{inf.handle}</p>
                    )}
                    {inf.snippet && (
                      <p className="text-[11px] text-comic-ink-soft mt-0.5 line-clamp-2 md:hidden">
                        {inf.snippet}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-sm font-bold text-comic-ink">
                      {formatAudience(inf.subscribers)}
                    </span>
                    {inf.subscribers && (
                      <p className="text-[10px] text-comic-ink-soft mt-0.5">
                        {inf.platform === "youtube" ? "suscriptores" : "seguidores"}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={inf.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-sm border border-comic-ink/30 bg-comic-aged/50 px-2 py-1 text-[11px] font-bold text-comic-ink hover:bg-comic-aged transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ver
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
