import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminAssetDetailPanel } from "@/components/AdminAssetDetailPanel";
import { canAccessKb, getCurrentAdminSession } from "@/lib/auth";
import { formatBytes, formatDate } from "@/lib/format";
import { getAssetAdminDetail, getKbById } from "@/lib/kb-store";

export default async function AdminAssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/assets");
  }

  const { assetId } = await params;
  const detail = await getAssetAdminDetail(assetId);
  if (!detail) {
    notFound();
  }

  if (!(await canAccessKb(session, detail.asset.homeKbId))) {
    notFound();
  }

  const kb = await getKbById(detail.asset.homeKbId);

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin · Asset</p>
      <h1>{detail.asset.title}</h1>
      <p className="meta">
        <Link href="/admin/assets">← All assets</Link>
      </p>
      <p className="lead">
        {kb?.title ?? "Unknown KB"} · {detail.asset.assetType} · {detail.asset.status} ·{" "}
        {formatBytes(detail.asset.fileSizeBytes)} · Updated {formatDate(detail.asset.updatedDisplayDate)}
      </p>
      <p>{detail.asset.description}</p>

      <AdminAssetDetailPanel
        assetId={assetId}
        assetStatus={detail.asset.status}
        canDelete={session.role === "owner" || session.role === "admin"}
        publicUrl={detail.publicUrl}
        usages={detail.usages}
        versions={detail.versions}
      />
    </div>
  );
}
