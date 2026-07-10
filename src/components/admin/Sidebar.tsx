"use client";

import {
  BookOpen,
  BarChart3,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ScrollText,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import type { AdminSession } from "@/lib/auth";
import type { SiteBrandSettings } from "@/components/SiteBrand";
import { SiteBrand } from "@/components/SiteBrand";
import { SidebarLink } from "@/components/admin/SidebarLink";

interface SidebarProps {
  branding: SiteBrandSettings;
  isCollapsed: boolean;
  session: AdminSession;
}

export function Sidebar({ branding, isCollapsed, session }: SidebarProps) {
  const isOwner = session.role === "owner";
  const canAudit = session.role === "owner" || session.role === "admin";

  return (
    <aside
      aria-label="Admin navigation"
      className={`admin-shell__sidebar${isCollapsed ? " is-collapsed" : ""}`}
    >
      <div className="admin-shell__sidebar-top">
        <SiteBrand href="/admin" settings={branding} variant="sidebar" />

        <p className="admin-shell__section-label">Admin</p>

        <nav className="admin-shell__nav">
          <SidebarLink exact href="/admin" icon={LayoutDashboard} label="Dashboard" />
          <SidebarLink href="/admin/pages" icon={FileText} label="Pages" />
          <SidebarLink href="/admin/assets" icon={FolderOpen} label="Assets" />
          {isOwner && <SidebarLink href="/admin/kbs" icon={BookOpen} label="Knowledge bases" />}
          {isOwner && <SidebarLink href="/admin/users" icon={Users} label="Users" />}
          <SidebarLink href="/admin/import" icon={Upload} label="Imports" />
          <SidebarLink href="/admin/usage" icon={BarChart3} label="Usage" />
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
