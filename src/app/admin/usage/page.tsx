import Link from "next/link";
import { StatCard } from "@/components/admin/StatCard";
import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/auth";
import { getEditorialAnalytics } from "@/lib/editorial-analytics";
import { getUsageAnalyticsForSession, type UsagePeriod } from "@/lib/page-views";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function UsagePeriodSection({ period }: { period: UsagePeriod }) {
  return (
    <section className="admin-panel" style={{ marginTop: "1.5rem" }}>
      <h2 className="admin-panel__title">Last {period.days} days</h2>
      <div className="grid grid--two">
        <div className="card">
          <p className="meta">Total page views</p>
          <p className="admin-stat-card__value">{formatNumber(period.totalViews)}</p>
        </div>
        <div className="card">
          <p className="meta">Knowledge bases with traffic</p>
          <p className="admin-stat-card__value">{formatNumber(period.kbTotals.length)}</p>
        </div>
      </div>

      <h3>Top pages</h3>
      {period.topPages.length === 0 ? (
        <p className="admin-panel__empty">No page views recorded in this period.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Knowledge base</th>
                <th>Views</th>
              </tr>
            </thead>
            <tbody>
              {period.topPages.map((page) => (
                <tr key={`${period.days}-${page.pageId}`}>
                  <td>
                    <Link href={`/admin/pages/${page.pageId}`}>{page.title}</Link>
                    <div className="meta">/{page.path}</div>
                  </td>
                  <td>{page.kbTitle}</td>
                  <td>{formatNumber(page.viewCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Knowledge bases</h3>
      {period.kbTotals.length === 0 ? (
        <p className="admin-panel__empty">No KB totals recorded in this period.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Knowledge base</th>
                <th>Views</th>
              </tr>
            </thead>
            <tbody>
              {period.kbTotals.map((kb) => (
                <tr key={`${period.days}-${kb.kbId}`}>
                  <td>{kb.kbTitle}</td>
                  <td>{formatNumber(kb.viewCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function AdminUsagePage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/usage");
  }
  if (session.role === "viewer") {
    redirect("/");
  }

  const [analytics, editorial] = await Promise.all([
    getUsageAnalyticsForSession(session),
    getEditorialAnalytics(session),
  ]);

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Usage</h1>
      <p className="lead">
        Privacy-light page-view counts plus editorial signals, reader feedback, and search gaps.
      </p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>

      <section className="admin-panel" style={{ marginTop: "1.5rem" }}>
        <h2 className="admin-panel__title">Editorial overview</h2>
        <div className="admin-dashboard__stats">
          <StatCard href="/admin/health" icon="file-pen" label="Stale pages" tone="amber" value={editorial.health.stalePages} />
          <StatCard href="/admin/review" icon="file-check" label="Proposed pages" tone="blue" value={editorial.health.proposedPages} />
          <StatCard href="/admin/excerpts" icon="book-open" label="Stale excerpts" tone="gray" value={editorial.staleExcerptCount} />
          <StatCard href="/admin/health" icon="folder-open" label="Stale asset refs" tone="green" value={editorial.staleAssetRefCount} />
        </div>
        <div className="grid grid--three" style={{ marginTop: "1rem" }}>
          <div className="card">
            <p className="meta">Views (7 days)</p>
            <strong>{formatNumber(editorial.usageSummary.views7d)}</strong>
          </div>
          <div className="card">
            <p className="meta">Views (30 days)</p>
            <strong>{formatNumber(editorial.usageSummary.views30d)}</strong>
          </div>
          <div className="card">
            <p className="meta">Top KB (30 days)</p>
            <strong>{editorial.usageSummary.topKbTitle ?? "—"}</strong>
            {editorial.usageSummary.topKbViews > 0 ? (
              <p className="meta">{formatNumber(editorial.usageSummary.topKbViews)} views</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="admin-panel" style={{ marginTop: "1.5rem" }}>
        <h2 className="admin-panel__title">Low helpfulness (3+ responses)</h2>
        {editorial.feedback.helpfulRatioLow.length === 0 ? (
          <p className="admin-panel__empty">No pages with enough feedback to rank yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Helpful %</th>
                  <th>Votes</th>
                </tr>
              </thead>
              <tbody>
                {editorial.feedback.helpfulRatioLow.map((row) => (
                  <tr key={row.pageId}>
                    <td>
                      <Link href={`/admin/pages/${row.pageId}`}>{row.pageTitle}</Link>
                    </td>
                    <td>{row.ratio}%</td>
                    <td>
                      {row.helpful} / {row.helpful + row.notHelpful}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-panel" style={{ marginTop: "1.5rem" }}>
        <h2 className="admin-panel__title">Zero-result searches</h2>
        {editorial.searchGaps.length === 0 ? (
          <p className="admin-panel__empty">No logged zero-result searches in the recent window.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Knowledge base</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {editorial.searchGaps.map((row) => (
                  <tr key={`${row.query}-${row.kbId ?? "all"}`}>
                    <td>{row.query}</td>
                    <td>{row.kbTitle}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!analytics.enabled ? (
        <section className="admin-panel" style={{ marginTop: "1.5rem" }}>
          <h2 className="admin-panel__title">Database required</h2>
          <p className="admin-panel__empty">
            Usage analytics are recorded only when DATABASE_URL is configured. In-memory development mode does not
            persist page views.
          </p>
        </section>
      ) : (
        analytics.periods.map((period) => <UsagePeriodSection key={period.days} period={period} />)
      )}
    </div>
  );
}
