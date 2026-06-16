import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminAssetsWorkspace } from "@/components/AdminAssetsWorkspace";
import type { AdminAssetLibraryRow } from "@/components/AdminAssetLibrary";
import { WorkspaceEmptyState } from "@/components/WorkspaceEmptyState";
import { filterKbsForSession, getCurrentAdminSession } from "@/lib/auth";
import { buildAdminAssetsQuery, parseAdminAssetsTab } from "@/lib/admin-assets-query";
import { formatBytes, formatDate } from "@/lib/format";
import { getAllAssetsForAdmin, getAllKbsForAdmin } from "@/lib/kb-store";

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
  const activeTab = parseAdminAssetsTab(tabFilter);

  const kbs = await filterKbsForSession(session, await getAllKbsForAdmin());

  if (kbs.length === 0) {
    return (
      <div className="page-shell">
        <nav aria-label="Breadcrumb" className="breadcrumbs">
          <ol>
            <li>
              <Link href="/admin">Admin</Link>
            </li>
            <li>
              <span aria-current="page">Assets</span>
            </li>
          </ol>
        </nav>

        <h1>Asset library</h1>
        <p className="lead">
          Browse and manage files per knowledge base. Upload documents with stable public URLs — replace
          files without breaking links when you activate a new version.
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
    redirect(
      `/admin/assets?${buildAdminAssetsQuery({
        kbSlug: defaultKb.slug,
        status: statusFilter,
        tab: activeTab,
      })}`,
    );
  }

  if (kbFilter !== selectedKb.slug) {
    redirect(
      `/admin/assets?${buildAdminAssetsQuery({
        kbSlug: selectedKb.slug,
        status: statusFilter,
        tab: activeTab,
      })}`,
    );
  }

  const assets = await getAllAssetsForAdmin(selectedKb.id);

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

  const assetsHref = `/admin/assets?${buildAdminAssetsQuery({ kbSlug: selectedKb.slug })}`;

  return (
    <div className="page-shell">
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <ol>
          <li>
            <Link href="/admin">Admin</Link>
          </li>
          <li>
            <Link href={assetsHref}>Assets</Link>
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

      <Suspense fallback={<p className="meta">Loading asset library…</p>}>
        <AdminAssetsWorkspace
          assets={rows}
          kbSlug={selectedKb.slug}
          kbTitle={selectedKb.title}
          kbs={kbs.map((kb) => ({ id: kb.id, slug: kb.slug, title: kb.title }))}
          statusFilter={statusFilter}
        />
      </Suspense>
    </div>
  );
}
