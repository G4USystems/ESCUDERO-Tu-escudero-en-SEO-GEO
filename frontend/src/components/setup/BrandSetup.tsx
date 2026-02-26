"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Brand } from "@/lib/api";
import { projects as projectsApi } from "@/lib/api";
import { Building2, Check, Pencil, Loader2, Sparkles } from "lucide-react";

interface BrandSetupProps {
  projectId: string;
  brand?: Brand;
  onSave: (data: { name: string; domain?: string; aliases?: string[] }) => Promise<Brand>;
  onBrandUpdated?: (brand: Brand) => void;
}

export function BrandSetup({ projectId, brand, onSave, onBrandUpdated }: BrandSetupProps) {
  const [editing, setEditing] = useState(!brand);
  const [name, setName] = useState(brand?.name ?? "");
  const [domain, setDomain] = useState(brand?.domain ?? "");
  const [aliasText, setAliasText] = useState(brand?.aliases?.join(", ") ?? "");
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (brandId: string) => {
    setAnalyzing(true);
    try {
      const updated = await projectsApi.analyzeBrand(projectId, brandId);
      onBrandUpdated?.(updated);
    } catch (e) {
      console.error("Analysis failed:", e);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const aliases = aliasText
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const savedBrand = await onSave({
        name: name.trim(),
        domain: domain.trim() || undefined,
        aliases: aliases.length > 0 ? aliases : undefined,
      });
      setEditing(false);
      // Auto-analyze if the brand has a domain
      if (savedBrand?.id && savedBrand.domain && !savedBrand.company_type) {
        handleAnalyze(savedBrand.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!editing && brand) {
    return (
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <Building2 className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <h3 className="font-semibold">{brand.name}</h3>
              <p className="text-sm text-muted-foreground">
                {brand.domain ?? "Sin dominio"}
                {brand.aliases && brand.aliases.length > 0 && (
                  <span> &middot; Aliases: {brand.aliases.join(", ")}</span>
                )}
              </p>
              {analyzing ? (
                <span className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Analizando empresa...
                </span>
              ) : brand.company_type ? (
                <span className="inline-block mt-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700">
                  {brand.company_type}
                </span>
              ) : brand.domain ? (
                <button
                  onClick={() => handleAnalyze(brand.id)}
                  className="flex items-center gap-1 mt-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700 hover:bg-amber-100"
                >
                  <Sparkles className="h-3 w-3" />
                  Analizar empresa
                </button>
              ) : null}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Tu marca</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Define tu marca para que podamos rastrear donde apareces frente a tus competidores.
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">
          Nombre de la marca <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Growth4U"
          className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Dominio <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="Ej: growth4u.io"
          className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Analizaremos tu web para entender tu tipo de empresa y generar keywords/prompts correctos.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Aliases (separados por coma)</label>
        <input
          type="text"
          value={aliasText}
          onChange={(e) => setAliasText(e.target.value)}
          placeholder="Ej: Growth 4 U, Growth4u"
          className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Nombres alternativos con los que buscaremos menciones de tu marca.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !domain.trim()}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
            saving || !name.trim() || !domain.trim()
              ? "bg-primary/50 cursor-not-allowed"
              : "bg-primary hover:bg-primary/90"
          )}
        >
          <Check className="h-3.5 w-3.5" />
          {saving ? "Guardando..." : "Guardar marca"}
        </button>
        {brand && (
          <button
            onClick={() => {
              setName(brand.name);
              setDomain(brand.domain ?? "");
              setAliasText(brand.aliases?.join(", ") ?? "");
              setEditing(false);
            }}
            className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
