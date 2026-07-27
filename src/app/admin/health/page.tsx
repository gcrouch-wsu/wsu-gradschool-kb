import Link from "next/link";
import { redirect } from "next/navigation";
import { accessibleKbIds, getCurrentAdminSession } from "@/lib/auth";
import { getContentHealthReport, type ContentHealthPageItem } from "@/lib/content-health";
import { listStaleExcerpts } from "@/lib/stale-excerpts";
import { listStaleAssetRefs } from "@/lib/stale-asset-refs";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function PageTable({
  empty,
  heading,
  dateField = "review",
  pages,
  issueColumn = "Review due",
  totalCount,
}: {
  empty: string;
  heading: string;
  dateField?: "review" | "updated";
  pages: ContentHealthPageItem[];
  issueColumn?: string;
  /** Full queue size when `pages` is a truncated preview. */
  totalCount?: number;
}) {
  const count = totalCount ?? pages.length;
  return (
    <section className="admin-panel" style={{ marginTop: "1.5rem" }}>
      <h2 className="admin-panel__title">
        {heading} ({formatNumber(count)})
      </h2>
      {pages.length === 0 ? (
        <p className="admin-panel__empty">{empty}</p>
      ) : (
        <>
          {totalCount !== undefined && totalCount > pages.length ? (
            <p className="meta">
              Showing the first {formatNumber(pages.length)} of {formatNumber(totalCount)}.
            </p>
          ) : null}
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Knowledge base</th>
                  <th>Status</th>
                  <th>{issueColumn}</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={`${heading}-${page.pageId}`}>
                    <td>
                      <Link href={`/admin/pages/${page.pageId}`}>{page.title}</Link>
                      <div className="meta">/{page.path}</div>
                    </td>
                    <td>{page.kbTitle}</td>
                    <td>{page.status}</td>
                    <td>
                      {page.issues?.length ? (
                        <span>{page.issues.join(", ")}</span>
                      ) : (
                        <span>
                          {formatDate(
                            dateField === "updated"
                              ? page.updatedDisplayDate
                              : page.nextReviewDate ?? page.lastReviewedDate,
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export default async function AdminHealthPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/health");
  }
  if (session.role === "viewer") {
    redirect("/");
  }

  const report = await getContentHealthReport(await accessibleKbIds(session));
  const staleExcerpts = await listStaleExcerpts();
  const staleAssetRefs = await listStaleAssetRefs(await accessibleKbIds(session));

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Content health</h1>
      <p className="lead">
        Prioritized maintenance queues for review dates, tags, governance metadata, proposed pages, and searches
        that returned no results.
      </p>
      <p className="meta">
        <Link href="/admin">Back to admin</Link>
        {" · "}
        <Link href="/admin/review">Review dashboard</Link>
      </p>

      <div className="grid grid--three" style={{ marginTop: "1.5rem" }}>
        <div className="card">
          <p className="meta">Active pages</p>
          <p className="admin-stat-card__value">{formatNumber(report.counts.activePages)}</p>
        </div>
        <div className="card">
          <p className="meta">Stale reviews</p>
          <p className="admin-stat-card__value">{formatNumber(report.counts.stalePages)}</p>
        </div>
        <div className="card">
          <p className="meta">Missing tags</p>
          <p className="admin-stat-card__value">{formatNumber(report.counts.missingTags)}</p>
        </div>
        <div className="card">
          <p className="meta">Metadata issues</p>
          <p className="admin-stat-card__value">{formatNumber(report.counts.missingMetadata)}</p>
        </div>
        <div className="card">
          <p className="meta">Proposed pages</p>
          <p className="admin-stat-card__value">{formatNumber(report.counts.proposedPages)}</p>
        </div>
        <div className="card">
          <p className="meta">Search gaps</p>
          <p className="admin-stat-card__value">{formatNumber(report.counts.zeroResultSearches)}</p>
        </div>
      </div>

      <PageTable
        empty="No active pages are past their review date."
        heading="Stale or overdue reviews"
        pages={report.stalePages}
        totalCount={report.counts.stalePages}
      />
      <PageTable
        empty="All active pages have at least one tag."
        dateField="updated"
        heading="Pages missing tags"
        pages={report.missingTags}
        issueColumn="Last updated"
        totalCount={report.counts.missingTags}
      />
      <PageTable
        empty="All active pages have the required governance metadata."
        heading="Pages missing metadata"
        issueColumn="Issues"
        pages={report.missingMetadata}
        totalCount={report.counts.missingMetadata}
      />
      <PageTable
        empty="No proposed pages are waiting for review."
        dateField="updated"
        heading="Proposed pages waiting"
        issueColumn="Updated"
        pages={report.proposedPages}
        totalCount={report.counts.proposedPages}
      />

      <section className="admin-panel" style={{ marginTop: "1.5rem" }}>
        <h2 className="admin-panel__title">
          Zero-result searches ({formatNumber(report.zeroResultSearches.length)})
        </h2>
        {report.zeroResultSearches.length === 0 ? (
          <p className="admin-panel__empty">No zero-result searches have been recorded.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Knowledge base</th>
                  <th>Count</th>
                  <th>Last searched</th>
                </tr>
              </thead>
              <tbody>
                {report.zeroResultSearches.map((gap) => (
                  <tr key={`${gap.kbId ?? "global"}-${gap.query.toLowerCase()}`}>
                    <td>{gap.query}</td>
                    <td>{gap.kbTitle}</td>
                    <td>{formatNumber(gap.count)}</td>
                    <td>{formatDate(gap.lastSearchedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-panel" style={{ marginTop: "1.5rem" }}>
        <h2 className="admin-panel__title">Stale asset references ({formatNumber(staleAssetRefs.length)})</h2>
        <p className="meta">
          Pages referencing archived, missing, or staff-only assets on public pages. Open the page or asset to remediate.
        </p>
        {staleAssetRefs.length === 0 ? (
          <p className="admin-panel__empty">No stale asset references detected.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Asset</th>
                  <th>Issue</th>
                  <th>Use</th>
                </tr>
              </thead>
              <tbody>
                {staleAssetRefs.map((item) => (
                  <tr key={`${item.pageId}-${item.assetId}-${item.blockId ?? item.usageType}`}>
                    <td>
                      <Link href={`/admin/pages/${item.pageId}`}>{item.pageTitle}</Link>
                      <div className="meta">{item.kbTitle}</div>
                    </td>
                    <td>
                      <Link href={`/admin/assets/${item.assetId}`}>{item.assetTitle}</Link>
                      <div className="meta">{item.assetStatus}</div>
                    </td>
                    <td>{item.issue.replace(/_/g, " ")}</td>
                    <td>{item.usageType.replace(/_/g, " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-panel" style={{ marginTop: "1.5rem" }}>
        <h2 className="admin-panel__title">Stale excerpts ({formatNumber(staleExcerpts.length)})</h2>
        {staleExcerpts.length === 0 ? (
          <p className="admin-panel__empty">No excerpt blocks are behind their source pages.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Page with excerpt</th>
                  <th>Source page</th>
                  <th>Source updated</th>
                </tr>
              </thead>
              <tbody>
                {staleExcerpts.map((item) => (
                  <tr key={`${item.pageId}-${item.excerptBlockId}`}>
                    <td>
                      <Link href={`/admin/pages/${item.pageId}`}>{item.pageTitle}</Link>
                    </td>
                    <td>
                      <Link href={`/admin/pages/${item.sourcePageId}`}>{item.sourceTitle}</Link>
                    </td>
                    <td>{item.sourceUpdatedDisplayDate || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
