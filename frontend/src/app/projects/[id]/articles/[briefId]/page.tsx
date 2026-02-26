"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { content as contentApi, type ContentBriefItem } from "@/lib/api";
import { ArrowLeft, Copy, Check, Tag, FileText, Pencil, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  generated:   "bg-comic-sage/10 text-comic-sage border-comic-sage/30",
  briefed:     "bg-comic-cyan/10 text-comic-navy border-comic-cyan/30",
  recommended: "bg-comic-aged text-comic-ink-soft border-comic-ink/20",
  draft:       "bg-amber-50 text-amber-700 border-amber-300",
  pending:     "bg-comic-aged text-comic-ink-soft border-comic-ink/20",
  approved:    "bg-comic-sage text-white border-comic-sage",
};

const STATUS_LABEL: Record<string, string> = {
  generated:   "Listo",
  briefed:     "Brief",
  recommended: "Sugerido",
  draft:       "Borrador",
  pending:     "Pendiente",
  approved:    "Aprobado",
};

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

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");

  // Group lines into blocks: "table" blocks (consecutive | lines) or single "line" blocks
  type LineBlock = { type: "line"; content: string };
  type TableBlock = { type: "table"; rows: string[] };
  type Block = LineBlock | TableBlock;

  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trimStart().startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        rows.push(lines[i]);
        i++;
      }
      blocks.push({ type: "table", rows });
    } else {
      blocks.push({ type: "line", content: lines[i] });
      i++;
    }
  }

  const parseRow = (row: string) =>
    row.split("|").slice(1, -1).map((c) => c.trim());

  const isSeparator = (row: string) =>
    parseRow(row).every((c) => /^[\s:\-]+$/.test(c));

  return (
    <div className="prose-article space-y-2">
      {blocks.map((block, bi) => {
        if (block.type === "table") {
          const sepIdx = block.rows.findIndex(isSeparator);
          const headerRows = sepIdx > 0 ? block.rows.slice(0, sepIdx) : [];
          const bodyRows = sepIdx >= 0 ? block.rows.slice(sepIdx + 1) : block.rows;

          return (
            <div key={bi} className="overflow-x-auto my-3 rounded-sm border-2 border-comic-ink shadow-comic-xs">
              <table className="w-full border-collapse text-sm">
                {headerRows.length > 0 && (
                  <thead className="bg-comic-ink text-comic-yellow">
                    {headerRows.map((row, ri) => (
                      <tr key={ri}>
                        {parseRow(row).map((cell, ci) => (
                          <th key={ci} className="px-3 py-2 text-left text-xs font-black uppercase tracking-wide whitespace-nowrap">
                            <span dangerouslySetInnerHTML={{ __html: renderInline(cell) }} />
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                )}
                <tbody>
                  {bodyRows.map((row, ri) => (
                    <tr key={ri} className={cn("border-t border-comic-ink/10", ri % 2 === 1 ? "bg-comic-aged/30" : "bg-white")}>
                      {parseRow(row).map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-sm text-comic-ink">
                          <span dangerouslySetInnerHTML={{ __html: renderInline(cell) }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        const line = block.content;
        if (line.startsWith("# ")) {
          return <h1 key={bi} className="text-2xl font-black text-comic-ink mt-6 mb-2">{line.slice(2)}</h1>;
        }
        if (line.startsWith("## ")) {
          return <h2 key={bi} className="text-lg font-black text-comic-ink mt-5 mb-1.5 border-b-2 border-comic-ink/10 pb-1">{line.slice(3)}</h2>;
        }
        if (line.startsWith("### ")) {
          return <h3 key={bi} className="text-base font-bold text-comic-ink mt-4 mb-1">{line.slice(4)}</h3>;
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={bi} className="flex gap-2 text-sm text-comic-ink leading-relaxed">
              <span className="text-comic-rust font-black shrink-0 mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(line.slice(2)) }} />
            </div>
          );
        }
        if (/^\d+\. /.test(line)) {
          const num = line.match(/^(\d+)\. /)?.[1];
          return (
            <div key={bi} className="flex gap-2 text-sm text-comic-ink leading-relaxed">
              <span className="text-comic-rust font-black shrink-0 w-5 text-right">{num}.</span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(line.replace(/^\d+\. /, "")) }} />
            </div>
          );
        }
        if (line.trim() === "") {
          return <div key={bi} className="h-2" />;
        }
        return (
          <p key={bi} className="text-sm text-comic-ink leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderInline(line) }}
          />
        );
      })}
    </div>
  );
}

function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="text-xs bg-comic-aged px-1 rounded font-mono">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-comic-rust underline" target="_blank" rel="noopener">$1</a>');
}

export default function ArticlePage() {
  const params = useParams();
  const projectId = params.id as string;
  const briefId = params.briefId as string;

  const [article, setArticle] = useState<ContentBriefItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    contentApi.getBrief(briefId)
      .then(setArticle)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [briefId]);

  const handleCopy = () => {
    if (article?.generated_content) {
      navigator.clipboard.writeText(article.generated_content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGenerate = async () => {
    if (!article) return;
    setGenerating(true);
    try {
      const updated = await contentApi.generateArticle(article.id);
      setArticle(updated);
    } catch (e) {
      console.error("Failed to generate article:", e);
    } finally {
      setGenerating(false);
    }
  };

  const handleSetStatus = async (status: string) => {
    if (!article) return;
    setUpdatingStatus(true);
    try {
      const updated = await contentApi.updateBrief(article.id, { status });
      setArticle((prev) => prev ? { ...prev, status: updated.status } : prev);
    } catch (e) {
      console.error("Failed to update status:", e);
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-comic-ink-soft">Cargando artículo...</div>;
  }

  if (!article) {
    return <div className="py-12 text-center text-sm text-comic-ink-soft">Artículo no encontrado.</div>;
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* Back */}
      <Link
        href={`/projects/${projectId}/articles`}
        className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a artículos
      </Link>

      {/* Header card */}
      <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-5 shadow-comic-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-black text-comic-ink leading-snug">
              {article.title ?? article.keyword}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {article.category && (
                <span className="flex items-center gap-1 text-xs text-comic-ink-soft">
                  <Tag className="h-3 w-3" />
                  {CATEGORY_LABELS[article.category] ?? article.category}
                </span>
              )}
              {article.niche && (
                <span className="flex items-center gap-1 text-xs text-comic-ink-soft">
                  <FileText className="h-3 w-3" />
                  {article.niche.replace(/-/g, " ")}
                </span>
              )}
              {article.target_word_count && (
                <span className="text-xs text-comic-ink-soft">
                  ~{article.target_word_count.toLocaleString()} palabras objetivo
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Status badge */}
            <span className={cn(
              "rounded-sm border px-2 py-1 text-xs font-bold",
              STATUS_STYLE[article.status] ?? STATUS_STYLE.pending
            )}>
              {STATUS_LABEL[article.status] ?? article.status}
            </span>

            {/* Draft button */}
            {article.status !== "draft" && (
              <button
                onClick={() => handleSetStatus("draft")}
                disabled={updatingStatus}
                title="Marcar como borrador"
                className="inline-flex items-center gap-1 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
              >
                <Pencil className="h-3 w-3" />
                Borrador
              </button>
            )}

            {/* Approve button */}
            {article.status !== "approved" && (
              <button
                onClick={() => handleSetStatus("approved")}
                disabled={updatingStatus}
                title="Marcar como aprobado"
                className="inline-flex items-center gap-1 rounded-sm border border-comic-sage/50 bg-comic-sage/10 px-2 py-1 text-xs font-bold text-comic-sage hover:bg-comic-sage/20 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="h-3 w-3" />
                Aprobar
              </button>
            )}

            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-white px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-comic-sage" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {article.generated_content ? (
        <div className="rounded-sm border-2 border-comic-ink bg-white p-6 shadow-comic-xs">
          <MarkdownContent text={article.generated_content} />
        </div>
      ) : (
        <div className="rounded-sm border-2 border-dashed border-comic-ink/20 p-8 text-center space-y-4">
          <p className="text-sm text-comic-ink-soft">Este artículo no tiene contenido generado aún.</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-sm border-2 border-comic-ink bg-comic-yellow px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generating ? "Generando artículo..." : "Generar artículo con IA"}
          </button>
        </div>
      )}
    </div>
  );
}
