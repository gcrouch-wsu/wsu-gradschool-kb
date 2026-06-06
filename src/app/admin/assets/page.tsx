import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminAssetLibrary, type AdminAssetLibraryRow } from "@/components/AdminAssetLibrary";
import { AdminAssetUploadForm } from "@/components/AdminAssetUploadForm";
import { getCurrentAdminSession } from "@/lib/auth";
import { formatBytes, formatDate } from "@/lib/format";
import { getAllAssetsForAdmin, getAllKbsForAdmin } from "@/lib/kb-store";

export default async function AdminAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ kb?: string; status?: string }>;
}) {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/assets");
  }

  const { kb: kbFilter, status: statusFilter } = await searchParams;
  const kbs = await getAllKbsForAdmin();
  const defaultKb = kbs.find((kb) => kb.slug === "graduate-school") ?? kbs[0];

  if (!kbFilter && defaultKb) {
    const statusQuery = statusFilter ? `&status=${statusFilter}` : "";
    redirect(`/admin/assets?kb=${defaultKb.id}${statusQuery}`);
  }

  const selectedKb = kbs.find((kb) => kb.id === kbFilter);
  if (!selectedKb) {
    redirect(defaultKb ? `/admin/assets?kb=${defaultKb.id}` : "/admin");
  }

  let assets = await getAllAssetsForAdmin(selectedKb.id);
  if (statusFilter === "archived") {
    assets = assets.filter((asset) => asset.status === "archived");
  } else if (statusFilter === "active") {
    assets = assets.filter((asset) => asset.status === "active");
  }

  const rows: AdminAssetLibraryRow[] = assets.map((asset) => ({
    id: asset.id,
    title: asset.title,
    slug: asset.slug,
    assetType: asset.assetType,
    status: asset.status,
    fileSizeBytes: asset.fileSizeBytes,
    formattedSize: formatBytes(asset.fileSizeBytes),
    formattedDate: formatDate(asset.updatedDisplayDate),
    publicUrl:
      asset.status === "active" ? `/kb/${selectedKb.slug}/files/${asset.slug}` : undefined,
  }));

  const statusQuery = statusFilter ? `&status=${statusFilter}` : "";

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Asset library</h1>
      <p className="lead">
        Browse and manage files per knowledge base. Upload documents with stable public URLs — replace
        files without breaking links when you activate a new version.
      </p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>

      <nav className="asset-kb-tabs" aria-label="Knowledge bases">
        {kbs.map((kb) => (
          <Link
            className={kb.id === selectedKb.id ? "asset-kb-tabs__link is-active" : "asset-kb-tabs__link"}
            href={`/admin/assets?kb=${kb.id}${statusQuery}`}
            key={kb.id}
          >
            {kb.title}
          </Link>
        ))}
      </nav>

      <AdminAssetLibrary
        assets={rows}
        kbId={selectedKb.id}
        kbTitle={selectedKb.title}
        statusFilter={statusFilter}
      />

      <details className="card asset-upload-panel">
        <summary>Upload document to {selectedKb.title}</summary>
        <p className="meta">PDF, Word (.docx/.doc), or plain text — up to 25 MB.</p>
        <AdminAssetUploadForm kbs={kbs} lockKbId={selectedKb.id} />
      </details>
    </div>
  );
}
