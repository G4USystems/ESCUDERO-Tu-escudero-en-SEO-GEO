"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { content as contentApi, type ContentBriefItem } from "@/lib/api";
import { FileText, Clock, Tag, ChevronRight, Pencil, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  discovery:     "Descubrimiento",
  recommendation:"Recomendación",
  comparison:    "Comparación",
  alternatives:  "Alternativas",
  problem:       "Problema",
  authority:     "Autoridad",
  guide:         "Guía",
  content_gap:   "Content Gap",
  influencer:    "Influencer",
  ranking:       "Ranking",
  review:        "Review",
  solution:      "Solución",
  transactional: "Transaccional",
};

const STATUS_STYLE: Record<string, string> = {
  generated:   "bg-comic-sage/10 text-comic-sage border-comic-sage/30",
  briefed:     "bg-comic-cyan/10 text-comic-navy border-comic-cyan/30",
  recommended: "bg-comic-aged text-comic-ink-soft border-comic-ink/20",
  selected:    "bg-comic-aged text-comic-ink-soft border-comic-ink/20",
  generating:  "bg-comic-cyan/10 text-comic-navy border-comic-cyan/30",
  draft:       "bg-amber-50 text-amber-700 border-amber-300",
  pending:     "bg-comic-aged text-comic-ink-soft border-comic-ink/20",
  approved:    "bg-comic-sage text-white border-comic-sage",
};

const STATUS_LABEL: Record<string, string> = {
  generated:   "Listo",
  briefed:     "Brief",
  recommended: "Sugerido",
  selected:    "Seleccionado",
  generating:  "Generando",
  draft:       "Borrador",
  pending:     "Pendiente",
  approved:    "Aprobado",
};

function wordCount(text: string | null) {
  if (!text) return 0;
  return text.trim().split(/\s+/).length;
}

