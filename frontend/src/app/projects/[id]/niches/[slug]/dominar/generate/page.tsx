"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  niches as nichesApi,
  projects as projectsApi,
  content,
  type NicheDetail,
  type ProjectDetail,
  type ContentBriefItem,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function GenerateArticlesPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const slug = params.slug as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [niche, setNiche] = useState<NicheDetail | null>(null);
  const [briefs, setBriefs] = useState<ContentBriefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [currentKeyword, setCurrentKeyword] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [proj, nicheData, briefsList] = await Promise.all([
        projectsApi.get(projectId),
        nichesApi.get(projectId, slug),
        content.listBriefs(projectId, slug),
      ]);
      setProject(proj);
      setNiche(nicheData);
      setBriefs(briefsList);
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerate = async () => {
    setGenerating(true);
    setProgress(0);
    setCompleted([]);
    setFailed([]);

    const selected = briefs.filter((b) => b.status === "selected");
    const total = selected.length;

    for (let i = 0; i < selected.length; i++) {
      const brief = selected[i];
      setCurrentKeyword(brief.keyword);
      try {
        const updated = await content.generateArticle(brief.id);
        setBriefs((prev) =>
          prev.map((b) => (b.id === updated.id ? updated : b))
        );
        setCompleted((prev) => [...prev, brief.id]);
      } catch (e) {
        console.error(`Failed to generate article for ${brief.keyword}:`, e);
        setFailed((prev) => [...prev, brief.id]);
      }
      setProgress((i + 1) / total);
    }

    setCurrentKeyword("");
    setGenerating(false);
  };

  const handleDeleteBrief = async (briefId: string) => {
    await content.deleteBrief(briefId);
    setBriefs((prev) => prev.filter((b) => b.id !== briefId));
  };

  if (loading) {
    return <div className="py-8 text-center text-comic-ink-soft">Cargando...</div>;
  }
  if (!project || !niche) {
    return <div className="py-8 text-center text-comic-ink-soft">No encontrado.</div>;
  }

  const selected = briefs.filter((b) => b.status === "selected");
  const generated = briefs.filter((b) => b.status === "generated" || b.status === "approved");
  const selectedKeywords = selected.filter((b) => b.recommendation_type === "keyword");
  const selectedPrompts = selected.filter((b) => b.recommendation_type === "prompt");

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/projects/${projectId}/niches/${slug}/dominar`}
          className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a Keywords
        </Link>
      </div>

      {/* Header */}
      <div>
        <h2 className="text-xl font-black tracking-tight text-comic-ink flex items-center gap-2">
          <FileText className="h-5 w-5 text-comic-rust" />
          Generar Artículos
        </h2>
        <p className="mt-1 text-sm text-comic-ink-soft">
          Genera artículos completos listos para publicar en tu blog para &quot;{niche.name}&quot;.
          Cada artículo tendrá entre 1500 y 2500 palabras, optimizado para SEO y GEO.
        </p>
      </div>

      {/* Progress bar while generating */}
      {generating && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-4 shadow-comic-xs space-y-2">
          <div className="flex justify-between text-sm font-bold text-comic-ink">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-comic-rust" />
              Generando artículo...
            </span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm border border-comic-ink bg-comic-aged">
            <div
              className="h-full rounded-sm bg-comic-rust transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {currentKeyword && (
            <p className="text-xs text-comic-ink-soft truncate">
              &quot;{currentKeyword}&quot;
            </p>
          )}
        </div>
      )}

      {/* Selected items */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
          <div className="px-4 py-3 border-b-2 border-comic-ink">
            <h3 className="text-sm font-bold text-comic-ink">
              Keywords ({selectedKeywords.length})
            </h3>
          </div>
          <div className="p-4">
            {selectedKeywords.length === 0 ? (
              <p className="text-xs text-comic-ink-soft">Ningún keyword seleccionado</p>
            ) : (
              <div className="space-y-1">
                {selectedKeywords.map((brief) => (
                  <div
                    key={brief.id}
                    className={cn(
                      "flex items-center gap-3 rounded-sm border px-3 py-2 text-sm",
                      completed.includes(brief.id)
                        ? "border-comic-sage/50 bg-comic-sage/5"
                        : failed.includes(brief.id)
                        ? "border-red-200 bg-red-50"
                        : "border-comic-ink/20"
                    )}
                  >
                    {completed.includes(brief.id) ? (
                      <CheckCircle2 className="h-4 w-4 text-comic-sage shrink-0" />
                    ) : failed.includes(brief.id) ? (
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                    ) : generating ? (
                      <Loader2 className="h-4 w-4 text-comic-rust animate-spin shrink-0" />
                    ) : null}
                    <span className="flex-1 font-medium text-comic-ink text-xs">{brief.keyword}</span>
                    <span className="rounded-sm bg-comic-aged px-1.5 py-0.5 text-[10px] text-comic-ink-soft shrink-0">
                      {brief.category}
                    </span>
                    {!generating && (
                      <button
                        onClick={() => handleDeleteBrief(brief.id)}
                        className="text-comic-ink-soft hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-xs overflow-hidden">
          <div className="px-4 py-3 border-b-2 border-comic-ink">
            <h3 className="text-sm font-bold text-comic-ink">
              GEO Prompts ({selectedPrompts.length})
            </h3>
          </div>
          <div className="p-4">
            {selectedPrompts.length === 0 ? (
              <p className="text-xs text-comic-ink-soft">Ningún prompt seleccionado</p>
            ) : (
              <div className="space-y-1">
                {selectedPrompts.map((brief) => (
                  <div
                    key={brief.id}
                    className={cn(
                      "flex items-center gap-3 rounded-sm border px-3 py-2 text-sm",
                      completed.includes(brief.id)
                        ? "border-comic-sage/50 bg-comic-sage/5"
                        : failed.includes(brief.id)
                        ? "border-red-200 bg-red-50"
                        : "border-comic-ink/20"
                    )}
                  >
                    {completed.includes(brief.id) ? (
                      <CheckCircle2 className="h-4 w-4 text-comic-sage shrink-0" />
                    ) : failed.includes(brief.id) ? (
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                    ) : generating ? (
                      <Loader2 className="h-4 w-4 text-comic-rust animate-spin shrink-0" />
                    ) : null}
                    <span className="flex-1 font-medium text-comic-ink text-xs">
                      {brief.keyword.length > 60 ? brief.keyword.slice(0, 60) + "..." : brief.keyword}
                    </span>
                    <span className="rounded-sm bg-comic-aged px-1.5 py-0.5 text-[10px] text-comic-ink-soft shrink-0">
                      {brief.category}
                    </span>
                    {!generating && (
                      <button
                        onClick={() => handleDeleteBrief(brief.id)}
                        className="text-comic-ink-soft hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* No items selected */}
      {selected.length === 0 && !generating && (
        <div className="rounded-sm border-2 border-comic-ink/20 bg-comic-aged/30 p-4 shadow-comic-xs">
          <p className="text-sm text-comic-ink-soft text-center">
            No hay items seleccionados.{" "}
            <Link
              href={`/projects/${projectId}/niches/${slug}/dominar`}
              className="text-comic-rust underline font-medium"
            >
              Vuelve a Keywords
            </Link>
            {" "}para seleccionar qué generar.
          </p>
        </div>
      )}

      {/* Generate button */}
      {selected.length > 0 && !generating && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-4 shadow-comic-xs space-y-2">
          <button
            onClick={handleGenerate}
            className="w-full flex items-center justify-center gap-2 rounded-sm border-2 border-comic-ink bg-comic-yellow px-4 py-3 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          >
            <FileText className="h-4 w-4" />
            Generar {selected.length} Artículo{selected.length > 1 ? "s" : ""}
          </button>
          <p className="text-xs text-comic-ink-soft text-center">
            Cada artículo se genera con IA: 1500–2500 palabras, listo para publicar en tu blog.
          </p>
        </div>
      )}

      {/* Completion */}
      {!generating && completed.length > 0 && (
        <div className="rounded-sm border-2 border-comic-sage bg-comic-sage/5 p-4 shadow-comic-xs space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-comic-sage" />
            <h3 className="text-sm font-bold text-comic-sage">
              {completed.length} artículo{completed.length > 1 ? "s" : ""} generado{completed.length > 1 ? "s" : ""}
            </h3>
          </div>
          {failed.length > 0 && (
            <p className="text-xs text-red-500">{failed.length} artículo{failed.length > 1 ? "s" : ""} no pudieron generarse.</p>
          )}
          <p className="text-xs text-comic-ink">
            Ve a &quot;Ver Contenido&quot; para revisar, editar y copiar tus artículos listos para publicar.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => router.push(`/projects/${projectId}/niches/${slug}/dominar`)}
          disabled={generating}
          className="flex items-center gap-2 rounded-sm border-2 border-comic-ink bg-comic-paper px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>

        <button
          onClick={() => router.push(`/projects/${projectId}/niches/${slug}/contenido`)}
          disabled={generated.length === 0 || generating}
          className={cn(
            "flex items-center gap-2 rounded-sm border-2 border-comic-ink px-4 py-2 text-sm font-bold shadow-comic-xs transition-all",
            generated.length > 0 && !generating
              ? "bg-comic-yellow text-comic-ink hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              : "bg-comic-aged text-comic-ink-soft cursor-not-allowed"
          )}
        >
          Ver Contenido
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
