"use client";

import { useParams, useRouter } from "next/navigation";
import { useWizardState } from "@/hooks/useWizardState";
import { ProjectForm } from "@/components/setup/ProjectForm";
import { BrandSetup } from "@/components/setup/BrandSetup";
import { projects, type Brand } from "@/lib/api";
import { ArrowRight } from "lucide-react";

export default function SetupPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { project, reload, hasClientBrand } = useWizardState(id);

  if (!project) return null;

  const clientBrand = project.brands.find((b) => b.is_client);

  const handleProjectUpdate = async (data: {
    name: string;
    slug: string;
    description?: string;
    website?: string;
    market: string;
    language: string;
  }) => {
    await projects.update(id, {
      name: data.name,
      description: data.description,
      website: data.website,
      market: data.market,
      language: data.language,
    });
    await reload();
  };

  const handleBrandSave = async (data: {
    name: string;
    domain?: string;
    aliases?: string[];
  }): Promise<Brand> => {
    if (clientBrand) {
      await projects.deleteBrand(id, clientBrand.id);
    }
    const brand = await projects.createBrand(id, { ...data, is_client: true });
    await reload();
    return brand;
  };

  const handleBrandUpdated = (updated: Brand) => {
    // Reload to pick up the analysis results
    reload();
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Fase 1 — Tu campaña</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configura los datos basicos de tu campaña y define tu marca.
        </p>
      </div>

      {/* Project settings */}
      <section>
        <h3 className="mb-3 font-medium">Datos de la campaña</h3>
        <div className="max-w-lg">
          <ProjectForm
            initial={{
              name: project.name,
              slug: project.slug,
              description: project.description ?? undefined,
              website: project.website ?? undefined,
              market: project.market,
              language: project.language,
            }}
            onSubmit={handleProjectUpdate}
            submitLabel="Actualizar campaña"
          />
        </div>
      </section>

      {/* Brand setup */}
      <section>
        <h3 className="mb-3 font-medium">Tu marca</h3>
        <div className="max-w-lg">
          <BrandSetup
            projectId={id}
            brand={clientBrand}
            onSave={handleBrandSave}
            onBrandUpdated={handleBrandUpdated}
          />
        </div>
      </section>

      {/* Next step */}
      {hasClientBrand && (
        <div className="flex justify-end">
          <button
            onClick={() => router.push(`/projects/${id}/niches`)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            Siguiente: Nichos y Competidores
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
