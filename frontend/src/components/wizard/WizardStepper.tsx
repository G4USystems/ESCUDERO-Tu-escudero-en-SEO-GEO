"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface WizardStep {
  id: string;
  label: string;
  subtitle?: string;
  status: "completed" | "current" | "upcoming" | "locked";
}

interface WizardStepperProps {
  steps: WizardStep[];
  onStepClick?: (stepId: string) => void;
}

export function WizardStepper({ steps, onStepClick }: WizardStepperProps) {
  return (
    <nav className="w-full">
      <ol className="flex flex-col gap-0">
        {steps.map((step, idx) => (
          <li key={step.id} className="flex items-stretch">
            {/* Step indicator column */}
            <div className="flex flex-col items-center w-6 shrink-0">
              {/* Circle */}
              <button
                onClick={() =>
                  (step.status === "completed" || step.status === "current") &&
                  onStepClick?.(step.id)
                }
                disabled={step.status === "locked" || step.status === "upcoming"}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black transition-all shrink-0",
                  step.status === "completed" &&
                    "bg-comic-sage text-white cursor-pointer hover:ring-2 hover:ring-comic-sage/30",
                  step.status === "current" &&
                    "bg-comic-rust text-white ring-2 ring-comic-rust/30",
                  step.status === "upcoming" &&
                    "bg-comic-aged text-comic-ink-soft border border-comic-ink/20",
                  step.status === "locked" &&
                    "bg-comic-aged/50 text-comic-ink-soft/40 cursor-not-allowed"
                )}
              >
                {step.status === "completed" ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : (
                  idx + 1
                )}
              </button>
              {/* Connector line */}
              {idx < steps.length - 1 && (
                <div
                  className={cn(
                    "w-0.5 flex-1 min-h-[12px]",
                    step.status === "completed" ? "bg-comic-sage" : "bg-comic-aged"
                  )}
                />
              )}
            </div>

            {/* Label */}
            <button
              onClick={() =>
                (step.status === "completed" || step.status === "current") &&
                onStepClick?.(step.id)
              }
              disabled={step.status === "locked" || step.status === "upcoming"}
              className={cn(
                "ml-2 pb-3 text-left",
                (step.status === "completed" || step.status === "current") && "cursor-pointer",
                (step.status === "locked" || step.status === "upcoming") && "cursor-default"
              )}
            >
              <span
                className={cn(
                  "text-xs font-bold leading-tight block",
                  step.status === "current" && "text-comic-rust",
                  step.status === "completed" && "text-comic-sage",
                  (step.status === "upcoming" || step.status === "locked") && "text-comic-ink-soft"
                )}
              >
                {step.label}
              </span>
              {step.subtitle && (
                <span className="text-[10px] text-comic-ink-soft leading-tight block">
                  {step.subtitle}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
