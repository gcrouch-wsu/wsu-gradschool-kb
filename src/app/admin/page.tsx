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
        <article className="card">
          <h2>Knowledge Bases</h2>
          <p>{counts.publishedKbs} published KB</p>
        </article>
        <article className="card">
          <h2>Pages</h2>
          <p>{counts.publishedPages} published pages</p>
        </article>
        <article className="card">
          <h2>Assets</h2>
          <p>{counts.activeAssets} active assets</p>
        </article>
        <article className="card">
          <h2>Storage</h2>
          <p>
            {counts.storageMode === "neon"
              ? "Reading from Neon Postgres. Schema auto-creates and seeds on first run."
              : "Using in-memory seed data. Set DATABASE_URL to persist to Neon."}
          </p>
        </article>
      </div>
    </div>
  );
}
