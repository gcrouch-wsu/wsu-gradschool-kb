import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageTreeManager } from "@/components/AdminPageTreeManager";
import { filterKbsForSession, getCurrentAdminSession } from "@/lib/auth";
import { getAllKbsForAdmin, getAllPageSummariesForAdmin } from "@/lib/kb-store";


export default async function AdminPagesPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/pages");
  }

  const kbs = await filterKbsForSession(session, await getAllKbsForAdmin());
  const groups = await Promise.all(
    kbs.map(async (kb) => ({
      kb,
      pages: await getAllPageSummariesForAdmin(kb.id),
    })),
  );

  return (
    <div className="page-shell admin-pages">
      <p className="eyebrow">Admin</p>
      <div className="admin-actions admin-pages__header">
        <h1>Pages</h1>
        <div className="admin-actions admin-pages__actions">
          <Link className="button" href="/admin/pages/new">
            Create Page
          </Link>
          <Link className="button button--ghost" href="/admin/import">
            Import from DOCX
          </Link>
        </div>
      </div>
      <p className="lead">
        Manage imported and seeded pages. Use this screen to reopen drafts, publish content, and move pages
        under the correct parent in the KB tree.
      </p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>

      <div className="grid admin-pages__grid">
        {groups.map(({ kb, pages }) => (
          <section className="card admin-pages__kb-card" key={kb.id}>
            <div className="admin-actions admin-pages__kb-header">
              <h2>{kb.title}</h2>
              <Link className="button button--small button--ghost" href={`/admin/pages/new?kb=${kb.id}`}>
                + New Page
              </Link>
            </div>
            <AdminPageTreeManager
              canDelete={session.role === "owner" || session.role === "admin"}
              initialPages={pages}
              kb={kb}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
