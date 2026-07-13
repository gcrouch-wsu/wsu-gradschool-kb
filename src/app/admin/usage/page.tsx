import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/auth";
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

  const analytics = await getUsageAnalyticsForSession(session);

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Usage</h1>
      <p className="lead">Privacy-light page-view counts for published public article and KB-homepage renders.</p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>

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
