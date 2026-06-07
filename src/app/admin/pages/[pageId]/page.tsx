import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminPageEditorForm } from "@/components/AdminPageEditorForm";
import { canAccessKb, getCurrentAdminSession } from "@/lib/auth";
import { getAllPagesForAdmin, getKbById, getPageByIdForAdmin } from "@/lib/kb-store";

function hasPathPrefix(path: string[], prefix: string[]) {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

export default async function AdminEditPage({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/pages");
  }

  const { pageId } = await params;
  const page = await getPageByIdForAdmin(pageId);
  if (!page) {
    notFound();
  }

  const kb = await getKbById(page.kbId);
  if (!kb) {
    notFound();
  }

  if (!(await canAccessKb(session, kb.id))) {
    notFound();
  }

  const pages = await getAllPagesForAdmin(kb.id);
  const parentOptions = pages
    .filter(
      (candidate) =>
        candidate.id !== page.id &&
        candidate.status !== "archived" &&
        !hasPathPrefix(candidate.path, page.path),
    )
    .map((candidate) => ({
      path: candidate.path.join("/"),
      title: candidate.title,
      depth: candidate.path.length,
      status: candidate.status,
    }));

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Edit Page</h1>
      <p className="lead">
        Save changes as a draft while you work, publish when the page is ready, or move the page under a
        different parent to control the KB tree.
      </p>
      <p className="meta">
        <Link href="/admin/pages">Back to pages</Link>
      </p>
      <AdminPageEditorForm kb={kb} page={page} parentOptions={parentOptions} />
    </div>
  );
}
