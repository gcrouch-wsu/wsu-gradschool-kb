import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSearchGapsTable } from "@/components/admin/AdminSearchGapsTable";
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

  const gapRows = sortedGaps.map(([term, count]) => ({ term, count }));

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

      <div style={{ marginTop: "2rem" }}>
        <AdminSearchGapsTable gaps={gapRows} />
      </div>
    </div>
  );
}
