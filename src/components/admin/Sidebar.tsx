"use client";

import {
  BookOpen,
  FileText,
  FolderOpen,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminSession } from "@/lib/auth";
import { SidebarLink } from "@/components/admin/SidebarLink";

interface SidebarProps {
  session: AdminSession;
}

export function Sidebar({ session }: SidebarProps) {
  const isOwner = session.role === "owner";
  const canAudit = session.role === "owner" || session.role === "admin";
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const syncSidebarState = () => setIsCollapsed(media.matches);

    syncSidebarState();
    media.addEventListener("change", syncSidebarState);
    return () => media.removeEventListener("change", syncSidebarState);
  }, []);

  return (
    <aside
      aria-label="Admin navigation"
      className={`admin-shell__sidebar${isCollapsed ? " is-collapsed" : ""}`}
    >
      <div className="admin-shell__sidebar-top">
        <div className="admin-shell__brand">
          <div className="admin-shell__brand-lockup">
            <span aria-hidden className="admin-shell__brand-mark" />
            <span className="admin-shell__brand-text">WSU Knowledge Base</span>
          </div>
          <button
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="admin-shell__sidebar-toggle"
            type="button"
            onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          >
            {isCollapsed ? (
              <PanelLeftOpen aria-hidden size={18} strokeWidth={1.75} />
            ) : (
              <PanelLeftClose aria-hidden size={18} strokeWidth={1.75} />
            )}
          </button>
        </div>

        <p className="admin-shell__section-label">Admin</p>

        <nav className="admin-shell__nav">
          <SidebarLink exact href="/admin" icon={LayoutDashboard} label="Dashboard" />
          <SidebarLink href="/admin/pages" icon={FileText} label="Pages" />
          <SidebarLink href="/admin/assets" icon={FolderOpen} label="Assets" />
          {isOwner && <SidebarLink href="/admin/kbs" icon={BookOpen} label="Knowledge bases" />}
          {isOwner && <SidebarLink href="/admin/users" icon={Users} label="Users" />}
          <SidebarLink href="/admin/import" icon={Upload} label="Imports" />
        </nav>
      </div>

      <div className="admin-shell__sidebar-bottom">
        <div aria-hidden className="admin-shell__sidebar-divider" />
        <nav className="admin-shell__nav">
          {isOwner && <SidebarLink href="/admin/settings" icon={Settings} label="Settings" />}
          {canAudit && <SidebarLink href="/admin/audit" icon={ScrollText} label="Audit log" />}
        </nav>
      </div>
    </aside>
  );
}
