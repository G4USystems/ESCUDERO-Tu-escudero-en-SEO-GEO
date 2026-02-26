"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { sancho as sanchoApi } from "@/lib/api";
import { X, Send, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const WELCOME: Message = {
  role: "assistant",
  content: "¡Buenas! Soy Sancho, tu guía en esta campaña. ¿En qué puedo ayudarte? Puedes preguntarme qué hacer en cada paso, o pegar el texto de una web y te digo cómo rellenar los campos.",
};

interface SanchoBotProps {
  projectId?: string;
}

export function SanchoBot({ projectId }: SanchoBotProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Listen for global open events (from SanchoHint components in forms)
  useEffect(() => {
    const handler = (e: Event) => {
      const customE = e as CustomEvent<{ message?: string }>;
      setOpen(true);
      if (customE.detail?.message) {
        setInput(customE.detail.message);
      }
    };
    window.addEventListener("sancho:open", handler);
    return () => window.removeEventListener("sancho:open", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        inputRef.current?.focus();
      }, 50);
    }
  }, [open, messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const currentPage = projectId
        ? pathname.replace(`/projects/${projectId}/`, "") || "hub"
        : pathname;
      const { reply } = projectId
        ? await sanchoApi.chat(projectId, newMessages, currentPage)
        : await sanchoApi.chatGeneral(newMessages, currentPage);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Hubo un error al procesar tu mensaje. Inténtalo de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, projectId, pathname]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating round button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir Sancho"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border-2 border-comic-ink bg-comic-yellow text-2xl shadow-comic-sm transition-all hover:scale-105 hover:shadow-comic-md"
        >
          🗝️
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col w-80 max-h-[520px] rounded-sm border-2 border-comic-ink bg-comic-paper shadow-comic-md overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 bg-comic-ink px-3 py-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">🗝️</span>
              <div>
                <p className="text-[11px] font-black text-comic-yellow uppercase tracking-widest leading-none">Sancho</p>
                <p className="text-[9px] text-white/60 leading-none mt-0.5">Asistente IA · Siempre a tu servicio</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white transition-colors" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && <span className="text-sm mr-1.5 mt-0.5 shrink-0">🗝️</span>}
                <div className={`max-w-[85%] rounded-sm px-3 py-2 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-comic-ink text-white rounded-br-none"
                    : "bg-comic-aged/60 border border-comic-ink/10 text-comic-ink rounded-bl-none"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start items-center gap-2 text-xs text-comic-ink-soft">
                <span className="text-sm">🗝️</span>
                <div className="flex items-center gap-1.5 bg-comic-aged/60 border border-comic-ink/10 rounded-sm px-3 py-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Sancho está pensando...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t-2 border-comic-ink/20 p-2 shrink-0 bg-white">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pregunta o pega texto de una web..."
                rows={2}
                className="flex-1 resize-none rounded-sm border border-comic-ink/30 bg-comic-paper px-2.5 py-1.5 text-xs text-comic-ink placeholder-comic-ink-soft focus:border-comic-ink focus:outline-none"
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-comic-ink bg-comic-yellow text-comic-ink transition-all hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed shadow-comic-xs"
                aria-label="Enviar"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1 text-[9px] text-comic-ink-soft text-center">Enter envía · Shift+Enter nueva línea</p>
          </div>
        </div>
      )}
    </>
  );
}
