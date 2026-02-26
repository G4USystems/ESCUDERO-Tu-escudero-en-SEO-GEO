"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { projects } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function EditProjectPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [market, setMarket] = useState("es");
  const [language, setLanguage] = useState("es");
  const [brandName, setBrandName] = useState("");
  const [brandId, setBrandId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    projects.get(id).then((project) => {
      setName(project.name);
      setWebsite(project.website?.replace(/^https?:\/\//, "") ?? "");
      setDescription(project.description ?? "");
      setMarket(project.market ?? "es");
      setLanguage(project.language ?? "es");
      const client = project.brands?.find((b) => b.is_client);
      if (client) {
        setBrandName(client.name);
        setBrandId(client.id);
      }
    }).finally(() => setLoading(false));
  }, [id]);

  const handleGenerateDescription = async () => {
    const url = website.trim();
    if (!url) return;
    setGeneratingDesc(true);
    try {
      const { description: generated } = await projects.describeWebsite(
        url.startsWith("http") ? url : `https://${url}`
      );
      if (generated) setDescription(generated);
    } catch {
      // silently fail
    } finally {
      setGeneratingDesc(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let normalizedWebsite = website.trim() || undefined;
      if (normalizedWebsite && !/^https?:\/\//i.test(normalizedWebsite)) {
        normalizedWebsite = `https://${normalizedWebsite}`;
      }

      await projects.update(id, {
        name: name.trim(),
        description: description.trim() || undefined,
        website: normalizedWebsite,
        market,
        language,
      });

      if (brandId && brandName.trim()) {
        const domain = website.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim() || undefined;
        await projects.updateBrand(id, brandId, { name: brandName.trim(), domain });
      }

      router.push(`/projects/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-sm border-2 border-comic-ink/30 bg-comic-paper px-3 py-2 text-sm text-comic-ink placeholder-comic-ink/30 focus:border-comic-ink focus:outline-none transition-colors";
  const labelClass = "mb-1 block text-xs font-black text-comic-ink uppercase tracking-wide";

  if (loading) {
    return <div className="py-20 text-center text-sm text-comic-ink-soft">Cargando campaña...</div>;
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/projects/${id}`}
          className="inline-flex items-center gap-1 text-sm text-comic-ink-soft hover:text-comic-rust transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a la campaña
        </Link>
      </div>

      <h1 className="mb-0.5 text-2xl font-black text-comic-ink tracking-tight">Editar campaña</h1>
      <p className="mb-6 text-sm text-comic-ink-soft">Corrige el nombre, website, descripción, mercado o idioma.</p>

      <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
        {error && (
          <div className="rounded-sm border-2 border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

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
              onChange={(e) => setName(e.target.value)}
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
                {generatingDesc ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {generatingDesc ? "Generando..." : "Regenerar con IA"}
              </button>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={cn(inputClass, "resize-none")}
            />
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

          {brandId && (
            <div>
              <label className={labelClass}>Nombre de la marca</label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className={cn(
              "flex-1 rounded-sm border-2 border-comic-ink py-2.5 text-sm font-black text-comic-ink shadow-comic-xs transition-all",
              saving || !name.trim()
                ? "bg-comic-aged opacity-50 cursor-not-allowed"
                : "bg-comic-yellow hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            )}
          >
            {saving ? "Guardando..." : "Guardar cambios →"}
          </button>
          <Link
            href={`/projects/${id}`}
            className="rounded-sm border-2 border-comic-ink/30 px-4 py-2.5 text-sm font-bold text-comic-ink-soft hover:border-comic-ink hover:text-comic-ink transition-colors"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
