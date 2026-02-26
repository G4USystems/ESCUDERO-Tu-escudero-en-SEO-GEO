"use client";

import { User } from "lucide-react";

export function AppTopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b border-slate-200 bg-white px-8">
      <div
        className="h-8 w-8 rounded-full bg-slate-900 flex items-center justify-center cursor-pointer hover:bg-slate-700 transition-colors"
        title="Admin"
      >
        <User className="h-4 w-4 text-white" />
      </div>
    </header>
  );
}
