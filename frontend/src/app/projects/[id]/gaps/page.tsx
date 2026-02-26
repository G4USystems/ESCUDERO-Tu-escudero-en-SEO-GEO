"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  analysis,
  geo,
  type GapAnalysis,
  type GapItem,
  type GeoRun,
  type JobStatus,
} from "@/lib/api";
import { useJobPolling } from "@/hooks/useJobPolling";
import { cn } from "@/lib/utils";

export default function GapsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [gapAnalyses, setGapAnalyses] = useState<GapAnalysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<GapAnalysis | null>(null);
  const [gapItems, setGapItems] = useState<GapItem[]>([]);
  const [geoRuns, setGeoRuns] = useState<GeoRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [minScore, setMinScore] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { job, isRunning } = useJobPolling(activeJobId);

  const loadAnalyses = useCallback(() => {
    analysis.listGapAnalyses(projectId).then((a) => {
      setGapAnalyses(a);
      if (a.length > 0 && !selectedAnalysis) setSelectedAnalysis(a[0]);
    });
  }, [projectId, selectedAnalysis]);

  useEffect(() => {
    loadAnalyses();
    geo.listRuns(projectId).then((r) => {
      const completed = r.filter((run) => run.status === "completed");
      setGeoRuns(completed);
      if (completed.length > 0) setSelectedRunId(completed[0].id);
    });
  }, [loadAnalyses, projectId]);

  useEffect(() => {
    if (!selectedAnalysis || selectedAnalysis.status !== "completed") return;
    analysis.getGapItems(selectedAnalysis.id, minScore).then(setGapItems);
  }, [selectedAnalysis, minScore]);

  useEffect(() => {
    if (job?.status === "completed") {
      loadAnalyses();
      setActiveJobId(null);
    }
  }, [job?.status, loadAnalyses]);

  const handleLaunch = async () => {
    const jobStatus = await analysis.createGapAnalysis(
      projectId,
      selectedRunId || undefined
    );
    setActiveJobId(jobStatus.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Gap Analysis</h2>
        <div className="flex items-center gap-3">
          {geoRuns.length > 0 && (
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {geoRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  GEO Run: {r.name || new Date(r.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleLaunch}
            disabled={isRunning}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isRunning ? `Analyzing... ${Math.round((job?.progress ?? 0) * 100)}%` : "Run Gap Analysis"}
          </button>
        </div>
      </div>

      {/* Progress */}
      {isRunning && job && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex justify-between text-sm">
            <span>Analyzing gaps...</span>
            <span>{Math.round(job.progress * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${job.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Analysis selector */}
      {gapAnalyses.length > 0 && (
        <div className="flex gap-2">
          {gapAnalyses.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAnalysis(a)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm",
                selectedAnalysis?.id === a.id
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted"
              )}
            >
              {new Date(a.created_at).toLocaleDateString()}
              {a.results && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {a.results.gaps_found} gaps
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      {selectedAnalysis?.status === "completed" && (
        <div className="flex items-center gap-4">
          <label className="text-sm text-muted-foreground">
            Min score:
            <input
              type="range"
              min={0}
              max={80}
              step={10}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="ml-2 align-middle"
            />
            <span className="ml-1 text-xs font-medium">{minScore}</span>
          </label>
          <span className="text-sm text-muted-foreground">
            Showing {gapItems.length} opportunities
          </span>
        </div>
      )}

      {/* Gap items table */}
      {gapItems.length > 0 && (
        <div className="rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium">
                  URL / Domain
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium">
                  Score
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium">
                  Source
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium">
                  Content
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium">
                  Competitors
                </th>
              </tr>
            </thead>
            <tbody>
              {gapItems.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="max-w-xs px-3 py-2">
                    <p className="truncate text-sm font-medium">
                      {item.domain}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.url}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        (item.opportunity_score ?? 0) >= 60
                          ? "bg-green-100 text-green-700"
                          : (item.opportunity_score ?? 0) >= 30
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {item.opportunity_score?.toFixed(0) ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex justify-center gap-1">
                      {item.found_in_geo && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                          GEO
                        </span>
                      )}
                      {item.found_in_serp && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-600">
                          SEO
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-xs">
                    {item.content_type || "—"}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {item.competitor_brands?.brands?.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {gapAnalyses.length === 0 && !isRunning && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No gap analyses yet. Run a GEO analysis first, then launch Gap
          Analysis to find opportunities.
        </div>
      )}
    </div>
  );
}
