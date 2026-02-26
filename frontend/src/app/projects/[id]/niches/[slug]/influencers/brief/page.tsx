"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { influencerBrief as briefApi, type InfluencerBriefData } from "@/lib/api";
import { ArrowLeft, RefreshCw, FileText, Copy, Check, Pencil, Save, X } from "lucide-react";

/** Minimal markdown renderer — handles #, ##, ###, bold, code, tables, lists, blockquote, hr */
function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  const nextKey = () => ++key;

  function inlineFormat(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={idx} className="rounded bg-comic-aged px-1 py-0.5 font-mono text-[11px]">{part.slice(1, -1)}</code>;
      return part;
    });
  }

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      nodes.push(<h1 key={nextKey()} className="mt-8 mb-3 text-2xl font-black text-comic-ink tracking-tight border-b-2 border-comic-ink pb-2">{inlineFormat(line.slice(2))}</h1>);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h2 key={nextKey()} className="mt-7 mb-2 text-base font-black text-comic-ink uppercase tracking-widest bg-comic-ink text-comic-yellow px-3 py-1 inline-block">{inlineFormat(line.slice(3))}</h2>);
      i++; continue;
    }
    if (line.startsWith("### ")) {
      nodes.push(<h3 key={nextKey()} className="mt-4 mb-1.5 text-sm font-black text-comic-ink">{inlineFormat(line.slice(4))}</h3>);
      i++; continue;
    }
    if (line.trim() === "---") {
      nodes.push(<hr key={nextKey()} className="my-5 border-comic-ink/20" />);
      i++; continue;
    }
    if (line.startsWith("> ")) {
      nodes.push(<blockquote key={nextKey()} className="my-3 border-l-4 border-comic-rust pl-4 py-1 italic text-sm text-comic-ink bg-comic-rust/5">{inlineFormat(line.slice(2))}</blockquote>);
      i++; continue;
    }
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) { tableLines.push(lines[i]); i++; }
      const dataRows = tableLines.filter((l) => !/^[\s|:-]+$/.test(l));
      const [headerRow, ...bodyRows] = dataRows;
      const parseCells = (row: string) => row.split("|").map((c) => c.trim()).filter(Boolean);
      nodes.push(
        <div key={nextKey()} className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm border-2 border-comic-ink">
            <thead><tr className="bg-comic-ink text-comic-yellow">{parseCells(headerRow).map((cell, ci) => <th key={ci} className="border border-comic-ink/40 px-3 py-1.5 text-left text-[11px] font-black uppercase tracking-wide">{inlineFormat(cell)}</th>)}</tr></thead>
            <tbody>{bodyRows.map((row, ri) => <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-comic-aged/30"}>{parseCells(row).map((cell, ci) => <td key={ci} className="border border-comic-ink/20 px-3 py-1.5 text-xs text-comic-ink">{inlineFormat(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line) || /^- \[/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && (/^[-*]\s/.test(lines[i]) || /^\d+\.\s/.test(lines[i]) || /^- \[/.test(lines[i]))) {
        items.push(lines[i]); i++;
      }
      nodes.push(
        <ul key={nextKey()} className="my-2 space-y-1 ml-4">
          {items.map((item, li) => {
            const isChecked = item.startsWith("- [x]");
            const isUnchecked = item.startsWith("- [ ]");
            let text = item;
            if (isChecked || isUnchecked) text = item.replace(/^- \[[ x]\] /, "");
            else if (/^[-*]\s/.test(item)) text = item.slice(2);
            else text = item.replace(/^\d+\.\s/, "");
            return (
              <li key={li} className="flex items-start gap-2 text-sm text-comic-ink">
                {(isChecked || isUnchecked) ? (
                  <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border-2 ${isChecked ? "border-comic-sage bg-comic-sage/20" : "border-comic-ink/40"} flex items-center justify-center text-[8px] font-black`}>{isChecked && "✓"}</span>
                ) : <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-comic-rust" />}
                <span>{inlineFormat(text)}</span>
              </li>
            );
          })}
        </ul>
      );
      continue;
    }
    if (line.trim() === "") { nodes.push(<div key={nextKey()} className="h-2" />); i++; continue; }
    nodes.push(<p key={nextKey()} className="text-sm leading-relaxed text-comic-ink my-1">{inlineFormat(line)}</p>);
    i++;
  }
  return nodes;
}

export default function InfluencerBriefPage() {
  const params = useParams();
  const projectId = params.id as string;
  const slug = params.slug as string;

  const [data, setData] = useState<InfluencerBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Copy state
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (regenerate = false) => {
    setLoading(true);
    setError(null);
    setEditMode(false);
    try {
      const result = await briefApi.get(projectId, slug, regenerate);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando el brief");
    } finally {
      setLoading(false);
    }
  }, [projectId, slug]);

  useEffect(() => { load(); }, [load]);

  const handleEdit = () => {
    setEditContent(data?.brief ?? "");
    setEditMode(true);
    setSaved(false);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditContent("");
  };

  const handleSave = async () => {
    if (!editContent.trim()) return;
    setSaving(true);
    try {
      const result = await briefApi.save(projectId, slug, editContent);
      setData(result);
      setEditMode(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.brief).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const generatedAt = data
    ? new Date(data.generated_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href={`/projects/${projectId}/niches/${slug}/influencers`}
            className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a influencers
          </Link>
          <h2 className="text-xl font-black text-comic-ink tracking-tight">Brief de Campaña — Influencers</h2>
          {generatedAt && (
            <p className="text-xs text-comic-ink-soft mt-0.5">
              {data?.client_name} × {data?.niche_name} · {generatedAt}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-comic-sage">
              <Check className="h-3.5 w-3.5" /> Guardado
            </span>
          )}

          {data && !loading && !editMode && (
            <>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-white px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-comic-sage" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
              <button
                onClick={handleEdit}
                className="inline-flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-white px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
            </>
          )}

          {editMode && (
            <>
              <button
                onClick={handleCancelEdit}
                className="inline-flex items-center gap-1.5 rounded-sm border-2 border-comic-ink/40 bg-white px-3 py-1.5 text-xs font-bold text-comic-ink-soft shadow-comic-xs transition-all hover:border-comic-ink hover:text-comic-ink"
              >
                <X className="h-3.5 w-3.5" />
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-sage/20 px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-50"
              >
                <Save className={`h-3.5 w-3.5 ${saving ? "animate-pulse" : ""}`} />
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </>
          )}

          {!editMode && (
            <button
              onClick={() => load(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-3 py-1.5 text-xs font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Generando..." : "Regenerar"}
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-12 text-center shadow-comic-xs">
          <FileText className="h-8 w-8 text-comic-rust mx-auto mb-4" />
          <RefreshCw className="h-5 w-5 animate-spin text-comic-rust mx-auto mb-3" />
          <p className="text-sm font-bold text-comic-ink">Generando brief de campaña...</p>
          <p className="text-xs text-comic-ink-soft mt-1">Sancho está creando los módulos del brief</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-sm border-2 border-red-400 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Edit mode */}
      {data && !loading && editMode && (
        <div className="space-y-2">
          <p className="text-xs text-comic-ink-soft">Edita el Markdown directamente. Haz clic en <strong>Guardar</strong> cuando estés listo.</p>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full min-h-[600px] rounded-sm border-2 border-comic-ink bg-comic-paper p-4 font-mono text-xs text-comic-ink leading-relaxed shadow-comic-sm focus:outline-none focus:border-comic-rust resize-y"
            spellCheck={false}
          />
        </div>
      )}

      {/* View mode */}
      {data && !loading && !editMode && (
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-6 shadow-comic-sm">
          {renderMarkdown(data.brief)}
        </div>
      )}
    </div>
  );
}
