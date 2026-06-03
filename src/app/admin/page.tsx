import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/auth";
import { getAdminCounts } from "@/lib/kb-store";

export default async function AdminPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin");
  }

  const counts = await getAdminCounts();
  const storageLabel = counts.storageMode === "neon" ? "Neon Postgres" : "In-memory seed (no DATABASE_URL)";

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Knowledge Base Admin</h1>
      <p className="lead">
        Signed in as {session.email}. Content store: <strong>{storageLabel}</strong>.
      </p>
      <div className="admin-actions">
        <Link className="button" href="/admin/pages">
          Manage pages
        </Link>
        <Link className="button" href="/admin/import">
          Import from Word (.docx)
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
          <span className="stat-card__value">{counts.activeAssets}</span>
          <span className="stat-card__label">Active assets</span>
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
