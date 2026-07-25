import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminPagesWorkspace } from "@/components/AdminPagesWorkspace";
import { PageLoader } from "@/components/PageLoader";
import { WorkspaceEmptyState } from "@/components/WorkspaceEmptyState";
import { filterKbsForSession, getCurrentAdminSession } from "@/lib/auth";
import { getAllKbsForAdmin, getAllPageSummariesForAdmin } from "@/lib/kb-store";

export default async function AdminPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ kb?: string }>;
}) {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/pages");
  }

  const { kb: kbFilter } = await searchParams;
  const kbs = await filterKbsForSession(session, await getAllKbsForAdmin());

  if (kbs.length === 0) {
    return (
      <div className="page-shell admin-pages">
        <p className="eyebrow">Admin</p>
        <div className="admin-actions admin-pages__header">
          <h1>Pages</h1>
        </div>
        <p className="lead">
          Manage imported and seeded pages. Use this screen to reopen drafts, publish content, and move
          pages under the correct parent in the KB tree.
        </p>
        <p className="meta">
          <Link href="/admin">← Back to admin</Link>
        </p>
        <WorkspaceEmptyState
          action={{ href: "/admin/kbs", label: "Create a knowledge base" }}
          message="No knowledge bases"
        />
      </div>
    );
  }

  const defaultKb = kbs[0];
  const selectedKb =
    kbs.find((kb) => kb.slug === kbFilter) ??
    (kbFilter ? kbs.find((kb) => kb.id === kbFilter) : undefined);

  if (!selectedKb) {
    redirect(`/admin/pages?kb=${encodeURIComponent(defaultKb.slug)}`);
  }

  if (kbFilter !== selectedKb.slug) {
    redirect(`/admin/pages?kb=${encodeURIComponent(selectedKb.slug)}`);
  }

  const destinationKbs = kbs.map((kb) => ({
    id: kb.id,
    title: kb.title,
    slug: kb.slug,
    visibility: kb.visibility,
  }));
  const pages = await getAllPageSummariesForAdmin(selectedKb.id);
  const scopeOptions = kbs.map((kb) => ({ id: kb.id, slug: kb.slug, title: kb.title }));

  return (
    <div className="page-shell admin-pages">
      <p className="eyebrow">Admin</p>
      <div className="admin-actions admin-pages__header">
        <h1>Pages</h1>
        <div className="admin-actions admin-pages__actions">
          <Link className="button" href={`/admin/pages/new?kb=${selectedKb.id}`}>
            Create Page
          </Link>
          <Link className="button button--ghost" href="/admin/import">
            Import from DOCX
          </Link>
        </div>
      </div>
      <p className="lead">
        Manage imported and seeded pages for one knowledge base at a time. Use this screen to reopen
        drafts, publish content, and move pages under the correct parent in the KB tree. Use each
        row&rsquo;s menu to copy or move a page to another knowledge base.
      </p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>

      <Suspense fallback={<PageLoader label="Loading pages" />}>
        <AdminPagesWorkspace
          canDelete={session.role === "owner" || session.role === "admin"}
          canManagePublishPolicy={session.role === "owner" || session.role === "admin"}
          destinationKbs={destinationKbs}
          kb={selectedKb}
          kbs={scopeOptions}
          pages={pages}
        />
      </Suspense>
    </div>
  );
}
