"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { AdminSession } from "@/lib/auth";
import { subscribeAdminClientSession } from "@/lib/admin-client-session";

interface TopBarProps {
  isSidebarCollapsed: boolean;
  session: AdminSession;
  onToggleSidebar: () => void;
}

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function TopBar({ isSidebarCollapsed, session, onToggleSidebar }: TopBarProps) {
  const pathname = usePathname() || "/admin";
  // Server rendered the page while signed in; flip to Sign in if a child (e.g. editor)
  // reports the cookie expired without a full navigation.
  const [clientSignedIn, setClientSignedIn] = useState(true);

  useEffect(() => subscribeAdminClientSession(setClientSignedIn), []);

  const signInHref = `/admin/sign-in?next=${encodeURIComponent(pathname)}`;

  return (
    <header className="admin-shell__topbar">
      <nav aria-label="Global" className="admin-shell__topbar-nav">
        <button
          aria-expanded={!isSidebarCollapsed}
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="admin-shell__sidebar-toggle"
          type="button"
          onClick={onToggleSidebar}
        >
          {isSidebarCollapsed ? (
            <PanelLeftOpen aria-hidden size={18} strokeWidth={1.75} />
          ) : (
            <PanelLeftClose aria-hidden size={18} strokeWidth={1.75} />
          )}
        </button>
        {/* Plain anchor: leaving the admin shell needs a full page load. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional hard nav */}
        <a href="/">Knowledge bases</a>
        <Link aria-current="page" className="is-active" href="/admin">
          Admin
        </Link>
      </nav>

      <div className="admin-shell__topbar-actions">
        {clientSignedIn ? (
          <>
            <span className="admin-shell__user-pill" title={`Signed in as ${session.email}`}>
              <span className="admin-shell__user-email">{session.email}</span>
              <span className="admin-shell__user-role">{roleLabel(session.role)}</span>
            </span>
            <form action="/api/admin/logout" method="post">
              <button className="admin-shell__sign-out" type="submit">
                Sign out
              </button>
            </form>
          </>
        ) : (
          // Plain anchor + full navigation: sign-in uses a different root layout than the admin shell.
          // next= current path so after auth they return to the page they were on (editor restores
          // from the local draft backup if needed).
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional hard nav
          <a className="admin-shell__sign-in" href={signInHref}>
            Sign in
          </a>
        )}
      </div>
    </header>
  );
}
