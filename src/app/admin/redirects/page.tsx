import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminRedirectsManager } from "@/components/AdminRedirectsManager";
import { filterKbsForSession, getCurrentAdminSession } from "@/lib/auth";
import { getAllKbsForAdmin, getRedirectsForAdmin } from "@/lib/kb-store";

export default async function AdminRedirectsPage({
  searchParams,
}: {
  searchParams: Promise<{ kb?: string }>;
}) {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in?next=/admin/redirects");
  }

  const { kb: kbFilter } = await searchParams;
  const kbs = await filterKbsForSession(session, await getAllKbsForAdmin());
  const activeKb = kbs.find((kb) => kb.id === kbFilter) ?? kbs[0];
  const redirects = activeKb ? await getRedirectsForAdmin(activeKb.id) : [];

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>URL redirects</h1>
      <p className="lead">
        Map legacy paths to current KB pages. Useful when migrating from Confluence or renaming
        published URLs.
      </p>
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>

      <form className="form card" action="/admin/redirects" style={{ marginTop: "1.5rem" }}>
        <label>
          <span className="meta">Knowledge base</span>
          <select className="input" defaultValue={activeKb?.id ?? ""} name="kb">
            {kbs.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.title}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit">
          Switch KB
        </button>
      </form>

      {activeKb && (
        <AdminRedirectsManager
          initialRedirects={redirects}
          kbId={activeKb.id}
          kbSlug={activeKb.slug}
        />
      )}
    </div>
  );
}
