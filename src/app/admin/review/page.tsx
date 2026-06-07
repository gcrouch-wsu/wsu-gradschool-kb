import Link from "next/link";
import { redirect } from "next/navigation";
import { accessibleKbIds, getCurrentAdminSession } from "@/lib/auth";
import { getAdminReviewDashboard } from "@/lib/admin-review";

export default async function AdminReviewPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/review");
  }

  const review = await getAdminReviewDashboard(await accessibleKbIds(session));

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Review dashboard</h1>
      <p className="lead">
        Pilot migration checklist: staged imports awaiting review, drafts ready to publish, publish
        blockers, broken asset references, and unused assets.
      </p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Staged imports ({review.stagedImports.length})</h2>
        {review.stagedImports.length === 0 ? (
          <p className="meta">No staged imports. Start one from Import.</p>
        ) : (
          <ul className="import-outline">
            {review.stagedImports.map((row) => (
              <li key={row.id}>
                <Link href={`/admin/import/${row.id}`}>
                  <strong>{row.title || row.originalFilename}</strong>
                </Link>
                <span className="meta">
                  {" "}
                  · {row.status} · updated {row.updatedAt}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginTop: "0.75rem" }}>
          <Link className="button button--small" href="/admin/import">
            Import documents
          </Link>
        </p>
      </section>

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Drafts ready to publish ({review.draftPagesReady.length})</h2>
        {review.draftPagesReady.length === 0 ? (
          <p className="meta">No drafts pass the publish gate yet.</p>
        ) : (
          <ul className="import-outline">
            {review.draftPagesReady.map((page) => (
              <li key={page.pageId}>
                <Link href={`/admin/pages/${page.pageId}`}>{page.title}</Link>
                <span className="meta"> · /{page.path}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Drafts blocked by publish gate ({review.draftPagesBlocked.length})</h2>
        {review.draftPagesBlocked.length === 0 ? (
          <p className="meta">No blocked drafts.</p>
        ) : (
          <ul className="import-outline">
            {review.draftPagesBlocked.map((page) => (
              <li key={page.pageId}>
                <Link href={`/admin/pages/${page.pageId}`}>{page.title}</Link>
                <span className="meta">
                  {" "}
                  · /{page.path}
                </span>
                <ul className="issue-list">
                  {page.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Broken asset references ({review.brokenReferences.length})</h2>
        {review.brokenReferences.length === 0 ? (
          <p className="meta">All referenced assets are active.</p>
        ) : (
          <ul className="import-outline">
            {review.brokenReferences.map((ref, index) => (
              <li key={`${ref.pageId}-${ref.assetId}-${index}`}>
                <Link href={`/admin/pages/${ref.pageId}`}>{ref.pageTitle}</Link>
                <span className="meta">
                  {" "}
                  ({ref.pageStatus}) — {ref.usageType} →{" "}
                  <Link href={`/admin/assets/${ref.assetId}`}>{ref.assetId}</Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Unused active assets ({review.unusedAssets.length})</h2>
        {review.unusedAssets.length === 0 ? (
          <p className="meta">Every active asset is referenced on at least one page.</p>
        ) : (
          <ul className="import-outline">
            {review.unusedAssets.map((asset) => (
              <li key={asset.assetId}>
                <Link href={`/admin/assets/${asset.assetId}`}>{asset.title}</Link>
                <span className="meta">
                  {" "}
                  · {asset.slug}
                  {asset.kbSlug ? ` · /kb/${asset.kbSlug}/files/${asset.slug}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
