"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Check, ChevronRight, Lock } from "lucide-react";

interface PhaseCardProps {
  phase: number;
  title: string;
  subtitle: string;
  description: string;
  status: "not_started" | "in_progress" | "completed";
  href: string;
  locked: boolean;
}

export function PhaseCard({
  phase,
  title,
  subtitle,
  description,
  status,
  href,
  locked,
}: PhaseCardProps) {
  const content = (
    <div
      className={cn(
        "group relative rounded-lg border p-5 transition-all",
        locked
          ? "cursor-not-allowed border-dashed opacity-50"
          : "hover:border-primary/50 hover:shadow-sm cursor-pointer",
        status === "completed" && "border-green-200 bg-green-50/50",
        status === "in_progress" && "border-primary/30 bg-primary/5"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {/* Phase number */}
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
              status === "completed"
                ? "bg-green-100 text-green-700"
                : status === "in_progress"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {status === "completed" ? <Check className="h-4 w-4" /> : phase}
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {subtitle}
            </p>
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        {/* Action icon */}
        <div className="ml-2 mt-1">
          {locked ? (
            <Lock className="h-4 w-4 text-muted-foreground/50" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
          )}
        </div>
      </div>
    </div>
  );

  if (locked) return content;

  return <Link href={href}>{content}</Link>;
}
