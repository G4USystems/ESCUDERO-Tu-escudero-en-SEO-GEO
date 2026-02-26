"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { projects } from "@/lib/api";
import { cn } from "@/lib/utils";

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewProjectPage() {
  const router = useRouter();

  // Campaign fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [market, setMarket] = useState("es");
  const [language, setLanguage] = useState("es");

  // Brand fields
  const [brandName, setBrandName] = useState("");

  const [saving, setSaving] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    if (autoSlug) setSlug(toSlug(val));
    if (!brandName) setBrandName(val);
  };

  const handleGenerateDescription = async () => {
    const url = website.trim();
    if (!url) return;
    setGeneratingDesc(true);
    try {
      const { description: generated } = await projects.describeWebsite(url);
      if (generated) setDescription(generated);
    } catch {
      // silently fail — user can type manually
    } finally {
      setGeneratingDesc(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !brandName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let normalizedWebsite = website.trim() || undefined;
      if (normalizedWebsite && !/^https?:\/\//i.test(normalizedWebsite)) {
        normalizedWebsite = `https://${normalizedWebsite}`;
      }

      const derivedDomain = website.trim()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .trim() || undefined;

      const project = await projects.create({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        website: normalizedWebsite,
        market,
        language,
      });

      await projects.createBrand(project.id, {
        name: brandName.trim(),
        domain: derivedDomain,
        is_client: true,
      });

      router.push(`/projects/${project.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear la campaña");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-sm border-2 border-comic-ink/30 bg-comic-paper px-3 py-2 text-sm text-comic-ink placeholder-comic-ink/30 focus:border-comic-ink focus:outline-none transition-colors";
  const labelClass = "mb-1 block text-xs font-black text-comic-ink uppercase tracking-wide";

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Campañas
        </Link>
      </div>

      <h1 className="mb-0.5 text-2xl font-black text-comic-ink tracking-tight">Nueva Campaña</h1>
      <p className="mb-6 text-sm text-comic-ink-soft">Configura la campaña y tu marca en un solo paso.</p>

      <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
        {error && (
          <div className="rounded-sm border-2 border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Block 01 — Campaign */}
        <div className="rounded-sm border-2 border-comic-ink bg-comic-paper p-5 shadow-comic-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-comic-ink/10">
            <span className="rounded-sm bg-comic-ink px-2 py-0.5 text-[10px] font-black text-comic-yellow uppercase tracking-widest">01</span>
            <span className="text-sm font-black text-comic-ink uppercase tracking-wide">La campaña</span>
          </div>

          <div>
            <label className={labelClass}>Nombre de la campaña <span className="text-comic-rust">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ej: Fellow Funders España"
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Website / Domain</label>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="fellowfunders.com"
              className={inputClass}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={cn(labelClass, "mb-0")}>Descripción</label>
              <button
                type="button"
                onClick={handleGenerateDescription}
                disabled={!website.trim() || generatingDesc}
                className="inline-flex items-center gap-1 rounded-sm border border-comic-ink/30 bg-comic-yellow/30 px-2 py-0.5 text-[10px] font-black text-comic-ink uppercase tracking-wide transition-colors hover:bg-comic-yellow disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generatingDesc ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {generatingDesc ? "Generando..." : "Generar con IA"}
              </button>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción breve de la empresa o campaña (opcional)"
              rows={3}
              className={cn(inputClass, "resize-none")}
            />
            {!website.trim() && (
              <p className="mt-1 text-[11px] text-comic-ink-soft">Introduce el website para generar la descripción con IA.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Mercado</label>
              <select value={market} onChange={(e) => setMarket(e.target.value)} className={inputClass}>
                <option value="es">España</option>
                <option value="us">Estados Unidos</option>
                <option value="uk">Reino Unido</option>
                <option value="de">Alemania</option>
                <option value="fr">Francia</option>
                <option value="it">Italia</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Idioma</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
                <option value="es">Español</option>
                <option value="en">Inglés</option>
                <option value="de">Alemán</option>
                <option value="fr">Francés</option>
                <option value="it">Italiano</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Nombre de la marca <span className="text-comic-rust">*</span></label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Ej: Fellow Funders"
              className={inputClass}
              required
            />
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-comic-ink-soft hover:text-comic-ink select-none">Slug (avanzado)</summary>
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setAutoSlug(false); }}
              className={cn(inputClass, "mt-2")}
              placeholder="fellow-funders-espana"
            />
          </details>
        </div>

        <button
          type="submit"
          disabled={saving || !name.trim() || !brandName.trim()}
          className={cn(
            "w-full rounded-sm border-2 border-comic-ink py-2.5 text-sm font-black text-comic-ink shadow-comic-xs transition-all",
            saving || !name.trim() || !brandName.trim()
              ? "bg-comic-aged opacity-50 cursor-not-allowed"
              : "bg-comic-yellow hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          )}
        >
          {saving ? "Creando campaña..." : "Crear campaña →"}
        </button>
      </form>
    </div>
  );
}
