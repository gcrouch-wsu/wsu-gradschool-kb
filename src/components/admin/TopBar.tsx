import Link from "next/link";
import type { AdminSession } from "@/lib/auth";
interface TopBarProps {
  session: AdminSession;
}

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function TopBar({ session }: TopBarProps) {
  return (
    <header className="admin-shell__topbar">
      <nav aria-label="Global" className="admin-shell__topbar-nav">
        <Link href="/">Knowledge bases</Link>
        <Link aria-current="page" className="is-active" href="/admin">
          Admin
        </Link>
      </nav>

      <div className="admin-shell__topbar-actions">
        <span className="admin-shell__user-pill" title={`Signed in as ${session.email}`}>          <span className="admin-shell__user-email">{session.email}</span>
          <span className="admin-shell__user-role">{roleLabel(session.role)}</span>
        </span>
        <form action="/api/admin/logout" method="post">
          <button className="admin-shell__sign-out" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
