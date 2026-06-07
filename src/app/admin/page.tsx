import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/auth";
import { getAdminCounts } from "@/lib/kb-store";
import { getStagedImportCounts } from "@/lib/staged-imports";

export default async function AdminPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin");
  }

  const [counts, stagedCounts] = await Promise.all([getAdminCounts(), getStagedImportCounts()]);
  const storageLabel = counts.storageMode === "neon" ? "Neon Postgres" : "In-memory seed (no DATABASE_URL)";

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Knowledge Base Admin</h1>
      <p className="lead">
        Signed in as {session.email} ({session.role}). Content store: <strong>{storageLabel}</strong>.
      </p>
      <div className="admin-actions">
        <Link className="button" href="/admin/pages">
          Manage pages
        </Link>
        <Link className="button" href="/admin/assets">
          Manage assets
        </Link>
        {session.role === "owner" && (
          <>
            <Link className="button" href="/admin/kbs">
              Manage KBs
            </Link>
            <Link className="button" href="/admin/users">
              Manage users
            </Link>
            <Link className="button" href="/admin/settings">
              Site settings
            </Link>
          </>
        )}
        <Link className="button" href="/admin/review">
          Review dashboard
        </Link>
        {(session.role === "owner" || session.role === "admin") && (
          <Link className="button button--ghost" href="/admin/audit">
            Audit log
          </Link>
        )}
        <Link className="button" href="/admin/import">
          Import from Word (.docx)
        </Link>
        <Link className="button button--ghost" href="/admin/redirects">
          URL redirects
        </Link>
        <form action="/api/admin/logout" method="post">
          <button className="button button--ghost" type="submit">
            Sign out
          </button>
        </form>
      </div>
      <div className="grid grid--two">
        <article className="card stat-card">
          <span className="stat-card__value">{counts.publishedKbs}</span>
          <span className="stat-card__label">Published knowledge bases</span>
        </article>
        <article className="card stat-card">
          <span className="stat-card__value">{counts.publishedPages}</span>
          <span className="stat-card__label">Published pages</span>
        </article>
        <article className="card stat-card">
          <span className="stat-card__value">{counts.draftPages}</span>
          <span className="stat-card__label">Draft pages</span>
        </article>
        <article className="card stat-card">
          <span className="stat-card__value">{counts.archivedPages}</span>
          <span className="stat-card__label">Archived pages</span>
        </article>
        <article className="card stat-card">
          <span className="stat-card__value">{counts.activeAssets}</span>
          <span className="stat-card__label">Active assets</span>
        </article>
        <article className="card stat-card">
          <span className="stat-card__value">{counts.archivedAssets}</span>
          <span className="stat-card__label">Archived assets</span>
        </article>
        <article className="card stat-card">
          <span className="stat-card__value">{stagedCounts.needsReview}</span>
          <span className="stat-card__label">Staged imports awaiting review</span>
        </article>
        <article className="card">
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Storage</h2>
          <p className="meta">
            {counts.storageMode === "neon"
              ? "Reading from Neon Postgres. Schema auto-creates and seeds on first run."
              : "Using in-memory seed data. Set DATABASE_URL to persist to Neon."}
          </p>
        </article>
      </div>
    </div>
  );
}
