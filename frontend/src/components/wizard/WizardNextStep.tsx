"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { PhaseStatus, NicheStats } from "@/hooks/useWizardState";
import type { Niche } from "@/lib/api";

interface Step {
  badge: string;
  title: string;
  why: string;
  cta: string;
  action: () => void;
}

interface WizardNextStepProps {
  projectId: string;
  phases: PhaseStatus[];
  niches: Niche[];
  nicheStats: Record<string, NicheStats>;
  hasClientBrand: boolean;
  hasNiches: boolean;
  hasCompetitors: boolean;
  onCreateNiche: () => void;
}

export function WizardNextStep({
  projectId,
  phases,
  niches,
  nicheStats,
  hasClientBrand,
  hasNiches,
  hasCompetitors,
  onCreateNiche,
}: WizardNextStepProps) {
  const router = useRouter();

  // Determine next step
  const step = resolveNextStep({
    projectId,
    phases,
    niches,
    nicheStats,
    hasClientBrand,
    hasNiches,
    hasCompetitors,
    onCreateNiche,
    router,
  });

  if (!step) return null;

  return (
    <div className="relative rounded-sm border-2 border-comic-ink bg-comic-yellow/20 overflow-visible">
      {/* Sancho speech tail */}
      <div className="absolute -top-3 left-5 h-0 w-0 border-l-[10px] border-r-[10px] border-b-[12px] border-l-transparent border-r-transparent border-b-comic-ink" />
      <div className="absolute -top-[9px] left-[22px] h-0 w-0 border-l-[11px] border-r-[11px] border-b-[13px] border-l-transparent border-r-transparent border-b-comic-yellow/20" />

      <div className="px-4 pt-4 pb-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">🗝️</span>
            <div>
              <p className="text-[10px] font-black text-comic-ink-soft uppercase tracking-widest mb-0.5">
                Sancho · {step.badge}
              </p>
              <p className="text-base font-black text-comic-ink leading-snug">
                {step.title}
              </p>
              <p className="text-xs text-comic-ink-soft mt-1 leading-relaxed max-w-lg">
                {step.why}
              </p>
            </div>
          </div>

          <button
            onClick={step.action}
            className="shrink-0 flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-ink text-comic-yellow px-4 py-2 text-xs font-black shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          >
            {step.cta}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Logic to pick the right next step ────────────────────────────────────────

function resolveNextStep({
  projectId,
  niches,
  nicheStats,
  hasClientBrand,
  hasNiches,
  hasCompetitors,
  onCreateNiche,
  router,
}: {
  projectId: string;
  phases: PhaseStatus[];
  niches: Niche[];
  nicheStats: Record<string, NicheStats>;
  hasClientBrand: boolean;
  hasNiches: boolean;
  hasCompetitors: boolean;
  onCreateNiche: () => void;
  router: ReturnType<typeof useRouter>;
}): Step | null {

  // Step 1 — No client brand
  if (!hasClientBrand) {
    return {
      badge: "Paso 1 de 5",
      title: "Configura tu marca",
      why: "Necesitamos saber quién eres y cuál es tu dominio para detectar dónde apareces en Google e IAs. Sin esto, no podemos compararte con nadie.",
      cta: "Configurar marca",
      action: () => router.push(`/projects/${projectId}/setup`),
    };
  }

  // Step 2 — No niches
  if (!hasNiches) {
    return {
      badge: "Paso 2 de 5",
      title: "Crea tu primer nicho",
      why: "Un nicho es un segmento de mercado (ej: 'Inversión para principiantes'). Cada nicho tiene sus propios competidores, keywords y prompts. Define el primero para empezar.",
      cta: "Crear nicho",
      action: onCreateNiche,
    };
  }

  // Step 3 — Niches exist but no competitors added
  if (!hasCompetitors) {
    const firstNiche = niches[0];
    return {
      badge: "Paso 3 de 5",
      title: "Añade competidores",
      why: "Los competidores son las marcas que ya tienen la visibilidad que tú quieres. Necesitamos sus dominios para ver dónde ranquean ellos y tú no.",
      cta: `Añadir en "${firstNiche?.name}"`,
      action: () => router.push(`/projects/${projectId}/niches/${firstNiche?.slug}`),
    };
  }

  // Step 4 — Has competitors but no keywords/prompts configured
  const unconfiguredNiche = niches.find((n) => {
    const stats = nicheStats[n.slug];
    return !stats || (stats.keywordCount === 0 && stats.promptCount === 0);
  });

  if (unconfiguredNiche) {
    return {
      badge: "Paso 4 de 5",
      title: `Configura keywords y prompts — "${unconfiguredNiche.name}"`,
      why: "Las keywords son lo que buscas en Google. Los prompts son las preguntas que hacen a ChatGPT o Perplexity. Necesitas ambos para el análisis SEO+GEO.",
      cta: "Configurar ahora",
      action: () => router.push(`/projects/${projectId}/niches/${unconfiguredNiche.slug}/configure`),
    };
  }

  // Step 5 — Configured but no analysis run
  const unanalyzedNiche = niches.find((n) => {
    const stats = nicheStats[n.slug];
    return stats && (stats.keywordCount > 0 || stats.promptCount > 0) && !stats.seoReady && !stats.geoReady;
  });

  if (unanalyzedNiche) {
    return {
      badge: "Paso 5 de 5",
      title: `Ejecuta el análisis — "${unanalyzedNiche.name}"`,
      why: "Ya tenemos keywords y prompts configurados. Hora de lanzar el análisis para ver dónde aparecen tus competidores — y dónde no estás tú.",
      cta: "Ejecutar análisis",
      action: () => router.push(`/projects/${projectId}/niches/${unanalyzedNiche.slug}/analyze`),
    };
  }

  // All done — suggest influencers if none found yet
  const nicheWithInfluencers = niches.find((n) => (nicheStats[n.slug]?.influencerCount ?? 0) === 0);
  if (nicheWithInfluencers) {
    return {
      badge: "Bonus",
      title: "Encuentra influencers para amplificar",
      why: "El análisis SEO+GEO está completado. El siguiente nivel es identificar creadores de YouTube e Instagram que lleguen a tu audiencia objetivo.",
      cta: "Buscar influencers",
      action: () => router.push(`/projects/${projectId}/niches/${nicheWithInfluencers.slug}/influencers`),
    };
  }

  return null;
}
