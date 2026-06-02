import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/auth";
import { assets, getPublishedKbs, pages } from "@/lib/demo-data";

export default async function AdminPage() {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin");
  }

  const kbs = getPublishedKbs();
  const publishedPages = pages.filter((page) => page.status === "published");
  const activeAssets = assets.filter((asset) => asset.status === "active");

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>Knowledge Base Admin</h1>
      <p className="lead">
        Signed in as {session.email}. This deployable shell is ready for the persistent Postgres and Blob-backed
        implementation phases.
      </p>
      <p>
        <Link className="button" href="/api/admin/logout">
          Sign out
        </Link>
      </p>
      <div className="grid grid--two">
        <article className="card">
          <h2>Knowledge Bases</h2>
          <p>{kbs.length} published KB</p>
        </article>
        <article className="card">
          <h2>Pages</h2>
          <p>{publishedPages.length} published pages</p>
        </article>
        <article className="card">
          <h2>Assets</h2>
          <p>{activeAssets.length} active assets</p>
        </article>
        <article className="card">
          <h2>Next Build Phase</h2>
          <p>Wire Postgres schema, direct-to-blob upload, and managed asset version storage.</p>
        </article>
      </div>
    </div>
  );
}
