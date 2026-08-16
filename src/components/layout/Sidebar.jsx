import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Hexagon,
  LayoutDashboard,
  FilePlus2,
  BrainCircuit,
  Vault,
  ScrollText,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils.js";
import { BOTCHAIN } from "../../lib/chain.js";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "mint", label: "Mint RWA Invoice", icon: FilePlus2 },
  { key: "underwriter", label: "AI Risk Underwriter", icon: BrainCircuit },
  { key: "vaults", label: "Liquidity Vaults", icon: Vault },
  { key: "audit", label: "On-Chain Audit Log", icon: ScrollText },
];

function Brand({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Back to landing page"
      aria-label="Back to landing page"
      className="group flex items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-white/[0.03]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] transition-colors group-hover:border-electric/40">
        <Hexagon size={20} className="text-electric" strokeWidth={2.25} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-extrabold leading-tight tracking-tight text-white">
          Syntura
        </p>
        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-slate-500">
          AI × RWA Protocol
        </p>
      </div>
    </button>
  );
}

function NavList({ active, onNavigate, variant }) {
  return (
    <nav className="mt-8 flex flex-col gap-1.5" aria-label="Primary">
      {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onNavigate(key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex w-full items-center gap-3 rounded-md px-3.5 py-2.5 text-left font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors duration-200",
              isActive
                ? "text-white"
                : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-300"
            )}
          >
            {isActive && (
              <motion.span
                // Distinct layoutId per variant — desktop + mobile mount together.
                layoutId={`nav-active-${variant}`}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                className="absolute inset-0 rounded-md border border-electric/40 bg-electric/[0.06]"
              />
            )}
            <Icon
              size={16}
              className={cn(
                "relative z-10 shrink-0",
                isActive ? "text-electric" : "text-slate-600"
              )}
            />
            <span className="relative z-10">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function NetworkFooter() {
  return (
    <div className="mt-auto space-y-3 pt-8">
      <div className="glass-inset flex items-center gap-3 px-3.5 py-3">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emeraldx opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emeraldx" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] font-semibold text-slate-200">
            {BOTCHAIN.name}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
            Network operational
          </p>
        </div>
      </div>
      <p className="px-2 text-[10px] leading-relaxed text-slate-600">
        Syntura Protocol · Apache-2.0 License
      </p>
    </div>
  );
}

/**
 * App navigation rail. Fixed w-64 on desktop; slide-over with backdrop on
 * mobile (controlled via `open` / `onClose`).
 */
export default function Sidebar({ active, onNavigate, open, onClose, onBrand }) {
  // Escape closes the mobile slide-over.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while the slide-over is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-800/60 bg-abyss/70 px-4 py-6 backdrop-blur-xl lg:flex">
        <Brand onClick={onBrand} />
        <NavList active={active} onNavigate={onNavigate} variant="desktop" />
        <NetworkFooter />
      </aside>

      {/* Mobile slide-over */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="fixed inset-0 z-40 bg-abyss/70 backdrop-blur-sm lg:hidden"
              aria-hidden="true"
            />
            <motion.aside
              key="sidebar-panel"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.26, ease: "easeOut" }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-slate-800/60 bg-abyss/95 px-4 py-6 backdrop-blur-xl scrollbar-thin lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <div className="flex items-center justify-between">
                <Brand onClick={onBrand} />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close navigation"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/70 bg-panel/40 text-slate-400 transition-colors hover:border-electric/50 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
              <NavList active={active} onNavigate={onNavigate} variant="mobile" />
              <NetworkFooter />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
