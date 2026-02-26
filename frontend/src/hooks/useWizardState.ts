"use client";

import { useEffect, useState } from "react";
import {
  projects,
  niches as nichesApi,
  prompts as promptsApi,
  seo,
  geo,
  analysis,
  content,
  influencers as influencersApi,
} from "@/lib/api";
import type { ProjectDetail, Niche, GeoRun, SerpQuery, GapAnalysis, ContentBriefItem } from "@/lib/api";

export interface PhaseStatus {
  phase: number;
  id: string;
  label: string;
  subtitle: string;
  status: "not_started" | "in_progress" | "completed";
}

export interface NicheStats {
  keywordCount: number;
  keywordsFetched: number;
  promptCount: number;
  seoReady: boolean;
  geoReady: boolean;
  influencerCount: number;
}

export interface BlockBStats {
  recommended: number;
  selected: number;
  generated: number;
  approved: number;
}

export function useWizardState(projectId: string) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [nichesList, setNichesList] = useState<Niche[]>([]);
  const [loading, setLoading] = useState(true);

  // Additional data for phase computation
  const [hasPrompts, setHasPrompts] = useState(false);
  const [hasKeywords, setHasKeywords] = useState(false);
  const [hasCompletedAnalysis, setHasCompletedAnalysis] = useState(false);
  const [hasCompletedGap, setHasCompletedGap] = useState(false);

  // Per-niche stats
  const [nicheStatsMap, setNicheStatsMap] = useState<Record<string, NicheStats>>({});

  // Block B stats
  const [blockBStats, setBlockBStats] = useState<BlockBStats>({
    recommended: 0,
    selected: 0,
    generated: 0,
    approved: 0,
  });

  const reload = async () => {
    try {
      const [proj, nch] = await Promise.all([
        projects.get(projectId),
        nichesApi.list(projectId),
      ]);
      setProject(proj);
      setNichesList(nch);

      // Load analysis status data in parallel
      const [allPrompts, queries, geoRuns, gapAnalyses, briefs] = await Promise.all([
        promptsApi.list(projectId).catch(() => []),
        seo.listQueries(projectId).catch(() => [] as SerpQuery[]),
        geo.listRuns(projectId).catch(() => [] as GeoRun[]),
        analysis.listGapAnalyses(projectId).catch(() => [] as GapAnalysis[]),
        content.listBriefs(projectId).catch(() => [] as ContentBriefItem[]),
      ]);

      setHasPrompts(allPrompts.length > 0);
      setHasKeywords(queries.length > 0);
      setHasCompletedAnalysis(
        geoRuns.some((r) => r.status === "completed") ||
        queries.some((q) => q.last_fetched_at !== null)
      );
      setHasCompletedGap(gapAnalyses.some((g) => g.status === "completed"));

      // Block B stats
      setBlockBStats({
        recommended: briefs.filter((b) => b.status === "recommended").length,
        selected: briefs.filter((b) => b.status === "selected").length,
        generated: briefs.filter((b) => b.status === "generated").length,
        approved: briefs.filter((b) => b.status === "approved").length,
      });

      // Build per-niche stats
      const statsMap: Record<string, NicheStats> = {};

      for (const n of nch) {
        const nicheQueries = queries.filter((q) => q.niche === n.slug);
        const nichePromptCount = allPrompts.filter((p) => p.niche_id === n.id).length;
        const nicheGeoReady = geoRuns.some((r) => r.status === "completed" && r.niche_id === n.id);
        statsMap[n.slug] = {
          keywordCount: nicheQueries.length,
          keywordsFetched: nicheQueries.filter((q) => q.last_fetched_at !== null).length,
          promptCount: nichePromptCount,
          seoReady: nicheQueries.some((q) => q.last_fetched_at !== null),
          geoReady: nicheGeoReady,
          influencerCount: 0,
        };
      }

      // Fetch influencer counts per niche in parallel
      const infCounts = await Promise.all(
        nch.map((n) =>
          influencersApi.listResults(projectId, n.slug)
            .then((r) => ({ slug: n.slug, count: r.length }))
            .catch(() => ({ slug: n.slug, count: 0 }))
        )
      );
      for (const { slug, count } of infCounts) {
        if (statsMap[slug]) statsMap[slug].influencerCount = count;
      }

      setNicheStatsMap(statsMap);
    } catch (e) {
      console.error("Failed to load wizard state:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [projectId]);

  // Compute phase statuses
  const hasClientBrand = project?.brands.some((b) => b.is_client) ?? false;
  const hasNiches = nichesList.length > 0;
  const hasCompetitors = nichesList.some((n) => n.competitor_count > 0);

  // Phase 3: Configure — has prompts or keywords
  const configureStatus: PhaseStatus["status"] =
    (hasPrompts && hasKeywords) ? "completed" :
    (hasPrompts || hasKeywords) ? "in_progress" :
    "not_started";

  // Phase 4: Analyze — has completed SEO or GEO analysis
  const analyzeStatus: PhaseStatus["status"] =
    hasCompletedAnalysis ? "completed" : "not_started";

  // Phase 5: Results — has completed gap analysis
  const resultsStatus: PhaseStatus["status"] =
    hasCompletedGap ? "completed" : "not_started";

  const phases: PhaseStatus[] = [
    {
      phase: 1,
      id: "setup",
      label: "Campaña",
      subtitle: "¿Quién eres?",
      status: hasClientBrand ? "completed" : project ? "in_progress" : "not_started",
    },
    {
      phase: 2,
      id: "niches",
      label: "Nichos",
      subtitle: "¿A quién quieres llegar?",
      status: hasCompetitors ? "completed" : hasNiches ? "in_progress" : "not_started",
    },
    {
      phase: 3,
      id: "configure",
      label: "Configurar",
      subtitle: "¿Qué buscamos?",
      status: configureStatus,
    },
    {
      phase: 4,
      id: "analyze",
      label: "Analizar",
      subtitle: "Buscando medios...",
      status: analyzeStatus,
    },
    {
      phase: 5,
      id: "results",
      label: "Resultados",
      subtitle: "Tus oportunidades",
      status: resultsStatus,
    },
  ];

  const currentPhase = phases.findIndex((p) => p.status !== "completed") + 1 || phases.length;

  return {
    project,
    niches: nichesList,
    nicheStats: nicheStatsMap,
    phases,
    currentPhase,
    loading,
    hasClientBrand,
    hasNiches,
    hasCompetitors,
    blockBStats,
    reload,
  };
}
