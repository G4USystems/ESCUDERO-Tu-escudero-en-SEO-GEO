"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { prompts, type Prompt, type PromptTopic } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function PromptsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [topics, setTopics] = useState<PromptTopic[]>([]);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [promptList, setPromptList] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    prompts
      .topics(projectId)
      .then((t) => {
        setTopics(t);
        if (t.length > 0) setActiveTopic(t[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!activeTopic) return;
    prompts
      .list(projectId, activeTopic)
      .then(setPromptList)
      .catch(console.error);
  }, [projectId, activeTopic]);

  if (loading) return <p className="text-muted-foreground">Loading prompts...</p>;
  if (topics.length === 0)
    return (
      <p className="text-muted-foreground">
        No prompts found. Run <code>make seed</code>.
      </p>
    );

  return (
    <div className="flex gap-6">
      {/* Topic sidebar */}
      <div className="w-56 shrink-0">
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Topics
        </h3>
        <div className="space-y-1">
          {topics.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTopic(t.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                activeTopic === t.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              <span>{t.name}</span>
              <span className="text-xs opacity-70">{t.prompt_count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Prompts list */}
      <div className="flex-1">
        <h2 className="mb-4 text-lg font-semibold">
          {topics.find((t) => t.id === activeTopic)?.name} Prompts
        </h2>
        <div className="space-y-2">
          {promptList.map((p, idx) => (
            <div
              key={p.id}
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {idx + 1}
              </span>
              <div className="flex-1">
                <p className="text-sm">{p.text}</p>
                <div className="mt-1 flex gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {p.language}
                  </span>
                  {!p.is_active && (
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                      inactive
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
