import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminImportForm, type ImportKbOption } from "@/components/AdminImportForm";
import { getCurrentAdminSession } from "@/lib/auth";
import { getAllKbsForAdmin, getAllPagesForAdmin } from "@/lib/kb-store";

export default async function AdminImportPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/import");
  }

  const kbs = await getAllKbsForAdmin();
  const options: ImportKbOption[] = await Promise.all(
    kbs.map(async (kb) => {
      const pages = await getAllPagesForAdmin(kb.id);
      return {
        id: kb.id,
        title: kb.title,
        slug: kb.slug,
        pages: pages.map((page) => ({
          path: page.path.join("/"),
          title: page.title,
          depth: page.path.length,
        })),
      };
    }),
  );

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Import from Word (.docx)</h1>
      <p className="lead">
        Upload a Confluence-exported Word document. It is converted into KB content, staged for review,
        and saved as a <strong>draft</strong> page nested under the location you choose.
      </p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>
      <AdminImportForm kbOptions={options} />
    </div>
  );
}
