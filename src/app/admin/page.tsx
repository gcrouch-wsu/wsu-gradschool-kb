import Link from "next/link";
import { Plus } from "lucide-react";
import type { ActivityIconName } from "@/components/admin/admin-icons";
import { ActivityItem } from "@/components/admin/ActivityItem";
import { PageStatusDonut } from "@/components/admin/PageStatusDonut";
import { StatCard } from "@/components/admin/StatCard";
import { listAuditEvents } from "@/lib/audit-log";
import { auditEntityTone, formatAuditAction, formatRelativeTime } from "@/lib/format-audit";
import { getAdminCounts } from "@/lib/kb-store";
import { getStagedImportCounts } from "@/lib/staged-imports";

export default async function AdminPage() {
  const [counts, stagedCounts, events] = await Promise.all([
    getAdminCounts(),
    getStagedImportCounts(),
    listAuditEvents({}),
  ]);

  const storageLabel =
    counts.storageMode === "neon" ? "Neon Postgres" : "In-memory seed (no DATABASE_URL)";
  const recentEvents = events.slice(0, 8);

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard__header">
        <div>
          <p className="admin-dashboard__eyebrow">{storageLabel}</p>
          <h1 className="admin-dashboard__title">Dashboard</h1>
        </div>
        <Link className="button admin-dashboard__cta" href="/admin/pages/new">
          <Plus aria-hidden size={18} strokeWidth={1.75} />
          New page
        </Link>
      </div>

      <div className="admin-dashboard__stats">
        <StatCard
          href="/admin/kbs"
          icon="book-open"
          label="Published knowledge bases"
          tone="blue"
          value={counts.publishedKbs}
        />
        <StatCard
          href="/admin/pages"
          icon="file-check"
          label="Published pages"
          tone="green"
          value={counts.publishedPages}
        />
        <StatCard icon="file-pen" href="/admin/pages?status=draft" label="Draft pages" tone="amber" value={counts.draftPages} />
        <StatCard
          href="/admin/assets?status=active"
          icon="folder-open"
          label="Active assets"
          tone="gray"
          value={counts.activeAssets}
        />
      </div>

      <div className="admin-dashboard__panels">
        <section aria-labelledby="pages-by-status-title" className="admin-panel">
          <h2 className="admin-panel__title" id="pages-by-status-title">
            Pages by status
          </h2>
          <PageStatusDonut
            archived={counts.archivedPages}
            draft={counts.draftPages}
            published={counts.publishedPages}
          />
        </section>

        <section aria-labelledby="recent-activity-title" className="admin-panel">
          <h2 className="admin-panel__title" id="recent-activity-title">
            Recent activity
          </h2>
          {recentEvents.length === 0 ? (
            <p className="admin-panel__empty">No recent activity yet.</p>
          ) : (
            <ul className="admin-activity-feed">
              {recentEvents.map((entry) => (
                  <ActivityItem
                    action={formatAuditAction(entry)}
                    actor={entry.actorEmail}
                    icon={auditEntityTone(entry.entityType) as ActivityIconName}
                    key={entry.id}
                    time={formatRelativeTime(entry.createdAt)}
                  />
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="admin-info-banner" role="status">
        <p>
          {counts.storageMode === "neon" ? (
            <>
              Reading from <strong>Neon Postgres</strong>. Schema auto-creates and seeds on first run.
            </>
          ) : (
            <>
              Using <strong>in-memory seed data</strong>. Set <code>DATABASE_URL</code> to persist to Neon.
            </>
          )}
          {stagedCounts.needsReview > 0 && (
            <>
              {" "}
              <Link href="/admin/import">{stagedCounts.needsReview} staged import(s) awaiting review.</Link>
            </>
          )}
          {counts.archivedAssets > 0 && (
            <>
              {" "}
              {counts.archivedAssets} archived asset{counts.archivedAssets === 1 ? "" : "s"} in the library.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
