"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useWizardState } from "@/hooks/useWizardState";
import { NicheCard } from "@/components/niche/NicheCard";
import { NicheForm } from "@/components/niche/NicheForm";
import { niches as nichesApi, type Niche } from "@/lib/api";
import { Plus } from "lucide-react";

export default function NichesPage() {
  const params = useParams();
  const id = params.id as string;
  const { project, niches, nicheStats, reload } = useWizardState(id);
  const [showForm, setShowForm] = useState(false);

  if (!project) return null;

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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Fase 2 — Nichos y Competidores</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Crea nichos de mercado y anade competidores a cada uno. Un nicho es un segmento al que quieres llegar (ej: &quot;Empresas Fintech&quot;, &quot;Startups SaaS&quot;).
        </p>
      </div>

      {/* Niche list */}
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

      {/* Empty state */}
      {niches.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aun no tienes nichos. Crea tu primer nicho para empezar.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Crear primer nicho
          </button>
        </div>
      )}

      {/* Add niche form */}
      {showForm ? (
        <NicheForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      ) : (
        niches.length > 0 && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Anadir otro nicho
          </button>
        )
      )}

    </div>
  );
}
