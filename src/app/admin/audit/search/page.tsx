import Link from "next/link";
import { redirect } from "next/navigation";
import { listAuditEvents } from "@/lib/audit-log";
import { getCurrentAdminSession } from "@/lib/auth";

export const runtime = "nodejs";

export default async function SearchGapPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/audit/search");
  }
  if (session.role === "editor") {
    redirect("/admin");
  }

  const events = await listAuditEvents({ entityType: "search" });
  const zeroResults = events.filter((e) => (e.details?.resultCount as number) === 0);

  const gaps = new Map<string, number>();
  for (const event of zeroResults) {
    const term = event.entityLabel.toLowerCase().trim();
    if (term) {
      gaps.set(term, (gaps.get(term) || 0) + 1);
    }
  }

  const sortedGaps = Array.from(gaps.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);

  return (
    <div className="page-shell">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/admin">Dashboard</Link>
          </li>
          <li>
            <Link href="/admin/audit">Audit Log</Link>
          </li>
          <li>
            <span aria-current="page">Search Gaps</span>
          </li>
        </ol>
      </nav>

      <h1>Search Gap Analysis</h1>
      <p className="lead">
        These terms were searched by users but returned zero results. Use this to identify missing content.
      </p>

      <div className="table-wrap" style={{ marginTop: "2rem" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Search Term</th>
              <th>Failed Search Count</th>
            </tr>
          </thead>
          <tbody>
            {sortedGaps.map(([term, count]) => (
              <tr key={term}>
                <td>
                  <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>{term}</span>
                </td>
                <td>{count}</td>
              </tr>
            ))}
            {sortedGaps.length === 0 && (
              <tr>
                <td className="meta" colSpan={2}>
                  No zero-result searches recorded in the audit retention window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
