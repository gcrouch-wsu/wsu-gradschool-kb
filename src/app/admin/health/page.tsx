import Link from "next/link";
import { redirect } from "next/navigation";
import { accessibleKbIds, getCurrentAdminSession } from "@/lib/auth";
import { getContentHealthReport, type ContentHealthPageItem } from "@/lib/content-health";

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
}: {
  empty: string;
  heading: string;
  dateField?: "review" | "updated";
  pages: ContentHealthPageItem[];
  issueColumn?: string;
}) {
  return (
    <section className="admin-panel" style={{ marginTop: "1.5rem" }}>
      <h2 className="admin-panel__title">
        {heading} ({formatNumber(pages.length)})
      </h2>
      {pages.length === 0 ? (
        <p className="admin-panel__empty">{empty}</p>
      ) : (
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
      />
      <PageTable
        empty="All active pages have at least one tag."
        dateField="updated"
        heading="Pages missing tags"
        pages={report.missingTags}
        issueColumn="Last updated"
      />
      <PageTable
        empty="All active pages have the required governance metadata."
        heading="Pages missing metadata"
        issueColumn="Issues"
        pages={report.missingMetadata}
      />
      <PageTable
        empty="No proposed pages are waiting for review."
        dateField="updated"
        heading="Proposed pages waiting"
        issueColumn="Updated"
        pages={report.proposedPages}
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
    </div>
  );
}
