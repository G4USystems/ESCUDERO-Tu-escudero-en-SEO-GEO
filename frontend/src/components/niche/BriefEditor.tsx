"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { niches as nichesApi, type NicheBrief } from "@/lib/api";
import {
  Building2,
  Crosshair,
  Users,
  MessageCircle,
  Sparkles,
  Save,
  Pencil,
  Loader2,
  ChevronDown,
} from "lucide-react";

const BRIEF_MODULES = [
  {
    key: "A" as const,
    title: "Contexto de Marca",
    icon: Building2,
    description:
      "Posicionamiento de tu marca en este nicho. Que te diferencia de la competencia, propuesta de valor unica, y ventajas competitivas.",
    placeholder:
      "Ej: Monzo es un banco digital regulado en Europa que ofrece tipo de cambio transparente sin comisiones ocultas. Se diferencia de Revolut y N26 por su enfoque en transparencia y simplicidad...",
    generateHint: "Generar contexto de marca",
  },
  {
    key: "B" as const,
    title: "Objetivos del nicho",
    icon: Crosshair,
    description:
      "Que quieres conseguir en este nicho. Objetivos concretos: aparecer en rankings, conseguir reviews, posicionarte como solucion.",
    placeholder:
      "Ej: Conseguir presencia en los 10 principales medios editoriales que publican sobre tarjetas para viajar. Objetivo: 5 menciones editoriales en 3 meses...",
    generateHint: "Generar objetivos",
  },
  {
    key: "C" as const,
    title: "Audiencia target",
    icon: Users,
    description:
      "Quien es tu publico en este nicho. Perfil demografico, pain points, donde se informan, que buscan en Google, que preguntan a las IAs.",
    placeholder:
      "Ej: Viajeros frecuentes 25-45 anos, digital natives, que buscan la mejor tarjeta para pagar en el extranjero. Se informan en blogs de viajes (molaviajar, comiviajeros) y comparan en foros (rankia)...",
    generateHint: "Generar perfil de audiencia",
  },
  {
    key: "D" as const,
    title: "Mensajes clave",
    icon: MessageCircle,
    description:
      "Que mensajes quieres transmitir. Narrativa del nicho, angulos de contenido, terminos a usar y a evitar (compliance).",
    placeholder:
      "Ej: Mensaje principal: 'tipo de cambio transparente y justo'. Evitar: 'sin comisiones' (usar 'sin comisiones ocultas de cambio'). Evitar: 'el mejor' (usar 'disenado para'). Tono: cercano, educativo, no agresivo...",
    generateHint: "Generar mensajes",
  },
] as const;

type ModuleKey = (typeof BRIEF_MODULES)[number]["key"];

/** Render **bold** markdown inline */
function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

interface BriefEditorProps {
  projectId: string;
  nicheSlug: string;
  brief: NicheBrief | null;
  onSave: (brief: NicheBrief) => Promise<void>;
}

