import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  ChevronRight,
  Hexagon,
  LayoutDashboard,
  FilePlus2,
  BrainCircuit,
  Loader2,
  Vault,
  ScrollText,
  Wallet,
  X,
} from "lucide-react";
import { cn, shortAddress } from "../../lib/utils.js";
import { BOTCHAIN, explorerAddressUrl } from "../../lib/chain.js";
import { useSyntura } from "../../context/SynturaStore.jsx";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "mint", label: "Mint RWA Invoice", icon: FilePlus2 },
  { key: "underwriter", label: "AI Risk Underwriter", icon: BrainCircuit },
  { key: "vaults", label: "Liquidity Vaults", icon: Vault },
  { key: "audit", label: "Onchain Audit Log", icon: ScrollText },
];

function Brand({ onClick, collapsed }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Back to landing page"
      aria-label="Back to landing page"
      className={cn(
        "group flex items-center gap-3 rounded-lg py-1 text-left transition-colors hover:bg-white/[0.03]",
        collapsed ? "justify-center px-0" : "px-2"
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] transition-colors group-hover:border-electric/40">
        <Hexagon size={20} className="text-electric" strokeWidth={2.25} />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="text-lg font-extrabold leading-tight tracking-tight text-white">
            Syntura
          </p>
          <p className="font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-slate-500">
            AI × RWA Protocol
          </p>
        </div>
      )}
    </button>
  );
}

/** Chevron toggle for the desktop rail - points right when collapsed. */
function CollapseToggle({ collapsed, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={collapsed ? "Expand menu" : "Collapse menu"}
      aria-label={collapsed ? "Expand menu" : "Collapse menu"}
      aria-expanded={!collapsed}
      className={cn(
        "mt-4 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-400 transition-colors hover:border-electric/40 hover:text-white",
        collapsed ? "mx-auto" : "ml-auto mr-1"
      )}
    >
      <ChevronRight
        size={15}
        className={cn("transition-transform duration-300", !collapsed && "rotate-180")}
      />
    </button>
  );
}

function NavList({ active, onNavigate, variant, collapsed = false }) {
  return (
    <nav className="mt-6 flex flex-col gap-1.5" aria-label="Primary">
      {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onNavigate(key)}
            aria-current={isActive ? "page" : undefined}
            title={collapsed ? label : undefined}
            className={cn(
              "relative flex items-center rounded-md text-left font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors duration-200",
              collapsed
                ? "mx-auto h-11 w-11 justify-center"
                : "w-full gap-3 px-3.5 py-2.5",
              isActive
                ? "text-white"
                : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-300"
            )}
          >
            {isActive && (
              <motion.span
                // Distinct layoutId per variant - desktop + mobile mount together.
                layoutId={`nav-active-${variant}`}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                className="absolute inset-0 rounded-md border border-electric/40 bg-electric/[0.06]"
              />
            )}
            <Icon
              size={collapsed ? 18 : 16}
              className={cn(
                "relative z-10 shrink-0",
                isActive ? "text-electric" : "text-slate-600"
              )}
            />
            {!collapsed && <span className="relative z-10">{label}</span>}
          </button>
        );
      })}
    </nav>
  );
}

/** Collapsed-rail wallet control: a status dot. Connects, or expands to the full card. */
function WalletDot({ onExpand }) {
  const { wallet, connect } = useSyntura();
  const connected = Boolean(wallet.address);
  return (
    <button
      type="button"
      onClick={connected ? onExpand : connect}
      title={
        connected
          ? `${shortAddress(wallet.address)} · ${wallet.balanceBOT === null ? "…" : wallet.balanceBOT.toFixed(4)} BOT - expand for details`
          : "Connect Wallet"
      }
      aria-label={connected ? "Wallet connected - expand menu" : "Connect Wallet"}
      className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-panel/40 transition-colors hover:border-electric/40"
    >
      {wallet.connecting ? (
        <Loader2 size={14} className="animate-spin text-slate-400" />
      ) : (
        <span className="relative flex h-2.5 w-2.5">
          {connected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emeraldx opacity-60" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2.5 w-2.5 rounded-full",
              connected ? "bg-emeraldx" : "bg-slate-600"
            )}
          />
        </span>
      )}
    </button>
  );
}

/** Wallet identity card anchored at the bottom of the nav rail. */
function WalletCard() {
  const { wallet, connect, disconnect } = useSyntura();

  if (!wallet.address) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-panel/40 p-3.5">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Not connected
          </p>
        </div>
        <button
          type="button"
          onClick={connect}
          disabled={wallet.connecting}
          className="btn-primary w-full !py-2"
        >
          {wallet.connecting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Wallet size={14} />
          )}
          {wallet.connecting ? "Connecting…" : "Connect Wallet"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-electric/25 bg-panel/40 p-4">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emeraldx opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emeraldx" />
        </span>
        <p className="truncate text-[13px] font-medium text-slate-300">
          Connected to {BOTCHAIN.name}
        </p>
      </div>
      <p className="mt-1.5 font-mono text-sm text-slate-400" title={wallet.address}>
        {shortAddress(wallet.address)}
      </p>
      <p className="mt-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600">
        Balance
      </p>
      <p className="mt-0.5 font-mono text-xl font-bold text-emeraldx-soft">
        {wallet.balanceBOT === null ? "-" : wallet.balanceBOT.toFixed(4)}{" "}
        <span className="text-xs font-semibold text-slate-500">BOT</span>
      </p>
      <a
        href={explorerAddressUrl(wallet.address)}
        target="_blank"
        rel="noreferrer"
        className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-2 text-[13px] font-medium text-slate-300 transition-colors hover:border-white/25 hover:text-white"
      >
        View on Botscan <ArrowUpRight size={13} />
      </a>
      <button
        type="button"
        onClick={disconnect}
        className="mt-1.5 w-full py-1.5 text-center text-[13px] text-slate-500 transition-colors hover:text-slate-300"
      >
        Disconnect
      </button>
    </div>
  );
}

function NetworkFooter({ collapsed = false, onExpand }) {
  if (collapsed) {
    return (
      <div className="mt-auto pt-8">
        <WalletDot onExpand={onExpand} />
      </div>
    );
  }
  return (
    <div className="mt-auto space-y-3 pt-8">
      <WalletCard />
      <p className="px-2 text-[10px] leading-relaxed text-slate-600">
        Syntura Protocol · Apache-2.0 License
      </p>
    </div>
  );
}

/**
 * App navigation rail. Fixed on desktop (w-64, collapsible to a w-[76px]
 * icon rail via `collapsed` / `onToggleCollapse`); slide-over with backdrop
 * on mobile (controlled via `open` / `onClose`).
 */
export default function Sidebar({
  active,
  onNavigate,
  open,
  onClose,
  onBrand,
  collapsed = false,
  onToggleCollapse,
}) {
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
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-800/60 bg-abyss/70 py-6 backdrop-blur-xl transition-[width,padding] duration-300 lg:flex",
          collapsed ? "w-[76px] px-3" : "w-64 px-4"
        )}
      >
        <Brand onClick={onBrand} collapsed={collapsed} />
        <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} />
        <NavList
          active={active}
          onNavigate={onNavigate}
          variant="desktop"
          collapsed={collapsed}
        />
        <NetworkFooter collapsed={collapsed} onExpand={onToggleCollapse} />
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
