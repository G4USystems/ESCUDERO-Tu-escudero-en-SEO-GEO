"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  domains,
  type DomainInfo,
  type ExclusionRule,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  editorial: "bg-green-100 text-green-700",
  corporate: "bg-blue-100 text-blue-700",
  ugc: "bg-orange-100 text-orange-700",
  competitor: "bg-red-100 text-red-700",
  reference: "bg-gray-100 text-gray-700",
  institutional: "bg-indigo-100 text-indigo-700",
  aggregator: "bg-purple-100 text-purple-700",
};

export default function DomainsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [domainList, setDomainList] = useState<DomainInfo[]>([]);
  const [rules, setRules] = useState<ExclusionRule[]>([]);
  const [filterType, setFilterType] = useState<string>("");
  const [classifyInput, setClassifyInput] = useState("");
  const [classifyResult, setClassifyResult] = useState<{
    domain_type: string | null;
    accepts_sponsored: boolean | null;
    is_excluded_fintech: boolean;
  } | null>(null);

  useEffect(() => {
    domains.list(filterType || undefined).then(setDomainList);
  }, [filterType]);

  useEffect(() => {
    domains.listRules(projectId).then(setRules);
  }, [projectId]);

  const handleClassify = async () => {
    if (!classifyInput.trim()) return;
    const result = await domains.classify(classifyInput.trim());
    setClassifyResult(result);
  };

  const handleDeleteRule = async (ruleId: string) => {
    await domains.deleteRule(ruleId);
    setRules(rules.filter((r) => r.id !== ruleId));
  };

  const domainTypes = [
    "editorial",
    "corporate",
    "ugc",
    "competitor",
    "reference",
    "institutional",
    "aggregator",
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Domain Intelligence</h2>

      {/* Quick classifier */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Quick Domain Classifier</h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={classifyInput}
            onChange={(e) => setClassifyInput(e.target.value)}
            placeholder="Enter a domain (e.g., helpmycash.com)"
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleClassify()}
          />
          <button
            onClick={handleClassify}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Classify
          </button>
        </div>
        {classifyResult && (
          <div className="mt-3 flex gap-3 text-sm">
            <span>
              Type:{" "}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  TYPE_COLORS[classifyResult.domain_type || ""] || "bg-gray-100"
                )}
              >
                {classifyResult.domain_type || "unknown"}
              </span>
            </span>
            <span>
              Sponsored:{" "}
              {classifyResult.accepts_sponsored === null
                ? "unknown"
                : classifyResult.accepts_sponsored
                ? "Yes"
                : "No"}
            </span>
            {classifyResult.is_excluded_fintech && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                Excluded (bank/fintech)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Domain catalog */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-base font-semibold">Domain Catalog</h3>
          <div className="flex gap-1">
            <button
              onClick={() => setFilterType("")}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs",
                !filterType ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              All
            </button>
            {domainTypes.map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs",
                  filterType === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium">
                  Domain
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium">
                  Type
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium">
                  Sponsored
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium">
                  DA
                </th>
              </tr>
            </thead>
            <tbody>
              {domainList.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="px-4 py-2 text-sm font-medium">
                    {d.display_name || d.domain}
                    <p className="text-xs text-muted-foreground">{d.domain}</p>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        TYPE_COLORS[d.domain_type || ""] || "bg-gray-100"
                      )}
                    >
                      {d.domain_type || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center text-sm">
                    {d.accepts_sponsored === null
                      ? "—"
                      : d.accepts_sponsored
                      ? "Yes"
                      : "No"}
                  </td>
                  <td className="px-4 py-2 text-right text-sm">
                    {d.domain_authority ?? "—"}
                  </td>
                </tr>
              ))}
              {domainList.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No domains in catalog yet. They will be added as you run analyses.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Exclusion Rules */}
      <div>
        <h3 className="mb-3 text-base font-semibold">
          Exclusion Rules ({rules.length})
        </h3>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No exclusion rules set. Add rules to filter out banks, competitors,
            etc.
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{r.rule_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.rule_type}: {JSON.stringify(r.rule_value)}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteRule(r.id)}
                  className="text-xs text-destructive hover:underline"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
