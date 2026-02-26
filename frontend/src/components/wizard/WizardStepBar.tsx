"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhaseStatus } from "@/hooks/useWizardState";

const PHASE_ROUTES: Record<string, string> = {
  setup: "setup",
  niches: "",           // project hub
  configure: "niches",  // first niche
  analyze: "niches",
  results: "niches",
};

interface WizardStepBarProps {
  phases: PhaseStatus[];
  projectId: string;
}

const WHY_LABELS: Record<string, string> = {
  setup: "Define tu marca",
  niches: "Define competidores",
  configure: "Keywords y prompts",
  analyze: "Ejecutar análisis",
  results: "Ver oportunidades",
};

export function WizardStepBar({ phases, projectId }: WizardStepBarProps) {
  const router = useRouter();

  const handleClick = (phase: PhaseStatus) => {
    if (phase.status === "not_started" && phase.id !== "setup") return;
    const route = PHASE_ROUTES[phase.id];
    router.push(`/projects/${projectId}${route ? `/${route}` : ""}`);
  };

  return (
    <div className="flex items-center gap-0 overflow-x-auto">
      {phases.map((phase, idx) => {
        const isCompleted = phase.status === "completed";
        const isCurrent = phase.status === "in_progress";
        const isLocked = phase.status === "not_started" && idx > 0;
        const isClickable = isCompleted || isCurrent || phase.id === "setup";

        return (
          <div key={phase.id} className="flex items-center shrink-0">
            {/* Step */}
            <button
              onClick={() => handleClick(phase)}
              disabled={isLocked}
              title={WHY_LABELS[phase.id]}
              className={cn(
                "flex flex-col items-center px-3 py-2 text-center transition-all",
                isClickable ? "cursor-pointer hover:opacity-80" : "cursor-default opacity-40"
              )}
            >
              {/* Circle */}
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black mb-1",
                isCompleted && "bg-comic-sage text-white",
                isCurrent && "bg-comic-rust text-white ring-2 ring-comic-rust/40",
                isLocked && "bg-comic-aged/60 text-comic-ink/30 border border-comic-ink/10",
                !isCompleted && !isCurrent && !isLocked && "bg-comic-aged text-comic-ink-soft border border-comic-ink/20"
              )}>
                {isCompleted ? <Check className="h-3 w-3" strokeWidth={3} /> : phase.phase}
              </div>
              {/* Label */}
              <span className={cn(
                "text-[9px] font-black uppercase tracking-widest leading-none",
                isCompleted && "text-comic-sage",
                isCurrent && "text-comic-rust",
                !isCompleted && !isCurrent && "text-comic-ink-soft"
              )}>
                {phase.label}
              </span>
            </button>

            {/* Connector */}
            {idx < phases.length - 1 && (
              <div className={cn(
                "h-0.5 w-6 shrink-0",
                isCompleted ? "bg-comic-sage" : "bg-comic-aged"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
