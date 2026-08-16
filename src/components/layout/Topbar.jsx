import React from "react";
import { Globe, Loader2, Menu, Wallet } from "lucide-react";
import { useSyntura } from "../../context/SynturaStore.jsx";
import { BOTCHAIN } from "../../lib/chain.js";
import { cn, shortAddress } from "../../lib/utils.js";

function ModeChip({ liveMode }) {
  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider sm:inline-flex",
        liveMode
          ? "border-emeraldx/40 bg-emeraldx/10 text-emeraldx-soft"
          : "border-amber-500/40 bg-amber-500/10 text-amber-300"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 animate-pulse rounded-full",
          liveMode ? "bg-emeraldx" : "bg-amber-400"
        )}
      />
      {liveMode ? "Live · BOTChain" : "Demo Simulation"}
    </span>
  );
}

function NetworkChip() {
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-300 md:inline-flex">
      <Globe size={13} className="text-electric" />
      {BOTCHAIN.name}
    </span>
  );
}

function WalletControl() {
  const { wallet, connect } = useSyntura();

  if (wallet.address) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-md border border-white/10 bg-white/[0.03] px-3.5 py-2"
        title={wallet.address}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emeraldx opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emeraldx" />
        </span>
        <span className="font-mono text-xs font-semibold text-slate-200">
          {shortAddress(wallet.address)}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={connect}
      disabled={wallet.connecting}
      className="btn-primary"
    >
      {wallet.connecting ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Wallet size={16} />
      )}
      <span>
        {wallet.connecting ? (
          "Connecting…"
        ) : (
          <>
            Connect<span className="hidden sm:inline"> Wallet</span>
          </>
        )}
      </span>
    </button>
  );
}

/** Sticky app header: page title, mode/network chips, wallet connection. */
export default function Topbar({ title, onMenu }) {
  const { liveMode } = useSyntura();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/60 bg-abyss/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700/70 bg-panel/40 text-slate-300 transition-colors hover:border-electric/50 hover:text-white lg:hidden"
        >
          <Menu size={17} />
        </button>

        <h1 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight text-white sm:text-lg">
          {title}
        </h1>

        <div className="flex shrink-0 items-center gap-2.5">
          <ModeChip liveMode={liveMode} />
          <NetworkChip />
          <WalletControl />
        </div>
      </div>
    </header>
  );
}