export default function ArticlesPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [articles, setArticles] = useState<ContentBriefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Only show articles that have been generated/are in progress — not mere suggestions
  const GENERATED_STATUSES = new Set(["generated", "briefed", "draft", "approved", "generating"]);

  useEffect(() => {
    contentApi
      .listBriefs(projectId)
      .then((all) => setArticles(all.filter((a) => GENERATED_STATUSES.has(a.status))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleSetStatus = useCallback(async (articleId: string, status: string) => {
    setUpdatingId(articleId);
    try {
      const updated = await contentApi.updateBrief(articleId, { status });
      setArticles((prev) => prev.map((a) => (a.id === articleId ? { ...a, status: updated.status } : a)));
    } catch (e) {
      console.error("Failed to update status:", e);
    } finally {
      setUpdatingId(null);
    }
  }, []);

  const handleDelete = useCallback(async (articleId: string) => {
    setUpdatingId(articleId);
    try {
      await contentApi.deleteBrief(articleId);
      setArticles((prev) => prev.filter((a) => a.id !== articleId));
    } catch (e) {
      console.error("Failed to delete article:", e);
    } finally {
      setUpdatingId(null);
    }
  }, []);

  // Group by niche
  const byNiche = articles.reduce<Record<string, ContentBriefItem[]>>((acc, a) => {
    const key = a.niche ?? "sin-nicho";
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-comic-ink-soft">
        Cargando artículos...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-comic-ink tracking-tight">Artículos</h1>
          <p className="text-sm text-comic-ink-soft mt-0.5">
            {articles.length > 0
              ? `${articles.length} artículo${articles.length !== 1 ? "s" : ""} generados con IA — optimizados para las keywords donde rankean tus competidores. Edita, aprueba y publica en tu blog.`
              : "Aquí aparecerán los artículos SEO generados con IA desde Dominar SEO. Ve a un nicho → Dominar SEO → selecciona keywords y genera."}
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/niches`}
          className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
        >
          <Plus className="h-3.5 w-3.5" />
          Generar más
        </Link>
      </div>

      {/* Empty */}
      {articles.length === 0 && (
        <div className="rounded-sm border-2 border-dashed border-comic-ink/20 p-10 text-center">
          <FileText className="h-8 w-8 text-comic-ink/20 mx-auto mb-3" />
          <p className="text-sm text-comic-ink-soft">
            Aún no hay artículos generados. Genera contenido desde la sección{" "}
            <strong>Dominar SEO</strong>.
          </p>
        </div>
      )}

      {/* Articles by niche */}
      {Object.entries(byNiche).map(([niche, items]) => (
        <div key={niche} className="space-y-2">
          {/* Niche label */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-comic-ink uppercase tracking-widest">
              {niche.replace(/-/g, " ")}
            </span>
            <span className="text-xs text-comic-ink-soft">({items.length})</span>
            <div className="flex-1 h-px bg-comic-ink/10" />
            {/* Summary badges */}
            <div className="flex items-center gap-1.5">
              {["draft", "approved"].map((s) => {
                const count = items.filter((a) => a.status === s).length;
                if (!count) return null;
                return (
                  <span
                    key={s}
                    className={cn(
                      "rounded-sm border px-2 py-0.5 text-[10px] font-bold",
                      STATUS_STYLE[s]
                    )}
                  >
                    {count} {STATUS_LABEL[s].toLowerCase()}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Article rows */}
          <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs divide-y divide-comic-ink/10 overflow-hidden">
            {items.map((a) => {
              const isUpdating = updatingId === a.id;
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-2 px-4 py-3 hover:bg-comic-aged/30 transition-colors group"
                >
                  {/* Clickable area → article detail */}
                  <Link
                    href={`/projects/${projectId}/articles/${a.id}`}
                    className="flex flex-1 items-center gap-3 min-w-0"
                  >
                    <FileText className="h-4 w-4 text-comic-ink-soft shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-comic-ink truncate leading-snug">
                        {a.title ?? a.keyword}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {a.category && (
                          <span className="flex items-center gap-1 text-[11px] text-comic-ink-soft">
                            <Tag className="h-2.5 w-2.5" />
                            {CATEGORY_LABELS[a.category] ?? a.category}
                          </span>
                        )}
                        {a.generated_content && (
                          <span className="flex items-center gap-1 text-[11px] text-comic-ink-soft">
                            <Clock className="h-2.5 w-2.5" />
                            ~{wordCount(a.generated_content).toLocaleString()} palabras
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>

                  {/* Status badge + action buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "rounded-sm border px-2 py-0.5 text-[10px] font-bold",
                        STATUS_STYLE[a.status] ?? STATUS_STYLE.pending
                      )}
                    >
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>

                    {/* Draft button — shown unless already draft */}
                    {a.status !== "draft" && (
                      <button
                        onClick={() => handleSetStatus(a.id, "draft")}
                        disabled={isUpdating}
                        title="Marcar como borrador"
                        className={cn(
                          "rounded-sm border border-amber-300 bg-amber-50 p-1 text-amber-600 transition-all",
                          "opacity-0 group-hover:opacity-100",
                          "hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-30"
                        )}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}

                    {/* Approve button — shown unless already approved */}
                    {a.status !== "approved" && (
                      <button
                        onClick={() => handleSetStatus(a.id, "approved")}
                        disabled={isUpdating}
                        title="Marcar como aprobado"
                        className={cn(
                          "rounded-sm border border-comic-sage/50 bg-comic-sage/10 p-1 text-comic-sage transition-all",
                          "opacity-0 group-hover:opacity-100",
                          "hover:bg-comic-sage/20 disabled:cursor-not-allowed disabled:opacity-30"
                        )}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                      </button>
                    )}

                    {/* Delete button */}
                    <button
                      onClick={(e) => { e.preventDefault(); handleDelete(a.id); }}
                      disabled={isUpdating}
                      title="Eliminar artículo"
                      className={cn(
                        "rounded-sm border border-red-200 bg-red-50 p-1 text-red-400 transition-all",
                        "opacity-0 group-hover:opacity-100",
                        "hover:bg-red-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                      )}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>

                    <ChevronRight className="h-4 w-4 text-comic-ink-soft/40 shrink-0 group-hover:text-comic-rust transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
