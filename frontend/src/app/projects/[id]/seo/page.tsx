"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  seo,
  type SerpQuery,
  type SerpQueryWithResults,
  type JobStatus,
} from "@/lib/api";
import { useJobPolling } from "@/hooks/useJobPolling";
import { cn } from "@/lib/utils";

const CONTENT_TYPE_COLORS: Record<string, string> = {
  review: "bg-blue-100 text-blue-700",
  ranking: "bg-purple-100 text-purple-700",
  solution: "bg-green-100 text-green-700",
  news: "bg-yellow-100 text-yellow-700",
  forum: "bg-orange-100 text-orange-700",
  other: "bg-gray-100 text-gray-600",
};

export default function SeoPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [queries, setQueries] = useState<SerpQuery[]>([]);
  const [selectedQuery, setSelectedQuery] = useState<SerpQueryWithResults | null>(null);
  const [newKeywords, setNewKeywords] = useState("");
  const [niche, setNiche] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { job, isRunning } = useJobPolling(activeJobId);

  const loadQueries = useCallback(() => {
    seo.listQueries(projectId).then(setQueries);
  }, [projectId]);

  useEffect(() => {
    loadQueries();
  }, [loadQueries]);

  useEffect(() => {
    if (job?.status === "completed") {
      loadQueries();
      setActiveJobId(null);
    }
  }, [job?.status, loadQueries]);

  const handleBatchCreate = async () => {
    const keywords = newKeywords
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean);
    if (keywords.length === 0) return;

    const jobStatus = await seo.createBatch(
      projectId,
      keywords,
      niche || undefined
    );
    setActiveJobId(jobStatus.id);
    setNewKeywords("");
  };

  const handleSelectQuery = async (q: SerpQuery) => {
    const full = await seo.getResults(q.id);
    setSelectedQuery(full);
  };

  // Get unique niches
  const niches = Array.from(new Set(queries.map((q) => q.niche).filter(Boolean))) as string[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">SEO / SERP Analysis</h2>
      </div>

      {/* Progress */}
      {isRunning && job && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex justify-between text-sm">
            <span>Fetching SERP results...</span>
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

      {/* Add keywords */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Add Keywords</h3>
        <div className="flex gap-3">
          <textarea
            value={newKeywords}
            onChange={(e) => setNewKeywords(e.target.value)}
            placeholder="Enter keywords (one per line)"
            rows={3}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="Niche (optional)"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={handleBatchCreate}
              disabled={isRunning || !newKeywords.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Fetch SERPs
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Query list */}
        <div className="w-72 shrink-0 space-y-4">
          {niches.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Niches
              </h3>
              <div className="flex flex-wrap gap-1">
                {niches.map((n) => (
                  <span
                    key={n}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            {queries.map((q) => (
              <button
                key={q.id}
                onClick={() => handleSelectQuery(q)}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                  selectedQuery?.id === q.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                <p className="font-medium truncate">{q.keyword}</p>
                <p className="text-xs opacity-70">
                  {q.niche || "No niche"} &middot;{" "}
                  {q.last_fetched_at
                    ? new Date(q.last_fetched_at).toLocaleDateString()
                    : "Not fetched"}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Results table */}
        <div className="flex-1">
          {selectedQuery ? (
            <div>
              <h3 className="mb-3 text-base font-semibold">
                &ldquo;{selectedQuery.keyword}&rdquo;{" "}
                <span className="font-normal text-muted-foreground">
                  ({selectedQuery.results.length} results)
                </span>
              </h3>
              <div className="rounded-lg border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="w-10 px-3 py-2 text-center text-xs font-medium">
                        #
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium">
                        Title / URL
                      </th>
                      <th className="w-24 px-3 py-2 text-center text-xs font-medium">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedQuery.results.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-3 py-2 text-center text-sm text-muted-foreground">
                          {r.position}
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-sm font-medium truncate max-w-md">
                            {r.title || "Untitled"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground max-w-md">
                            {r.domain} &middot; {r.url}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.content_type && (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-medium",
                                CONTENT_TYPE_COLORS[r.content_type] ||
                                  CONTENT_TYPE_COLORS.other
                              )}
                            >
                              {r.content_type}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              Select a keyword to view SERP results.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
