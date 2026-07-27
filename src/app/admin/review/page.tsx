import Link from "next/link";
import { redirect } from "next/navigation";
import { ArchiveUnusedAssetsButton } from "@/components/ArchiveUnusedAssetsButton";
import { ReviewProposedActions } from "@/components/ReviewProposedActions";
import { ReviewSourcedScan } from "@/components/ReviewSourcedScan";
import { accessibleKbIds, getCurrentAdminSession } from "@/lib/auth";
import { getAdminReviewDashboard } from "@/lib/admin-review";

export default async function AdminReviewPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/review");
  }

  const canApprove = session.role === "owner" || session.role === "admin";
  const review = await getAdminReviewDashboard(await accessibleKbIds(session));

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Review dashboard</h1>
      <p className="lead">
        Governance checklist: proposed edits, staged imports, drafts ready to publish, publish
        blockers, reader feedback, broken asset references, unused assets, and P&amp;P sourced-content
        freshness.
      </p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
        {" · "}
        <Link href="/admin/redirects">Redirects</Link>
        {" · "}
        <Link href="/admin/trash">Trash</Link>
      </p>

      <ReviewSourcedScan />

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Proposed edits awaiting review ({review.proposedPages.length})</h2>
        <ReviewProposedActions canApprove={canApprove} pages={review.proposedPages} />
      </section>

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Reader feedback ({review.feedback.length})</h2>
        {review.feedback.length === 0 ? (
          <p className="meta">No page feedback yet.</p>
        ) : (
          <ul className="import-outline">
            {review.feedback.map((row) => (
              <li key={row.pageId}>
                <Link href={`/admin/pages/${row.pageId}`}>{row.pageTitle}</Link>
                <span className="meta">
                  {" "}
                  · {row.helpful} helpful · {row.notHelpful} not helpful
                  {row.withComment > 0 ? ` · ${row.withComment} with comments` : ""}
                  {row.lastAt ? ` · last ${row.lastAt}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {review.feedbackComments.length > 0 ? (
          <>
            <h3 style={{ marginTop: "1.25rem", fontSize: "1rem" }}>Recent comments</h3>
            <ul className="import-outline">
              {review.feedbackComments.map((row) => (
                <li key={row.id}>
                  <Link href={`/admin/pages/${row.pageId}`}>{row.pageTitle}</Link>
                  <span className="meta">
                    {" "}
                    · {row.helpful ? "helpful" : "not helpful"} · {row.createdAt}
                  </span>
                  <p style={{ margin: "0.35rem 0 0" }}>{row.comment}</p>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

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
          <>
            <ArchiveUnusedAssetsButton assets={review.unusedAssets} />
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
          </>
        )}
      </section>
    </div>
  );
}