export function BriefEditor({
  projectId,
  nicheSlug,
  brief,
  onSave,
}: BriefEditorProps) {
  const initialBrief = brief ?? {};
  const [draft, setDraft] = useState<NicheBrief>(initialBrief);
  const [editingModule, setEditingModule] = useState<ModuleKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<ModuleKey | null>(null);
  // Expand modules that already have content; collapse empty ones
  const [collapsed, setCollapsed] = useState<Record<ModuleKey, boolean>>({
    A: !initialBrief.A?.trim(),
    B: !initialBrief.B?.trim(),
    C: !initialBrief.C?.trim(),
    D: !initialBrief.D?.trim(),
  });

  const toggleCollapse = (key: ModuleKey) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditingModule(null);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async (key: ModuleKey) => {
    setGenerating(key);
    try {
      const result = await nichesApi.generateBriefModule(projectId, nicheSlug, key, draft);
      setDraft((prev) => ({ ...prev, [key]: result.text }));
      setEditingModule(key);
      // Auto-expand when generating
      setCollapsed((prev) => ({ ...prev, [key]: false }));
    } finally {
      setGenerating(null);
    }
  };

  const filledCount = BRIEF_MODULES.filter((m) => draft[m.key]?.trim()).length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-comic-ink uppercase tracking-wide">
          Brief del nicho
        </h3>
        <span className="text-[11px] text-comic-ink-soft">
          {filledCount}/{BRIEF_MODULES.length} completados
        </span>
      </div>

      <div className="space-y-2">
        {BRIEF_MODULES.map((mod) => {
          const Icon = mod.icon;
          const isEditing = editingModule === mod.key;
          const content = draft[mod.key] || "";
          const hasContent = content.trim().length > 0;
          const isGenerating = generating === mod.key;
          const isCollapsed = collapsed[mod.key] && !isEditing;

          return (
            <div
              key={mod.key}
              className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden"
            >
              {/* Module header — always visible, click to toggle */}
              <button
                type="button"
                onClick={() => toggleCollapse(mod.key)}
                className="w-full text-left p-3 flex items-center gap-2.5 hover:bg-comic-aged/30 transition-colors"
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-sm text-[10px] font-black shrink-0",
                    hasContent
                      ? "bg-comic-sage/15 text-comic-sage border border-comic-sage/30"
                      : "bg-comic-aged text-comic-ink-soft border border-comic-ink/10"
                  )}
                >
                  {mod.key}
                </span>
                <Icon className="h-3.5 w-3.5 text-comic-ink shrink-0" />
                <span className="text-xs font-bold text-comic-ink flex-1">{mod.title}</span>
                {hasContent && (
                  <span className="text-[10px] text-comic-sage font-bold mr-1">✓</span>
                )}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-comic-ink-soft shrink-0 transition-transform",
                    isCollapsed ? "" : "rotate-180"
                  )}
                />
              </button>

              {/* Expandable body */}
              {!isCollapsed && (
                <div className="px-3 pb-3 border-t border-comic-ink/10">
                  <p className="mt-2 mb-2 text-[11px] text-comic-ink-soft leading-relaxed ml-8">
                    {mod.description}
                  </p>

                  <div className="ml-8">
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={draft[mod.key] || ""}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [mod.key]: e.target.value,
                            }))
                          }
                          placeholder={mod.placeholder}
                          rows={4}
                          className="w-full rounded-sm border-2 border-comic-ink/20 bg-white p-2.5 text-xs text-comic-ink placeholder:text-comic-ink-soft/40 focus:border-comic-rust focus:outline-none resize-y"
                          autoFocus
                        />
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => {
                              setDraft((prev) => ({
                                ...prev,
                                [mod.key]: brief?.[mod.key] || "",
                              }));
                              setEditingModule(null);
                            }}
                            className="rounded-sm px-3 py-1.5 text-[11px] font-bold text-comic-ink-soft hover:text-comic-ink transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleSave()}
                            disabled={saving}
                            className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-3 py-1.5 text-[11px] font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-50"
                          >
                            <Save className="h-3 w-3" />
                            {saving ? "Guardando..." : "Guardar"}
                          </button>
                        </div>
                      </div>
                    ) : hasContent ? (
                      <div
                        className="group relative cursor-pointer rounded-sm hover:bg-comic-aged/30 transition-colors -mx-1 px-1 py-0.5"
                        onClick={(e) => { e.stopPropagation(); setEditingModule(mod.key); setCollapsed((prev) => ({ ...prev, [mod.key]: false })); }}
                        title="Haz clic para editar"
                      >
                        <p className="text-xs text-comic-ink whitespace-pre-wrap leading-relaxed pr-6">
                          {renderMarkdown(content)}
                        </p>
                        <span className="absolute right-1 top-0.5 flex items-center gap-0.5 rounded-sm border border-comic-ink/20 bg-white px-1.5 py-0.5 text-[10px] text-comic-ink-soft">
                          <Pencil className="h-2.5 w-2.5" />
                          Editar
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingModule(mod.key); setCollapsed((prev) => ({ ...prev, [mod.key]: false })); }}
                          className="flex items-center gap-1.5 rounded-sm border border-comic-ink/20 px-2.5 py-1.5 text-[11px] text-comic-ink-soft hover:text-comic-ink hover:border-comic-ink/40 transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                          Escribir
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleGenerate(mod.key); }}
                          disabled={isGenerating}
                          className="flex items-center gap-1.5 rounded-sm border border-comic-rust/30 bg-comic-rust/5 px-2.5 py-1.5 text-[11px] text-comic-rust hover:bg-comic-rust/10 transition-colors disabled:opacity-50"
                        >
                          {isGenerating ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          {mod.generateHint}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
