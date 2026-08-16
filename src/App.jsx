import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./components/layout/Sidebar.jsx";
import Topbar from "./components/layout/Topbar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import MintInvoice from "./pages/MintInvoice.jsx";
import RiskUnderwriter from "./pages/RiskUnderwriter.jsx";
import LiquidityVaults from "./pages/LiquidityVaults.jsx";
import AuditLog from "./pages/AuditLog.jsx";
import Landing from "./pages/Landing.jsx";
import { useSyntura } from "./context/SynturaStore.jsx";

/** Page registry — keys are the canonical route ids shared with the Sidebar. */
const PAGES = {
  dashboard: { title: "Dashboard", Component: Dashboard },
  mint: { title: "Mint RWA Invoice", Component: MintInvoice },
  underwriter: { title: "AI Risk Underwriter", Component: RiskUnderwriter },
  vaults: { title: "Liquidity Vaults", Component: LiquidityVaults },
  audit: { title: "On-Chain Audit Log", Component: AuditLog },
};

/** Slim strip under the topbar surfacing wallet/RPC failures with a dismiss. */
function ChainErrorBanner() {
  const { chainError, clearChainError } = useSyntura();
  if (!chainError) return null;
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/[0.07]">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <p className="min-w-0 truncate font-mono text-[11px] text-amber-300">
          {chainError}
        </p>
        <button
          type="button"
          onClick={clearChainError}
          className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400 transition-colors hover:text-white"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("syntura:sidebar-collapsed") === "1"
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      localStorage.setItem("syntura:sidebar-collapsed", c ? "0" : "1");
      return !c;
    });
  }, []);

  const handleNavigate = useCallback((key) => {
    setActivePage(key);
    setSidebarOpen(false);
    window.scrollTo(0, 0);
  }, []);

  // Pages deep-link between each other (e.g. MintInvoice's "View in
  // Dashboard") via this window event rather than prop-drilling navigation.
  useEffect(() => {
    const onNavigate = (e) => {
      const key = e.detail?.page;
      if (PAGES[key]) {
        setEntered(true); // deep links skip the landing page
        handleNavigate(key);
      }
    };
    window.addEventListener("syntura:navigate", onNavigate);
    return () => window.removeEventListener("syntura:navigate", onNavigate);
  }, [handleNavigate]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  // Sidebar logo → back to the landing page.
  const exitToLanding = useCallback(() => {
    setEntered(false);
    setSidebarOpen(false);
    window.scrollTo(0, 0);
  }, []);

  const { title, Component } = PAGES[activePage] ?? PAGES.dashboard;

  if (!entered) return <Landing onLaunch={() => setEntered(true)} />;

  return (
    <div className="min-h-screen">
      <Sidebar
        active={activePage}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        onClose={closeSidebar}
        onBrand={exitToLanding}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />

      {/* Content column — offset by the fixed sidebar rail on desktop. */}
      <div
        className={`flex min-h-screen flex-col transition-[margin] duration-300 ${
          collapsed ? "lg:ml-[76px]" : "lg:ml-64"
        }`}
      >
        <Topbar title={title} onMenu={openSidebar} />
        <ChainErrorBanner />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <Component />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
