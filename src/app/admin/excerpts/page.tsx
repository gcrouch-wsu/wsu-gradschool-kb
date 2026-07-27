import Link from "next/link";
import { redirect } from "next/navigation";
import { accessibleKbIds, getCurrentAdminSession } from "@/lib/auth";
import { listExcerptIndex } from "@/lib/excerpt-index";

export default async function AdminExcerptsPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/excerpts");
  }
  if (session.role === "viewer") {
    redirect("/");
  }

  const excerpts = await listExcerptIndex(await accessibleKbIds(session));
  const staleCount = excerpts.filter((item) => item.isStale).length;

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Excerpt browser</h1>
      <p className="lead">
        Every live excerpt block across your knowledge bases. Stale excerpts point at source pages that changed after
        the host page was last saved.
      </p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
        {" · "}
        <Link href="/admin/health">Content health</Link>
      </p>

      <div className="grid grid--three" style={{ marginTop: "1.5rem" }}>
        <div className="card">
          <p className="meta">Excerpt blocks</p>
          <strong>{excerpts.length}</strong>
        </div>
        <div className="card">
          <p className="meta">Stale excerpts</p>
          <strong>{staleCount}</strong>
        </div>
        <div className="card">
          <p className="meta">Up to date</p>
          <strong>{excerpts.length - staleCount}</strong>
        </div>
      </div>

      <section className="admin-panel" style={{ marginTop: "1.5rem" }}>
        <h2 className="admin-panel__title">All excerpts</h2>
        {excerpts.length === 0 ? (
          <p className="admin-panel__empty">No excerpt blocks found.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Host page</th>
                  <th>Source page</th>
                  <th>Knowledge base</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {excerpts.map((item) => (
                  <tr key={`${item.pageId}-${item.excerptBlockId}`}>
                    <td>
                      <Link href={`/admin/pages/${item.pageId}`}>{item.pageTitle}</Link>
                      <div className="meta">{item.pageStatus}</div>
                    </td>
                    <td>
                      <Link href={`/admin/pages/${item.sourcePageId}`}>{item.sourceTitle}</Link>
                      <div className="meta">{item.sourceStatus}</div>
                    </td>
                    <td>{item.kbTitle}</td>
                    <td>{item.isStale ? "Stale" : "Current"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
