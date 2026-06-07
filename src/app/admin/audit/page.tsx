import Link from "next/link";
import { redirect } from "next/navigation";
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

      <form className="form card audit-filter" method="get">
        <div className="field-row">
          <label>
            <span className="meta">Search</span>
            <input className="input" defaultValue={filter.q} name="q" placeholder="Actor, action, or item" />
          </label>
          <label>
            <span className="meta">Action</span>
            <input className="input" defaultValue={filter.action} name="action" placeholder="page.updated" />
          </label>
        </div>
        <div className="field-row">
          <label>
            <span className="meta">Entity type</span>
            <select className="input" defaultValue={filter.entityType} name="entityType">
              <option value="">Any</option>
              <option value="page">Page</option>
              <option value="asset">Asset</option>
              <option value="kb">Knowledge base</option>
              <option value="import">Import</option>
              <option value="redirect">Redirect</option>
              <option value="user">User</option>
              <option value="settings">Settings</option>
            </select>
          </label>
          <label>
            <span className="meta">Knowledge base</span>
            <select className="input" defaultValue={filter.kbId} name="kbId">
              <option value="">Any</option>
              {kbs.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label>
            <span className="meta">From</span>
            <input className="input" defaultValue={filter.from} name="from" type="date" />
          </label>
          <label>
            <span className="meta">To</span>
            <input className="input" defaultValue={filter.to} name="to" type="date" />
          </label>
        </div>
        <div className="admin-actions">
          <button className="button" type="submit">
            Apply filters
          </button>
          <Link className="button button--ghost" href="/admin/audit">
            Clear
          </Link>
        </div>
      </form>

      <div className="admin-actions">
        <Link className="button button--ghost" href="/admin/audit/search">
          View Search Gaps
        </Link>
      </div>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Item</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5}>No audit events match these filters.</td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.createdAt).toLocaleString()}</td>
                  <td>
                    {event.actorEmail}
                    <div className="meta">{event.actorRole}</div>
                  </td>
                  <td>{event.action}</td>
                  <td>
                    {event.entityLabel || event.entityId}
                    <div className="meta">{event.entityType}</div>
                  </td>
                  <td>
                    <code>{JSON.stringify(event.details)}</code>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
