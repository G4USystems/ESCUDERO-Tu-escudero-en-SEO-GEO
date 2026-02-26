"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Target, Handshake, Zap, FileText, Users, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { projects as projectsApi, niches as nichesApi, type Project, type Niche } from "@/lib/api";

const NAV_ITEMS = [
  { id: "campanas",     label: "Campañas",       icon: LayoutGrid },
  { id: "nichos",       label: "Nichos",          icon: Target },
  { id: "partnerships", label: "Partnerships",    icon: Handshake },
  { id: "dominar",      label: "Dominar SEO/GEO", icon: Zap },
  { id: "influencers",  label: "Influencers",     icon: Users },
  { id: "articulos",    label: "Artículos",       icon: FileText },
] as const;

// Items that require a niche slug to navigate — their suffix in the URL
const NICHE_SUFFIX: Partial<Record<typeof NAV_ITEMS[number]["id"], string>> = {
  partnerships: "results",
  dominar:      "dominar",
  influencers:  "influencers",
};

type PickerState = {
  target: string;           // url suffix: "results" | "dominar" | "influencers"
  projects: Project[];
  selectedProjectId: string | null;
  niches: Niche[];
  loading: boolean;
};

export function AppSidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  const projectMatch = pathname.match(/\/projects\/([^/]+)/);
  const projectId    = projectMatch?.[1];
  const nicheMatch   = pathname.match(/\/niches\/([^/]+)/);
  const nicheSlug    = nicheMatch?.[1];

  const [picker, setPicker] = useState<PickerState | null>(null);

  // ── Navigation links ───────────────────────────────────────────────
  const links: Record<string, { href: string; active: boolean; disabled: boolean }> = {
    campanas: {
      href:     "/",
      active:   pathname === "/",
      disabled: false,
    },
    nichos: {
      href: projectId ? `/projects/${projectId}` : "/",
      active: !!projectId
        && !pathname.includes("/results")
        && !pathname.includes("/dominar")
        && !pathname.includes("/analyze")
        && !pathname.includes("/influencers")
        && !pathname.includes("/articles"),
      disabled: !projectId,
    },
    partnerships: {
      href:     projectId && nicheSlug ? `/projects/${projectId}/niches/${nicheSlug}/results` : "#",
      active:   pathname.includes("/results") || pathname.includes("/analyze"),
      disabled: false, // always clickable — picker opens when no niche
    },
    dominar: {
      href:     projectId && nicheSlug ? `/projects/${projectId}/niches/${nicheSlug}/dominar` : "#",
      active:   pathname.includes("/dominar"),
      disabled: false,
    },
    influencers: {
      href:     projectId && nicheSlug ? `/projects/${projectId}/niches/${nicheSlug}/influencers` : "#",
      active:   pathname.includes("/influencers"),
      disabled: false,
    },
    articulos: {
      href:     projectId ? `/projects/${projectId}/articles` : "#",
      active:   pathname.includes("/articles"),
      disabled: !projectId,
    },
  };

  // ── Picker helpers ─────────────────────────────────────────────────
  const openPicker = async (suffix: string) => {
    const base: PickerState = {
      target:            suffix,
      projects:          [],
      selectedProjectId: null,
      niches:            [],
      loading:           true,
    };
    setPicker(base);

    if (projectId) {
      // Already inside a project — jump straight to niche selection
      const nList = await nichesApi.list(projectId).catch(() => [] as Niche[]);
      setPicker((p) => p ? { ...p, selectedProjectId: projectId, niches: nList, loading: false } : null);
    } else {
      const pList = await projectsApi.list().catch(() => [] as Project[]);
      setPicker((p) => p ? { ...p, projects: pList, loading: false } : null);
    }
  };

  const selectProject = async (pid: string) => {
    setPicker((p) => p ? { ...p, selectedProjectId: pid, loading: true } : null);
    const nList = await nichesApi.list(pid).catch(() => [] as Niche[]);
    setPicker((p) => p ? { ...p, niches: nList, loading: false } : null);
  };

  const selectNiche = (slug: string) => {
    if (!picker) return;
    const pid = picker.selectedProjectId ?? projectId;
    if (!pid) return;
    router.push(`/projects/${pid}/niches/${slug}/${picker.target}`);
    setPicker(null);
  };

  const closePicker = () => setPicker(null);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <aside className="w-48 shrink-0 h-screen sticky top-0 border-r border-slate-200 bg-white flex flex-col overflow-y-auto">
        {/* Brand */}
        <div className="h-14 shrink-0 flex items-center px-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-comic-rust flex items-center justify-center shrink-0">
              <span className="text-xs font-black text-white">S</span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 leading-tight">SanchoCMO</div>
              <div className="text-[10px] font-semibold text-comic-rust leading-tight tracking-wide">
                SEO+GEO Claw
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const link       = links[item.id];
            const suffix     = NICHE_SUFFIX[item.id];
            const needsPicker = suffix && !nicheSlug; // niche-required item, no niche in URL

            const baseClass = cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors w-full text-left",
              link.active
                ? "bg-slate-900 text-white font-semibold"
                : link.disabled
                  ? "text-slate-300 cursor-not-allowed pointer-events-none"
                  : needsPicker
                    ? "text-slate-400 font-medium hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                    : "text-slate-600 font-medium hover:bg-slate-100 hover:text-slate-900"
            );

            if (needsPicker) {
              return (
                <button
                  key={item.id}
                  onClick={() => openPicker(suffix)}
                  className={baseClass}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            }

            return (
              <Link
                key={item.id}
                href={link.disabled ? "#" : link.href}
                className={baseClass}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100">
          <p className="text-[10px] text-slate-300 font-medium uppercase tracking-wider">
            v0.1 alpha
          </p>
        </div>
      </aside>

      {/* ── Picker modal ── */}
      {picker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closePicker}
        >
          <div
            className="bg-comic-paper rounded-sm border-2 border-comic-ink shadow-comic w-80 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-comic-ink bg-comic-aged/40">
              <h2 className="text-sm font-black text-comic-ink">
                {picker.selectedProjectId || projectId ? "Selecciona nicho" : "Selecciona campaña y nicho"}
              </h2>
              <button onClick={closePicker} className="rounded-sm p-0.5 hover:bg-comic-aged transition-colors">
                <X className="h-4 w-4 text-comic-ink-soft" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {picker.loading && (
                <p className="text-center text-sm text-comic-ink-soft py-4">Cargando…</p>
              )}

              {/* Step 1 — Project selection */}
              {!picker.loading && !picker.selectedProjectId && !projectId && picker.projects.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-comic-ink-soft uppercase tracking-widest">Campaña</p>
                  {picker.projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectProject(p.id)}
                      className="w-full flex items-center justify-between rounded-sm border border-comic-ink/20 bg-white px-3 py-2 text-sm font-semibold text-comic-ink hover:border-comic-ink hover:bg-comic-aged/40 transition-colors"
                    >
                      <span className="truncate">{p.name}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-comic-ink-soft shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2 — Niche selection */}
              {!picker.loading && (picker.selectedProjectId || projectId) && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-comic-ink-soft uppercase tracking-widest">Nicho</p>
                  {picker.niches.length === 0 && (
                    <p className="text-sm text-comic-ink-soft text-center py-2">Sin nichos configurados.</p>
                  )}
                  {picker.niches.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => selectNiche(n.slug)}
                      className="w-full flex items-center justify-between rounded-sm border border-comic-ink/20 bg-white px-3 py-2 text-sm font-semibold text-comic-ink hover:border-comic-ink hover:bg-comic-aged/40 transition-colors"
                    >
                      <span className="truncate">{n.name}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-comic-ink-soft shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
