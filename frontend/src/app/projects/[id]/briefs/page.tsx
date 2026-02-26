"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { analysis, type ActionBrief } from "@/lib/api";
import { cn } from "@/lib/utils";

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  skipped: "bg-gray-50 text-gray-400",
};

export default function BriefsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [briefs, setBriefs] = useState<ActionBrief[]>([]);
  const [filterPriority, setFilterPriority] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analysis
      .listBriefs(projectId, filterPriority || undefined)
      .then((b) => {
        if (filterStatus) {
          setBriefs(b.filter((x) => x.status === filterStatus));
        } else {
          setBriefs(b);
        }
      })
      .finally(() => setLoading(false));
  }, [projectId, filterPriority, filterStatus]);

  const handleStatusChange = async (briefId: string, newStatus: string) => {
    const updated = await analysis.updateBriefStatus(briefId, newStatus);
    setBriefs(briefs.map((b) => (b.id === briefId ? updated : b)));
  };

  const priorities = ["high", "medium", "low"];
  const statuses = ["pending", "in_progress", "completed", "skipped"];

  // Stats
  const totalBriefs = briefs.length;
  const highPriority = briefs.filter((b) => b.priority === "high").length;
  const completed = briefs.filter((b) => b.status === "completed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Action Briefs</h2>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Briefs</p>
          <p className="text-2xl font-bold">{totalBriefs}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">High Priority</p>
          <p className="text-2xl font-bold text-red-600">{highPriority}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Completed</p>
          <p className="text-2xl font-bold text-green-600">{completed}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Priority:
          </span>
          <button
            onClick={() => setFilterPriority("")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs",
              !filterPriority ? "bg-primary text-primary-foreground" : "bg-muted"
            )}
          >
            All
          </button>
          {priorities.map((p) => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs",
                filterPriority === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Status:
          </span>
          <button
            onClick={() => setFilterStatus("")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs",
              !filterStatus ? "bg-primary text-primary-foreground" : "bg-muted"
            )}
          >
            All
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs",
                filterStatus === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Brief cards */}
      {loading ? (
        <p className="text-muted-foreground">Loading briefs...</p>
      ) : briefs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No briefs yet. Run a Gap Analysis to generate actionable briefs.
        </div>
      ) : (
        <div className="space-y-3">
          {briefs.map((brief) => (
            <div
              key={brief.id}
              className={cn(
                "rounded-lg border p-4",
                brief.status === "completed" && "opacity-60"
              )}
            >
              <div className="mb-2 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      PRIORITY_COLORS[brief.priority]
                    )}
                  >
                    {brief.priority}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      STATUS_COLORS[brief.status]
                    )}
                  >
                    {brief.status.replace("_", " ")}
                  </span>
                  {brief.recommended_content_type && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {brief.recommended_content_type}
                    </span>
                  )}
                </div>
                <select
                  value={brief.status}
                  onChange={(e) =>
                    handleStatusChange(brief.id, e.target.value)
                  }
                  className="rounded-md border bg-background px-2 py-1 text-xs"
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-sm font-medium">{brief.target_domain}</p>
              {brief.target_url && (
                <p className="truncate text-xs text-muted-foreground">
                  {brief.target_url}
                </p>
              )}

              {brief.recommended_approach && (
                <p className="mt-2 text-sm text-foreground/80">
                  {brief.recommended_approach}
                </p>
              )}

              {brief.recommended_keyword && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Keyword: {brief.recommended_keyword}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
