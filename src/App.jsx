import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./components/layout/Sidebar.jsx";
import Topbar from "./components/layout/Topbar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import MintInvoice from "./pages/MintInvoice.jsx";
import RiskUnderwriter from "./pages/RiskUnderwriter.jsx";
import LiquidityVaults from "./pages/LiquidityVaults.jsx";
import AuditLog from "./pages/AuditLog.jsx";

/** Page registry — keys are the canonical route ids shared with the Sidebar. */
const PAGES = {
  dashboard: { title: "Dashboard", Component: Dashboard },
  mint: { title: "Mint RWA Invoice", Component: MintInvoice },
  underwriter: { title: "AI Risk Underwriter", Component: RiskUnderwriter },
  vaults: { title: "Liquidity Vaults", Component: LiquidityVaults },
  audit: { title: "On-Chain Audit Log", Component: AuditLog },
};

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      if (PAGES[key]) handleNavigate(key);
    };
    window.addEventListener("syntura:navigate", onNavigate);
    return () => window.removeEventListener("syntura:navigate", onNavigate);
  }, [handleNavigate]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  const { title, Component } = PAGES[activePage] ?? PAGES.dashboard;

  return (
    <div className="min-h-screen">
      <Sidebar
        active={activePage}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        onClose={closeSidebar}
      />

      {/* Content column — offset by the fixed w-64 sidebar on desktop. */}
      <div className="flex min-h-screen flex-col lg:ml-64">
        <Topbar title={title} onMenu={openSidebar} />

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
