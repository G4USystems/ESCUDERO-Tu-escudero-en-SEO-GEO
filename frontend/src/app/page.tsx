"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { projects, type Project } from "@/lib/api";
import { Globe, Plus, Trash2, Pencil } from "lucide-react";

export default function HomePage() {
  const [list, setList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    projects
      .list()
      .then(setList)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`¿Eliminar la campaña "${project.name}"?\n\nSe borrarán todos los nichos, análisis e influencers asociados. Esta acción no se puede deshacer.`)) return;
    setDeleting(project.id);
    try {
      await projects.delete(project.id);
      setList((prev) => prev.filter((p) => p.id !== project.id));
    } catch (err) {
      alert("Error al eliminar la campaña. Inténtalo de nuevo.");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-comic-ink-soft text-sm">
        Cargando campañas...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-comic-ink tracking-tight">Campañas</h1>
          <p className="text-sm text-comic-ink-soft leading-relaxed max-w-xl">
            Crea una campaña por cada marca que quieras analizar. 🛡️ Tu escudero estudiará a tus competidores, detectará dónde tienen visibilidad que tú no tienes — en Google y en IAs — y te dará las herramientas para cerrar esa brecha. 🎯
          </p>
        </div>
        <Link
          href="/projects/new"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva Campaña
        </Link>
      </div>

      {/* Hint */}
      {list.length > 0 && (
        <p className="text-[11px] text-comic-ink-soft/70 italic">
          👆 Haz clic en una tarjeta para abrir la campaña y gestionar sus nichos.
        </p>
      )}

      {/* Empty state */}
      {list.length === 0 ? (
        <div className="rounded-sm border-2 border-dashed border-comic-ink/30 p-10 text-center">
          <p className="text-sm text-comic-ink-soft">
            Aún no tienes campañas. Crea tu primera campaña para empezar.
          </p>
          <Link
            href="/projects/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          >
            <Plus className="h-3.5 w-3.5" />
            Crear primera campaña
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <div
              key={p.id}
              className="group relative rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-sm transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
            >
              <Link href={`/projects/${p.id}`} className="block p-5">
                {/* Name + arrow */}
                <div className="flex items-start justify-between gap-2 pr-6">
                  <h2 className="text-base font-black text-comic-ink tracking-tight leading-tight">
                    {p.name}
                  </h2>
                  <span className="mt-0.5 text-lg font-black text-comic-ink-soft group-hover:text-comic-rust transition-colors shrink-0">
                    →
                  </span>
                </div>

                {/* Description */}
                {p.description && (
                  <p className="mt-2 text-xs text-comic-ink-soft leading-relaxed line-clamp-2">
                    {p.description}
                  </p>
                )}

                {/* Footer */}
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  {p.website && (
                    <span className="flex items-center gap-1 text-[11px] text-comic-ink-soft min-w-0">
                      <Globe className="h-3 w-3 shrink-0" />
                      <span className="truncate">{p.website.replace(/^https?:\/\//, "")}</span>
                    </span>
                  )}
                  <div className="flex-1" />
                  <span className="rounded-sm border border-comic-ink/20 bg-comic-aged px-1.5 py-0.5 text-[10px] font-bold text-comic-ink uppercase tracking-wide">
                    {p.market}
                  </span>
                </div>
              </Link>

              {/* Action buttons — appear on hover */}
              <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-all group-hover:opacity-100">
                <Link
                  href={`/projects/${p.id}/edit`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-sm p-1.5 text-comic-ink-soft/40 hover:bg-comic-yellow/40 hover:text-comic-ink transition-colors"
                  title="Editar campaña"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                <button
                  onClick={(e) => handleDelete(e, p)}
                  disabled={deleting === p.id}
                  className="rounded-sm p-1.5 text-comic-ink-soft/40 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed transition-colors"
                  title="Eliminar campaña"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
