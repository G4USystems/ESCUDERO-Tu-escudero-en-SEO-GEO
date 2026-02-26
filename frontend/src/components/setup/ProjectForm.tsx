"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ProjectFormProps {
  initial?: {
    name?: string;
    slug?: string;
    description?: string;
    website?: string;
    market?: string;
    language?: string;
  };
  onSubmit: (data: {
    name: string;
    slug: string;
    description?: string;
    website?: string;
    market: string;
    language: string;
  }) => Promise<void>;
  submitLabel?: string;
}

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ProjectForm({ initial, onSubmit, submitLabel = "Guardar" }: ProjectFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [market, setMarket] = useState(initial?.market ?? "es");
  const [language, setLanguage] = useState(initial?.language ?? "es");
  const [autoSlug, setAutoSlug] = useState(!initial?.slug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    if (autoSlug) setSlug(toSlug(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Normalize website: add https:// if missing
      let normalizedWebsite = website.trim() || undefined;
      if (normalizedWebsite && !/^https?:\/\//i.test(normalizedWebsite)) {
        normalizedWebsite = `https://${normalizedWebsite}`;
      }
      await onSubmit({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        website: normalizedWebsite,
        market,
        language,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">
          Nombre de la campaña <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Ej: Growth4U España"
          className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Slug</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setAutoSlug(false);
          }}
          className="w-full rounded-md border px-3 py-2 text-sm text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Website</label>
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="ejemplo.com"
          className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Descripcion</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe brevemente tu campaña..."
          rows={2}
          className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Mercado</label>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="es">Espana</option>
            <option value="us">Estados Unidos</option>
            <option value="uk">Reino Unido</option>
            <option value="de">Alemania</option>
            <option value="fr">Francia</option>
            <option value="it">Italia</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Idioma</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="es">Espanol</option>
            <option value="en">Ingles</option>
            <option value="de">Aleman</option>
            <option value="fr">Frances</option>
            <option value="it">Italiano</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving || !name.trim()}
        className={cn(
          "rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
          saving ? "bg-primary/50 cursor-not-allowed" : "bg-primary hover:bg-primary/90"
        )}
      >
        {saving ? "Guardando..." : submitLabel}
      </button>
    </form>
  );
}
