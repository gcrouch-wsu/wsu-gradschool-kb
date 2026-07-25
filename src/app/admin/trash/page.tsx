import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTrashList, type TrashPageRow } from "@/components/AdminTrashList";
import { accessibleKbIds, getCurrentAdminSession } from "@/lib/auth";
import { getAllKbsForAdmin, getAllPageSummariesForAdmin } from "@/lib/kb-store";

export default async function AdminTrashPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/trash");
  }

  const allowed = await accessibleKbIds(session);
  const allowedSet = allowed === null ? null : new Set(allowed);
  const kbs = (await getAllKbsForAdmin()).filter((kb) =>
    allowedSet === null ? true : allowedSet.has(kb.id),
  );

  const rows: TrashPageRow[] = [];
  for (const kb of kbs) {
    const pages = await getAllPageSummariesForAdmin(kb.id);
    const archived = pages.filter((page) => page.status === "archived");
    for (const page of archived) {
      const hasChildren = pages.some(
        (candidate) =>
          candidate.id !== page.id &&
          candidate.path.length > page.path.length &&
          page.path.every((segment, index) => candidate.path[index] === segment),
      );
      rows.push({
        pageId: page.id,
        title: page.title,
        path: page.path.join("/"),
        kbId: kb.id,
        kbTitle: kb.title,
        updatedDisplayDate: page.updatedDisplayDate,
        hasChildren,
      });
    }
  }
  rows.sort((a, b) => b.updatedDisplayDate.localeCompare(a.updatedDisplayDate) || a.title.localeCompare(b.title));

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Trash</h1>
      <p className="lead">
        Archived pages are hidden from readers. Restore them to draft, or permanently delete when they
        have no children and no remaining references.
      </p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
        {" · "}
        <Link href="/admin/pages">Pages</Link>
        {" · "}
        <Link href="/admin/review">Review</Link>
      </p>

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Archived pages ({rows.length})</h2>
        <AdminTrashList
          canDelete={session.role === "owner" || session.role === "admin"}
          pages={rows}
        />
      </section>
    </div>
  );
}
