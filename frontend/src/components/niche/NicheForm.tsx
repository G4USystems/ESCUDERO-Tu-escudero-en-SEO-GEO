"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface NicheFormProps {
  onSubmit: (data: { name: string; slug: string; description?: string }) => Promise<void>;
  onCancel?: () => void;
}

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function NicheForm({ onSubmit, onCancel }: NicheFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        slug: toSlug(name),
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear nicho");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
      <h4 className="text-sm font-semibold">Nuevo nicho</h4>
      <p className="text-xs text-muted-foreground">
        Un nicho es un segmento de mercado al que quieres llegar. Ej: &quot;Empresas Fintech&quot;, &quot;Startups SaaS&quot;
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium">
          Nombre <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Empresas Fintech"
          className="w-full rounded-md border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          required
          autoFocus
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium">Descripcion (opcional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe brevemente este nicho..."
          className="w-full rounded-md border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors",
            saving ? "bg-primary/50 cursor-not-allowed" : "bg-primary hover:bg-primary/90"
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          {saving ? "Creando..." : "Crear nicho"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
