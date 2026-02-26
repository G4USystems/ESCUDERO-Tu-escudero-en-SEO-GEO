"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useWizardState } from "@/hooks/useWizardState";
import { NicheCard } from "@/components/niche/NicheCard";
import { NicheForm } from "@/components/niche/NicheForm";
import { WizardNextStep } from "@/components/wizard/WizardNextStep";
import { niches as nichesApi, type Niche } from "@/lib/api";
import { Plus } from "lucide-react";

export default function ProjectHub() {
  const params = useParams();
  const id = params.id as string;
  const { project, phases, niches, nicheStats, reload, hasClientBrand, hasNiches, hasCompetitors, loading } = useWizardState(id);
  const [showForm, setShowForm] = useState(false);

  if (!project || loading) return null;

  const handleCreate = async (data: { name: string; slug: string; description?: string }) => {
    await nichesApi.create(id, data);
    await reload();
    setShowForm(false);
  };

  const handleDelete = async (niche: Niche) => {
    if (!confirm(`Eliminar el nicho "${niche.name}"? Se perderan sus competidores vinculados.`)) return;
    await nichesApi.delete(id, niche.slug);
    await reload();
  };

  return (
    <div className="space-y-4">
      {/* Wizard guide — next step */}
      <WizardNextStep
        projectId={id}
        phases={phases}
        niches={niches}
        nicheStats={nicheStats}
        hasClientBrand={hasClientBrand}
        hasNiches={hasNiches}
        hasCompetitors={hasCompetitors}
        onCreateNiche={() => setShowForm(true)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-comic-ink uppercase tracking-wide">Tus nichos</h2>
          <p className="text-xs text-comic-ink-soft mt-0.5">Define los mercados que atacas y los competidores de cada uno.</p>
        </div>
        {niches.length > 0 && !showForm && hasClientBrand && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir nicho
          </button>
        )}
      </div>

      {/* Empty state */}
      {niches.length === 0 && !showForm && (
        <div className="rounded-sm border-2 border-dashed border-comic-ink/30 p-8 text-center">
          <p className="text-sm text-comic-ink-soft">
            {!hasClientBrand
              ? "Primero configura tu marca en la fase de setup."
              : "Aún no tienes nichos. Crea tu primer nicho para empezar."}
          </p>
          {hasClientBrand && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-sm border-2 border-comic-ink bg-comic-yellow px-4 py-2 text-sm font-bold text-comic-ink shadow-comic-xs hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            >
              <Plus className="h-4 w-4" />
              Crear primer nicho
            </button>
          )}
        </div>
      )}

      {/* Niche grid */}
      {niches.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {niches.map((n) => (
            <NicheCard
              key={n.id}
              niche={n}
              projectId={id}
              stats={nicheStats[n.slug]}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Add niche form */}
      {showForm && (
        <NicheForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      )}
    </div>
  );
}
