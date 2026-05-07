import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { LibrarianAgent } from "./LibrarianAgent";
import { CommandPalette } from "./CommandPalette";
import { useAdminSettings } from "@/lib/adminSettings";

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const loc = useLocation();
  const { settings } = useAdminSettings();
  const [pageKey, setPageKey] = useState(loc.pathname);

  useEffect(() => {
    setPageKey(loc.pathname);
  }, [loc.pathname]);

  return (
    <div className="min-h-screen w-full flex bg-background">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <main className="flex-1 min-w-0 relative">
        <div key={pageKey} className="page-enter min-h-screen">
          <Outlet />
        </div>
        {settings.agentEnabled && <LibrarianAgent />}
        <CommandPalette />
      </main>
    </div>
  );
}
