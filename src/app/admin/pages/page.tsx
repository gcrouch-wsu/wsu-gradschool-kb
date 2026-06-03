import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageTreeManager } from "@/components/AdminPageTreeManager";
import { getCurrentAdminSession } from "@/lib/auth";
import { getAllKbsForAdmin, getAllPagesForAdmin } from "@/lib/kb-store";

export default async function AdminPagesPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/pages");
  }

  const kbs = await getAllKbsForAdmin();
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

      <div className="grid">
        {groups.map(({ kb, pages }) => (
          <section className="card" key={kb.id}>
            <h2>{kb.title}</h2>
            {pages.length === 0 ? (
              <p>No pages yet.</p>
            ) : (
              <AdminPageTreeManager initialPages={pages} kb={kb} />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
