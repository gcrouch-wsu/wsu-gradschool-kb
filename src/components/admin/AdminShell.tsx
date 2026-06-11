import type { ReactNode } from "react";
import type { AdminSession } from "@/lib/auth";
import { Sidebar } from "@/components/admin/Sidebar";
import { TopBar } from "@/components/admin/TopBar";
interface AdminShellProps {
  session: AdminSession;
  children: ReactNode;
}

export function AdminShell({ session, children }: AdminShellProps) {
  return (
    <div className="admin-shell">
      <Sidebar session={session} />      <div className="admin-shell__main">
        <TopBar session={session} />
        <div className="admin-shell__content">{children}</div>
      </div>
    </div>
  );
}
