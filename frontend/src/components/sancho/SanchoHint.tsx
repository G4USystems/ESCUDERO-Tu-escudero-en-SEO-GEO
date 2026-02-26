"use client";

interface SanchoHintProps {
  message?: string;
}

const DEFAULT_MSG = "Pega el texto de tu web o empresa y te extraigo los datos para rellenar los campos.";

export function SanchoHint({ message = DEFAULT_MSG }: SanchoHintProps) {
  const openSancho = () => {
    window.dispatchEvent(
      new CustomEvent("sancho:open", { detail: { message } })
    );
  };

  return (
    <button
      type="button"
      onClick={openSancho}
      className="w-full text-left flex items-start gap-2 rounded-sm border border-comic-ink/20 bg-comic-yellow/10 px-3 py-2 transition-colors hover:bg-comic-yellow/30 hover:border-comic-ink/40"
    >
      <span className="text-sm shrink-0">🗝️</span>
      <div>
        <p className="text-[11px] font-black text-comic-ink leading-none mb-0.5">Sancho puede ayudarte</p>
        <p className="text-[11px] text-comic-ink-soft leading-snug">
          Si necesitas completar los campos de manera rápida, yo puedo ayudarte. Toca aquí.
        </p>
      </div>
    </button>
  );
}
