"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { AdminSession } from "@/lib/auth";
import { Sidebar } from "@/components/admin/Sidebar";
import { TopBar } from "@/components/admin/TopBar";
interface AdminShellProps {
  session: AdminSession;
  children: ReactNode;
}

export function AdminShell({ session, children }: AdminShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const syncSidebarState = () => setIsSidebarCollapsed(media.matches);

    syncSidebarState();
    media.addEventListener("change", syncSidebarState);
    return () => media.removeEventListener("change", syncSidebarState);
  }, []);

  return (
    <div className={`admin-shell${isSidebarCollapsed ? " is-sidebar-collapsed" : " is-sidebar-expanded"}`}>
      <Sidebar isCollapsed={isSidebarCollapsed} session={session} />
      <div className="admin-shell__main">
        <TopBar
          isSidebarCollapsed={isSidebarCollapsed}
          session={session}
          onToggleSidebar={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
        />
        <div className="admin-shell__content">{children}</div>
      </div>
    </div>
  );
}
