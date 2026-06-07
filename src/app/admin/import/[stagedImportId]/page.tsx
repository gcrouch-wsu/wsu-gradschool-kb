import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminStagedImportReview, type ImportKbOption } from "@/components/AdminStagedImportReview";
import { canAccessKb, filterKbsForSession, getCurrentAdminSession } from "@/lib/auth";
import { getAllKbsForAdmin, getAllPagesForAdmin } from "@/lib/kb-store";
import { getStagedImportDetail } from "@/lib/staged-imports";

export default async function AdminStagedImportReviewPage({
  params,
}: {
  params: Promise<{ stagedImportId: string }>;
}) {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/import");
  }

  const { stagedImportId } = await params;
  const detail = await getStagedImportDetail(stagedImportId);
  if (!detail) {
    notFound();
  }

  if (!(await canAccessKb(session, detail.import.kbId))) {
    notFound();
  }

  const kbs = await filterKbsForSession(session, await getAllKbsForAdmin());
  const kbOptions: ImportKbOption[] = await Promise.all(
    kbs.map(async (kb) => {
      const pages = await getAllPagesForAdmin(kb.id);
      return {
        id: kb.id,
        title: kb.title,
        slug: kb.slug,
        pages: pages
          .filter((page) => page.status !== "archived")
          .map((page) => ({
            path: page.path.join("/"),
            title: page.title,
            depth: page.path.length,
          })),
      };
    }),
  );

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin · Staged import</p>
      <h1>Review import</h1>
      <p className="meta">
        <Link href="/admin/import">← All imports</Link>
      </p>
      <AdminStagedImportReview initialDetail={detail} kbOptions={kbOptions} />
    </div>
  );
}
