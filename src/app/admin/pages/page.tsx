import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageTreeManager } from "@/components/AdminPageTreeManager";
import { filterKbsForSession, getCurrentAdminSession } from "@/lib/auth";
import { getAllKbsForAdmin, getAllPagesForAdmin } from "@/lib/kb-store";

export default async function AdminPagesPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/pages");
  }

  // Editors only see KBs they are assigned to; owners/admins see all.
  const kbs = await filterKbsForSession(session, await getAllKbsForAdmin());
  const groups = await Promise.all(
    kbs.map(async (kb) => ({
      kb,
      pages: await getAllPagesForAdmin(kb.id),
    })),
  );

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Pages</h1>
      <p className="lead">
        Manage imported and seeded pages. Use this screen to reopen drafts, publish content, and move pages
        under the correct parent in the KB tree.
      </p>
      <p className="meta">
        <Link href="/admin">Back to admin</Link>
      </p>

      <div className="admin-actions">
        <Link className="button" href="/admin/pages/new">
          Create Page
        </Link>
        <Link className="button button--ghost" href="/admin/import">
          Import from DOCX
        </Link>
      </div>

      <div className="grid">
        {groups.map(({ kb, pages }) => (
          <section className="card" key={kb.id}>
            <div className="admin-actions" style={{ marginBottom: "1.5rem", justifyContent: "space-between" }}>
              <h2>{kb.title}</h2>
              <Link className="button button--small button--ghost" href={`/admin/pages/new?kb=${kb.id}`}>
                + New Page
              </Link>
            </div>
            {pages.length === 0 ? (
              <p className="meta">No pages yet.</p>
            ) : (
              <AdminPageTreeManager
                canDelete={session.role === "owner" || session.role === "admin"}
                initialPages={pages}
                kb={kb}
              />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
