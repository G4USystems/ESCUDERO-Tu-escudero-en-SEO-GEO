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
  FileText,
  CheckCircle2,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  X,
  Zap,
} from "lucide-react";

const CATEGORY_LABEL: Record<string, string> = {
  ranking: "Ranking",
  comparison: "Comparativa",
  guide: "Guía",
  solution: "Solución",
  authority: "Autoridad",
  trend: "Tendencia",
  discovery: "Discovery",
  recommendation: "Recomendación",
  content_gap: "Gap de Contenido",
  influencer: "Influencer",
};

export default function ContenidoPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const slug = params.slug as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [niche, setNiche] = useState<NicheDetail | null>(null);
  const [articles, setArticles] = useState<ContentBriefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [proj, nicheData, briefsList] = await Promise.all([
        projectsApi.get(projectId),
        nichesApi.get(projectId, slug),
        content.listBriefs(projectId, slug),
      ]);
      setProject(proj);
      setNiche(nicheData);
      setArticles(briefsList.filter((b) => b.status === "generated" || b.status === "approved"));
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (id: string) => {
    const art = articles.find((a) => a.id === id);
    if (!art) return;
    const newStatus = art.status === "approved" ? "generated" : "approved";
    await content.updateBrief(id, { status: newStatus });
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a)));
  };

  const handleDelete = async (id: string) => {
    await content.deleteBrief(id);
    setArticles((prev) => prev.filter((a) => a.id !== id));
  };

  const handleCopy = async (art: ContentBriefItem) => {
    const text = art.generated_content || "";
    await navigator.clipboard.writeText(text);
    setCopiedId(art.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStartEdit = (art: ContentBriefItem) => {
    setEditingId(art.id);
    setEditingContent(art.generated_content || "");
    setExpandedId(art.id);
  };

  const handleSaveEdit = async (id: string) => {
    await content.updateBrief(id, { generated_content: editingContent });
    setArticles((prev) =>
      prev.map((a) => (a.id === id ? { ...a, generated_content: editingContent } : a))
    );
    setEditingId(null);
    setEditingContent("");
  };

  const wordCount = (text: string | null | undefined) => {
    if (!text) return 0;
    return text.trim().split(/\s+/).length;
  };

  if (loading) {
    return <div className="py-8 text-center text-comic-ink-soft">Cargando...</div>;
  }
  if (!project || !niche) {
    return <div className="py-8 text-center text-comic-ink-soft">No encontrado.</div>;
  }

  const approved = articles.filter((a) => a.status === "approved");
  const drafts = articles.filter((a) => a.status === "generated");

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/projects/${projectId}/niches/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a {niche.name}
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-comic-ink flex items-center gap-2">
            <FileText className="h-5 w-5 text-comic-rust" />
            Contenido — {niche.name}
          </h2>
          <p className="mt-1 text-sm text-comic-ink-soft">
            {articles.length} artículo{articles.length !== 1 ? "s" : ""} generado{articles.length !== 1 ? "s" : ""} ·{" "}
            {approved.length} aprobado{approved.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => router.push(`/projects/${projectId}/niches/${slug}/dominar`)}
          className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
        >
          <Zap className="h-3.5 w-3.5" />
          Generar más
        </button>
      </div>

      {/* Empty state */}
      {articles.length === 0 && (
        <div className="rounded-sm border-2 border-comic-ink/20 bg-comic-aged/30 p-8 text-center space-y-3">
          <FileText className="h-10 w-10 text-comic-ink-soft mx-auto" />
          <p className="text-sm font-bold text-comic-ink">No hay artículos generados todavía</p>
          <p className="text-xs text-comic-ink-soft">
            Ve a Dominar SEO → selecciona keywords → genera artículos con IA.
          </p>
          <button
            onClick={() => router.push(`/projects/${projectId}/niches/${slug}/dominar`)}
            className="inline-flex items-center gap-2 rounded-sm border-2 border-comic-ink bg-comic-yellow px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          >
            <Zap className="h-4 w-4" />
            Ir a Dominar SEO
          </button>
        </div>
      )}

      {/* Article list */}
      <div className="space-y-3">
        {articles.map((art) => {
          const isExpanded = expandedId === art.id;
          const isEditing = editingId === art.id;
          const isApproved = art.status === "approved";
          const words = wordCount(art.generated_content);
          const title = art.title || art.keyword;
          const category = CATEGORY_LABEL[art.category] || art.category;

          return (
            <div
              key={art.id}
              className={cn(
                "rounded-sm border-2 bg-comic-paper shadow-comic-xs overflow-hidden",
                isApproved ? "border-comic-sage" : "border-comic-ink"
              )}
            >
              {/* Card header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-comic-aged/30 transition-colors"
                onClick={() => {
                  if (!isEditing) setExpandedId(isExpanded ? null : art.id);
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isApproved && <CheckCircle2 className="h-4 w-4 text-comic-sage shrink-0" />}
                    <span className="font-bold text-sm text-comic-ink truncate">{title}</span>
                    <span className="rounded-sm bg-comic-aged px-1.5 py-0.5 text-[10px] text-comic-ink-soft shrink-0">
                      {category}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-comic-ink-soft">
                    <span>{words.toLocaleString()} palabras</span>
                    {art.recommendation_type === "prompt" && <span className="text-comic-rust">GEO</span>}
                    {isApproved && <span className="text-comic-sage font-bold">Aprobado</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Copy button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopy(art); }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-bold transition-colors",
                      copiedId === art.id
                        ? "border-comic-sage bg-comic-sage/10 text-comic-sage"
                        : "border-comic-ink/30 text-comic-ink-soft hover:border-comic-rust hover:text-comic-rust"
                    )}
                    title="Copiar artículo"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedId === art.id ? "Copiado" : "Copiar"}
                  </button>

                  {/* Approve toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleApprove(art.id); }}
                    className={cn(
                      "flex items-center gap-1 rounded-sm border px-2.5 py-1 text-xs font-bold transition-colors",
                      isApproved
                        ? "border-comic-sage bg-comic-sage text-white"
                        : "border-comic-ink/30 text-comic-ink-soft hover:border-comic-sage hover:text-comic-sage"
                    )}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {isApproved ? "Aprobado" : "Aprobar"}
                  </button>

                  {/* Expand toggle */}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-comic-ink-soft" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-comic-ink-soft" />
                  )}
                </div>
              </div>

              {/* Content area */}
              {isExpanded && (
                <div className="border-t-2 border-comic-ink/20">
                  {isEditing ? (
                    <div className="p-4 space-y-3">
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        rows={30}
                        className="w-full rounded-sm border-2 border-comic-rust/50 bg-white px-3 py-2 text-xs font-mono focus:outline-none resize-y"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEdit(art.id)}
                          className="flex items-center gap-1.5 rounded-sm border-2 border-comic-sage bg-comic-sage/10 px-3 py-1.5 text-xs font-bold text-comic-sage hover:bg-comic-sage/20 transition-colors"
                        >
                          <Check className="h-3 w-3" />
                          Guardar cambios
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditingContent(""); }}
                          className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink/30 px-3 py-1.5 text-xs font-bold text-comic-ink-soft hover:text-red-500 transition-colors"
                        >
                          <X className="h-3 w-3" />
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      {/* Toolbar */}
                      <div className="flex items-center justify-between mb-3 pb-3 border-b border-comic-ink/10">
                        <span className="text-xs text-comic-ink-soft">{words.toLocaleString()} palabras · Markdown</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleStartEdit(art)}
                            className="flex items-center gap-1 rounded-sm border border-comic-ink/20 px-2 py-1 text-xs text-comic-ink-soft hover:text-comic-rust hover:border-comic-rust transition-colors"
                          >
                            <Pencil className="h-3 w-3" />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(art.id)}
                            className="flex items-center gap-1 rounded-sm border border-comic-ink/20 px-2 py-1 text-xs text-comic-ink-soft hover:text-red-500 hover:border-red-300 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                            Eliminar
                          </button>
                        </div>
                      </div>
                      {/* Article content — preformatted for easy reading */}
                      <pre className="whitespace-pre-wrap font-sans text-xs text-comic-ink leading-relaxed max-h-[500px] overflow-y-auto">
                        {art.generated_content || "(Sin contenido)"}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      {articles.length > 0 && (
        <div className="rounded-sm border-2 border-comic-ink/20 bg-comic-aged/30 px-4 py-3 flex flex-wrap items-center gap-4 text-xs text-comic-ink-soft">
          <span>{drafts.length} borrador{drafts.length !== 1 ? "es" : ""}</span>
          <span>{approved.length} aprobado{approved.length !== 1 ? "s" : ""}</span>
          <span>
            {articles.reduce((acc, a) => acc + wordCount(a.generated_content), 0).toLocaleString()} palabras en total
          </span>
        </div>
      )}
    </div>
  );
}
