"use client";

import { cn } from "@/lib/utils";
import { Handshake, Zap } from "lucide-react";

export interface BlockInfo {
  id: "a" | "b";
  label: string;
  subtitle: string;
  status: "not_started" | "in_progress" | "completed";
  stat?: string;
}

interface BlockSelectorProps {
  blocks: [BlockInfo, BlockInfo];
  activeBlock: "a" | "b" | null;
  onSelect: (block: "a" | "b") => void;
}

const BLOCK_ICONS = {
  a: Handshake,
  b: Zap,
};

const STATUS_STYLES = {
  not_started: "text-comic-ink-soft",
  in_progress: "text-comic-cyan",
  completed: "text-comic-sage",
};

const STATUS_LABELS = {
  not_started: "Sin empezar",
  in_progress: "En progreso",
  completed: "Completado",
};

export function BlockSelector({ blocks, activeBlock, onSelect }: BlockSelectorProps) {
  return (
    <div className="space-y-1.5">
      <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-comic-ink-soft">
        Bloques
      </div>
      {blocks.map((block) => {
        const Icon = BLOCK_ICONS[block.id];
        const isActive = activeBlock === block.id;
        return (
          <button
            key={block.id}
            onClick={() => onSelect(block.id)}
            className={cn(
              "flex w-full items-start gap-2 rounded-sm border-2 px-2.5 py-2 text-left transition-all",
              isActive
                ? "border-comic-rust bg-comic-rust/5 shadow-comic-xs"
                : "border-comic-ink/20 bg-comic-paper hover:border-comic-ink/40"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 mt-0.5 shrink-0",
                isActive ? "text-comic-rust" : "text-comic-ink-soft"
              )}
            />
            <div className="min-w-0">
              <div
                className={cn(
                  "text-xs font-bold leading-tight",
                  isActive ? "text-comic-rust" : "text-comic-ink"
                )}
              >
                {block.label}
              </div>
              <div className="text-[10px] text-comic-ink-soft leading-tight mt-0.5">
                {block.subtitle}
              </div>
              <div className={cn("text-[10px] font-bold mt-1", STATUS_STYLES[block.status])}>
                {block.stat || STATUS_LABELS[block.status]}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
