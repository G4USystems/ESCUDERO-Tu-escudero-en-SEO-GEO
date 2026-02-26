"use client";

import { useParams, usePathname } from "next/navigation";
import { useWizardState } from "@/hooks/useWizardState";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const id = params.id as string;
  const slug = params.slug as string | undefined;
  const { project, niches, loading } = useWizardState(id);

  if (loading) {
    return (
      <div className="p-8 text-center text-comic-ink-soft">Cargando campaña...</div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-center text-comic-ink-soft">Campaña no encontrada.</div>
    );
  }

  const activeNiche = slug ? niches.find((n) => n.slug === slug) : null;

  // Derive a short section label from the path, e.g. "configure", "analyze", "results"
  const section = slug && pathname
    ? pathname.replace(`/projects/${id}/niches/${slug}`, "").replace(/^\//, "").split("/")[0] || null
    : null;

  const sectionLabels: Record<string, string> = {
    configure: "Configurar",
    analyze: "Analizar",
    results: "Resultados",
    influencers: "Influencers",
    dominar: "Dominar SEO",
    brief: "Brief",
    contenido: "Contenido",
  };

  return (
    <div>
      {/* Campaign + niche banner */}
      <div className="mb-6 rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
        {/* Campaign row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="h-8 w-1 rounded-full bg-comic-rust shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-comic-ink-soft uppercase tracking-widest leading-none mb-1">Campaña activa</p>
            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="text-lg font-black text-comic-ink tracking-tight leading-none">{project.name}</h1>
              {project.website && (
                <span className="text-xs text-comic-ink-soft truncate">{project.website.replace(/^https?:\/\//, "")}</span>
              )}
            </div>
          </div>
        </div>

        {/* Niche row — only when inside a niche */}
        {activeNiche && (
          <div className="flex items-center gap-3 px-4 py-2.5 border-t border-comic-ink/10 bg-comic-aged/20">
            <div className="h-6 w-1 rounded-full bg-comic-navy shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold text-comic-ink-soft/60 uppercase tracking-widest leading-none mb-0.5">Nicho activo</p>
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-sm font-black text-comic-ink leading-none">{activeNiche.name}</span>
                {section && sectionLabels[section] && (
                  <span className="text-[10px] font-bold text-comic-ink-soft bg-comic-aged rounded-sm px-1.5 py-0.5 uppercase tracking-wide shrink-0">
                    {sectionLabels[section]}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {children}
    </div>
  );
}
