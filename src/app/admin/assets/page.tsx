import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminAssetsWorkspace } from "@/components/AdminAssetsWorkspace";
import type { AdminAssetLibraryRow } from "@/components/AdminAssetLibrary";
import { filterKbsForSession, getCurrentAdminSession } from "@/lib/auth";
import { formatBytes, formatDate } from "@/lib/format";
import { getAllAssetsForAdmin, getAllKbsForAdmin } from "@/lib/kb-store";

function buildAssetsQuery(kbId: string, status?: string, tab?: string) {
  const params = new URLSearchParams({ kb: kbId });
  if (status) {
    params.set("status", status);
  }
  if (tab === "upload") {
    params.set("tab", "upload");
  }
  return params.toString();
}

export default async function AdminAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ kb?: string; status?: string; tab?: string }>;
}) {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/assets");
  }

  const { kb: kbFilter, status: statusFilter, tab: tabFilter } = await searchParams;

  const kbs = await filterKbsForSession(session, await getAllKbsForAdmin());
  const defaultKb = kbs.find((kb) => kb.slug === "graduate-school") ?? kbs[0];

  if (!kbFilter && defaultKb) {
    redirect(`/admin/assets?${buildAssetsQuery(defaultKb.id, statusFilter, tabFilter)}`);
  }

  const selectedKb = kbs.find((kb) => kb.id === kbFilter);
  if (!selectedKb) {
    redirect(defaultKb ? `/admin/assets?${buildAssetsQuery(defaultKb.id)}` : "/admin");
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

  return (
    <div className="page-shell">
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <ol>
          <li>
            <Link href="/admin">Admin</Link>
          </li>
          <li>
            <Link href={`/admin/assets?kb=${selectedKb.id}`}>Assets</Link>
          </li>
          <li>
            <span aria-current="page">{selectedKb.title}</span>
          </li>
        </ol>
      </nav>

      <h1>Asset library</h1>
      <p className="lead">
        Browse and manage files per knowledge base. Upload documents with stable public URLs — replace
        files without breaking links when you activate a new version.
      </p>

      <nav aria-label="Knowledge bases" className="asset-kb-tabs">
        {kbs.map((kb) => (
          <Link
            className={kb.id === selectedKb.id ? "asset-kb-tabs__link is-active" : "asset-kb-tabs__link"}
            href={`/admin/assets?${buildAssetsQuery(kb.id, statusFilter, tabFilter)}`}
            key={kb.id}
          >
            {kb.title}
          </Link>
        ))}
      </nav>

      <Suspense fallback={<p className="meta">Loading asset library…</p>}>
        <AdminAssetsWorkspace
          assets={rows}
          kbId={selectedKb.id}
          kbTitle={selectedKb.title}
          kbs={kbs.map((kb) => ({ id: kb.id, title: kb.title }))}
          statusFilter={statusFilter}
        />
      </Suspense>
    </div>
  );
}
