import React from "react";
import { Menu } from "lucide-react";

/** Sticky app header: hamburger (mobile) + page title. Wallet lives in the sidebar. */
export default function Topbar({ title, onMenu }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/60 bg-abyss/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:border-electric/50 hover:text-white lg:hidden"
        >
          <Menu size={17} />
        </button>

        <h1 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight text-white sm:text-lg">
          {title}
        </h1>
      </div>
    </header>
  );
}
