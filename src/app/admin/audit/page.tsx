import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminAuditFilters } from "@/components/admin/AdminAuditFilters";
import { AdminAuditEventsTable } from "@/components/admin/AdminAuditEventsTable";
import { getCurrentAdminSession } from "@/lib/auth";
import { listAuditEvents } from "@/lib/audit-log";
import { getAllKbsForAdmin } from "@/lib/kb-store";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/audit");
  }
  if (session.role !== "owner" && session.role !== "admin") {
    redirect("/admin");
  }

  const params = await searchParams;
  const value = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
  };
  const filter = {
    q: value("q"),
    action: value("action"),
    entityType: value("entityType"),
    kbId: value("kbId"),
    from: value("from"),
    to: value("to"),
  };
  const [events, kbs] = await Promise.all([listAuditEvents(filter), getAllKbsForAdmin()]);

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Audit log</h1>
      <p className="lead">Recent administrative actions. Entries store metadata and small details, not full content snapshots.</p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>

      <AdminAuditFilters filter={filter} kbs={kbs} />

      <div className="admin-actions" style={{ marginTop: "1rem" }}>
        <Link className="button button--ghost" href="/admin/audit/search">
          View Search Gaps
        </Link>
      </div>

      <AdminAuditEventsTable events={events} />
    </div>
  );
}
