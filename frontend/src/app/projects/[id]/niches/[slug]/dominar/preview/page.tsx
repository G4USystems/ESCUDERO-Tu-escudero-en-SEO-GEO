"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  content,
  type ContentBriefItem,
  niches as nichesApi,
  projects as projectsApi,
  type NicheDetail,
  type ProjectDetail,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  FileText,
  CheckCircle2,
  XCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  FileCheck,
  FilePen,
} from "lucide-react";

export default function BriefsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const slug = params.slug as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [niche, setNiche] = useState<NicheDetail | null>(null);
  const [briefs, setBriefs] = useState<ContentBriefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pasteModalBrief, setPasteModalBrief] = useState<ContentBriefItem | null>(null);
  const [pasteContent, setPasteContent] = useState("");
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
      // Show briefs that have been briefed (have skill_context)
      setBriefs(briefsList.filter((b) => b.status === "briefed" || b.status === "generated" || b.status === "approved"));
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (briefId: string) => {
    await content.updateBrief(briefId, { status: "approved" });
    setBriefs((prev) =>
      prev.map((b) => (b.id === briefId ? { ...b, status: "approved" } : b))
    );
  };

  const handleDelete = async (briefId: string) => {
    await content.deleteBrief(briefId);
    setBriefs((prev) => prev.filter((b) => b.id !== briefId));
  };

  const handleCopyBrief = (brief: ContentBriefItem) => {
    if (!brief.skill_context) {
      console.error("No skill_context available");
      return;
    }

    navigator.clipboard.writeText(brief.skill_context);
    setCopiedId(brief.id);

    // Show toast-style feedback
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenPasteModal = (brief: ContentBriefItem) => {
    setPasteModalBrief(brief);
    setPasteContent(brief.generated_content || "");
  };

  const handleSavePaste = async () => {
    if (!pasteModalBrief) return;

    try {
      await content.updateBrief(pasteModalBrief.id, {
        generated_content: pasteContent,
        status: "generated",
      });

      setBriefs((prev) =>
        prev.map((b) =>
          b.id === pasteModalBrief.id
            ? { ...b, generated_content: pasteContent, status: "generated" }
            : b
        )
      );

      setPasteModalBrief(null);
      setPasteContent("");
    } catch (e) {
      console.error("Failed to save content:", e);
    }
  };

  const getStatusIcon = (brief: ContentBriefItem) => {
    if (brief.status === "approved") {
      return <CheckCircle2 className="h-4 w-4 text-comic-sage shrink-0" />;
    } else if (brief.status === "generated") {
      return <FilePen className="h-4 w-4 text-comic-cyan shrink-0" />;
    } else {
      return <FileCheck className="h-4 w-4 text-comic-ink-soft shrink-0" />;
    }
  };

  const getStatusText = (brief: ContentBriefItem) => {
    if (brief.status === "approved") return "Aprobado";
    if (brief.status === "generated") return "Contenido generado";
    return "Brief listo";
  };

  if (loading) {
    return <div className="py-8 text-center text-comic-ink-soft">Cargando...</div>;
  }
  if (!project || !niche) {
    return <div className="py-8 text-center text-comic-ink-soft">No encontrado.</div>;
  }

  const approved = briefs.filter((b) => b.status === "approved").length;
  const generated = briefs.filter((b) => b.status === "generated").length;
  const briefed = briefs.filter((b) => b.status === "briefed").length;
  const total = briefs.length;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/projects/${projectId}/niches/${slug}/dominar/generate`}
          className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a Generar
        </Link>
      </div>

      {/* Header */}
      <div>
        <h2 className="text-xl font-black tracking-tight text-comic-ink flex items-center gap-2">
          <FileText className="h-5 w-5 text-comic-rust" />
          Content Briefs
        </h2>
        <p className="mt-1 text-sm text-comic-ink-soft">
          Briefs listos para invocar marketing skills en Claude Code CLI para &quot;{niche.name}&quot;.
          {total > 0 && (
            <span className="ml-2 font-bold">
              {briefed} briefed · {generated} con contenido · {approved} aprobados
            </span>
          )}
        </p>
      </div>

      {/* Skills Invocation Guide (collapsible) */}
      <div className="rounded-sm border-2 border-comic-cyan/30 bg-comic-cyan/5 shadow-comic-xs overflow-hidden">
        <details className="group">
          <summary className="px-4 py-3 cursor-pointer hover:bg-comic-cyan/10 transition-colors flex items-center gap-2 text-sm font-bold text-comic-ink list-none">
            <span>⚡</span> Cómo generar contenido con skills
            <ChevronDown className="h-4 w-4 ml-auto group-open:rotate-180 transition-transform" />
          </summary>
          <div className="px-4 py-4 border-t-2 border-comic-cyan/20 space-y-4 text-xs text-comic-ink">

            {/* Workflow steps */}
            <ol className="space-y-1.5 list-decimal list-inside text-comic-ink-soft">
              <li>Abre el brief card y haz clic en <strong className="text-comic-ink">[Copy Brief for CLI]</strong></li>
              <li>En tu terminal: escribe el skill (ej: <code className="px-1 py-0.5 bg-comic-aged rounded">/copywriting</code>)</li>
              <li>Pega el brief como contexto — el skill genera el contenido completo</li>
              <li>Para enriquecer: usa el skill secundario indicado en el brief</li>
              <li>(Opcional) Pega el resultado de vuelta con <strong className="text-comic-ink">[Paste Content]</strong></li>
            </ol>

            {/* Skills by group */}
            <div className="space-y-3 pt-1 border-t border-comic-cyan/20">

              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-comic-ink-soft mb-1.5">
                  Crear contenido (TOFU → BOFU)
                </p>
                <div className="space-y-1">
                  <div className="flex gap-2 items-start">
                    <code className="px-1.5 py-0.5 bg-comic-aged rounded text-[10px] text-comic-rust whitespace-nowrap">/copywriting</code>
                    <span className="text-comic-ink-soft">Artículos de blog, guías, comparativas y landing pages</span>
                  </div>
                  <div className="flex gap-2 items-start">
                    <code className="px-1.5 py-0.5 bg-comic-aged rounded text-[10px] text-comic-rust whitespace-nowrap">/content-strategy</code>
                    <span className="text-comic-ink-soft">Pilares TOFU, topic clusters y calendario editorial</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-comic-ink-soft mb-1.5">
                  Escalar con SEO programático
                </p>
                <div className="space-y-1">
                  <div className="flex gap-2 items-start">
                    <code className="px-1.5 py-0.5 bg-comic-aged rounded text-[10px] text-comic-rust whitespace-nowrap">/programmatic-seo</code>
                    <span className="text-comic-ink-soft">Templates repetibles: Top N, por ciudad, por industria</span>
                  </div>
                  <div className="flex gap-2 items-start">
                    <code className="px-1.5 py-0.5 bg-comic-aged rounded text-[10px] text-comic-rust whitespace-nowrap">/competitor-alternatives</code>
                    <span className="text-comic-ink-soft">Páginas &ldquo;vs competidor&rdquo; y &ldquo;alternativas a X&rdquo; para capturar tráfico MOFU</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-comic-ink-soft mb-1.5">
                  Optimizar (úsalos después de crear)
                </p>
                <div className="space-y-1">
                  <div className="flex gap-2 items-start">
                    <code className="px-1.5 py-0.5 bg-comic-aged rounded text-[10px] text-comic-rust whitespace-nowrap">/schema-markup</code>
                    <span className="text-comic-ink-soft">JSON-LD para rich results: Article, FAQ, HowTo, ItemList</span>
                  </div>
                  <div className="flex gap-2 items-start">
                    <code className="px-1.5 py-0.5 bg-comic-aged rounded text-[10px] text-comic-rust whitespace-nowrap">/seo-audit</code>
                    <span className="text-comic-ink-soft">Auditar los artículos de competidores antes de escribir el tuyo</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-comic-ink-soft mb-1.5">
                  Crecer y distribuir
                </p>
                <div className="space-y-1">
                  <div className="flex gap-2 items-start">
                    <code className="px-1.5 py-0.5 bg-comic-aged rounded text-[10px] text-comic-rust whitespace-nowrap">/marketing-ideas</code>
                    <span className="text-comic-ink-soft">139 ideas: free tools, campaigns, influencers, PR, social</span>
                  </div>
                  <div className="flex gap-2 items-start">
                    <code className="px-1.5 py-0.5 bg-comic-aged rounded text-[10px] text-comic-rust whitespace-nowrap">/referral-program</code>
                    <span className="text-comic-ink-soft">Programa de referidos/afiliados para distribución de contenido</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Funnel reminder */}
            <div className="pt-2 border-t border-comic-cyan/20 flex items-start gap-2">
              <div className="text-[10px] text-comic-ink-soft">
                <strong className="text-comic-ink">Embudo de contenido:</strong>{" "}
                <span className="text-slate-500 font-bold">TOFU</span> (aprender) →{" "}
                <span className="text-amber-600 font-bold">MOFU</span> (comparar) →{" "}
                <span className="text-red-600 font-bold">BOFU</span> (comprar). Cada brief indica en qué fase del embudo actúa.
              </div>
            </div>
          </div>
        </details>
      </div>

      {/* Brief cards */}
      {briefs.length === 0 ? (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-6 shadow-comic-xs text-center">
          <p className="text-sm text-comic-ink-soft">
            No hay briefs generados todavía.{" "}
            <Link
              href={`/projects/${projectId}/niches/${slug}/dominar/generate`}
              className="text-comic-rust underline"
            >
              Genera briefs primero
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {briefs.map((brief) => {
            const isExpanded = expandedId === brief.id;
            const isCopied = copiedId === brief.id;

            return (
              <div
                key={brief.id}
                className={cn(
                  "rounded-sm border-2 bg-comic-paper shadow-comic-xs overflow-hidden transition-all",
                  brief.status === "approved" ? "border-comic-sage" :
                  brief.status === "generated" ? "border-comic-cyan" :
                  "border-comic-ink"
                )}
              >
                {/* Card header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : brief.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-comic-aged/30 transition-colors"
                >
                  {getStatusIcon(brief)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-comic-ink truncate">
                      {brief.keyword}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="rounded-sm bg-comic-aged px-1.5 py-0.5 text-[10px] text-comic-ink-soft">
                        {brief.category}
                      </span>
                      {brief.suggested_skill && (
                        <span className="rounded-sm bg-comic-rust/10 border border-comic-rust/30 px-1.5 py-0.5 text-[10px] text-comic-rust">
                          /{brief.suggested_skill}
                        </span>
                      )}
                      <span className="text-[10px] text-comic-ink-soft">
                        {getStatusText(brief)}
                      </span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-comic-ink-soft shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-comic-ink-soft shrink-0" />
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t-2 border-comic-ink/20 px-4 py-4 space-y-4">
                    {/* Skill context (markdown brief) */}
                    {brief.skill_context ? (
                      <div className="rounded-sm bg-comic-aged/30 p-3 overflow-x-auto">
                        <div className="text-[10px] uppercase font-bold text-comic-ink-soft mb-2">
                          Content Brief para CLI
                        </div>
                        <pre className="text-[11px] text-comic-ink whitespace-pre-wrap font-mono leading-relaxed">
                          {brief.skill_context}
                        </pre>
                      </div>
                    ) : (
                      <div className="rounded-sm bg-red-50 border border-red-200 p-3">
                        <p className="text-xs text-red-600">
                          ⚠️ No hay skill_context generado para este brief
                        </p>
                      </div>
                    )}

                    {/* Generated content (if pasted back) */}
                    {brief.generated_content && (
                      <div className="rounded-sm bg-comic-cyan/10 border border-comic-cyan/30 p-3">
                        <div className="text-[10px] uppercase font-bold text-comic-ink-soft mb-2">
                          Contenido Generado (pegado de CLI)
                        </div>
                        <div className="text-xs text-comic-ink max-h-48 overflow-y-auto">
                          {brief.generated_content.slice(0, 500)}
                          {brief.generated_content.length > 500 && "..."}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-comic-ink/10 flex-wrap">
                      {brief.skill_context && (
                        <button
                          onClick={() => handleCopyBrief(brief)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-sm border-2 border-comic-ink px-3 py-1.5 text-xs font-bold shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
                            isCopied ? "bg-comic-sage/20 text-comic-sage" : "bg-comic-yellow text-comic-ink"
                          )}
                        >
                          <Copy className="h-3 w-3" />
                          {isCopied ? "¡Copiado!" : "Copy Brief for CLI"}
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenPasteModal(brief)}
                        className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-paper px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                      >
                        <ClipboardPaste className="h-3 w-3" />
                        Paste Content
                      </button>

                      {brief.status !== "approved" && (
                        <button
                          onClick={() => handleApprove(brief.id)}
                          className="flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-sage/20 px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Aprobar
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(brief.id)}
                        className="ml-auto flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-paper px-3 py-1.5 text-xs font-bold text-red-500 shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                      >
                        <XCircle className="h-3 w-3" />
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Paste Content Modal */}
      {pasteModalBrief && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-comic-paper rounded-sm border-2 border-comic-ink shadow-comic-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b-2 border-comic-ink">
              <h3 className="text-sm font-bold text-comic-ink">
                Paste Generated Content
              </h3>
              <p className="text-xs text-comic-ink-soft mt-1">
                Brief: {pasteModalBrief.keyword}
              </p>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <textarea
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="Pega aquí el contenido generado por el skill de Claude Code CLI..."
                className="w-full h-64 rounded-sm border-2 border-comic-ink/30 bg-white px-3 py-2 text-xs font-mono focus:border-comic-rust focus:outline-none resize-none"
              />
              <p className="text-xs text-comic-ink-soft mt-2">
                Esto es opcional — puedes guardar el contenido aquí para trackear completitud y exportarlo después.
              </p>
            </div>

            <div className="px-4 py-3 border-t-2 border-comic-ink flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setPasteModalBrief(null);
                  setPasteContent("");
                }}
                className="rounded-sm border-2 border-comic-ink bg-comic-paper px-4 py-2 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              >
                Cancelar
              </button>
              <button
                onClick={handleSavePaste}
                className="rounded-sm border-2 border-comic-ink bg-comic-yellow px-4 py-2 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              >
                Save Content
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => router.push(`/projects/${projectId}/niches/${slug}/dominar/generate`)}
          className="flex items-center gap-2 rounded-sm border-2 border-comic-ink bg-comic-paper px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
      </div>
    </div>
  );
}
