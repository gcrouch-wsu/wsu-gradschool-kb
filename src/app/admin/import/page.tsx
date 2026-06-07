import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminImportUpload } from "@/components/AdminImportUpload";
import { accessibleKbIds, getCurrentAdminSession } from "@/lib/auth";
import { getAllKbsForAdmin } from "@/lib/kb-store";
import { listStagedImportsForAdmin } from "@/lib/staged-imports";

export default async function AdminImportPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/import");
  }

  const allowed = await accessibleKbIds(session);
  const allowedSet = allowed === null ? null : new Set(allowed);
  const kbs = (await getAllKbsForAdmin()).filter((kb) => allowedSet === null || allowedSet.has(kb.id));
  const staged = (await listStagedImportsForAdmin()).filter(
    (row) => allowedSet === null || allowedSet.has(row.kbId),
  );

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Import from Word (.docx)</h1>
      <p className="lead">
        Upload Confluence-exported Word documents into <strong>staged imports</strong>. Review
        structure, metadata, and images, then commit to a draft page when ready. Publishing stays a
        separate step.
      </p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>

      {staged.length > 0 && (
        <section className="card" style={{ marginTop: "1.5rem" }}>
          <h2>Staged imports ({staged.length})</h2>
          <p className="meta">Resume review or discard imports you no longer need.</p>
          <ul className="import-outline">
            {staged.map((row) => (
              <li key={row.id}>
                <Link href={`/admin/import/${row.id}`}>
                  <strong>{row.title || row.originalFilename}</strong>
                </Link>
                <span className="meta">
                  {" "}
                  · {row.status} · {row.originalFilename} · updated {row.updatedAt}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <AdminImportUpload kbOptions={kbs.map((kb) => ({ id: kb.id, title: kb.title }))} />
      </div>
    </div>
  );
}
