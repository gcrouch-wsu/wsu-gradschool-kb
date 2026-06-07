import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { PageTree } from "@/components/PageTree";
import { getCurrentAdminSession } from "@/lib/auth";
import { buildPageTree, getKbBySlug } from "@/lib/kb-store";
import { formatDate } from "@/lib/format";
import { DEFAULT_THEME, themeToCssVars } from "@/lib/kb-theme";

export default async function KbHomePage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) {
    notFound();
  }

  const isStaff = Boolean(await getCurrentAdminSession());
  const tree = await buildPageTree(kb.id, isStaff);
  const topLevel = tree.map((node) => node.page);
  const themeVars = themeToCssVars(kb.theme ?? DEFAULT_THEME) as CSSProperties;

  return (
    <div className="kb-theme-root" style={themeVars}>
      <section className="hero">
        <div className="site-header__inner">
          <div>
            <h1>{kb.title}</h1>
            <p className="lead">{kb.description}</p>
            <form action={`/kb/${kb.slug}/search`} className="kb-search" role="search">
              <label>
                <span className="meta">Search this knowledge base</span>
                <input
                  className="input"
                  name="q"
                  placeholder={`Search ${kb.title}…`}
                  type="search"
                />
              </label>
              <button className="button" type="submit" style={{ alignSelf: "end" }}>
                Search
              </button>
            </form>
          </div>
        </div>
      </section>
      <div className="page-shell">
        <div className="layout">
          <aside className="sidebar page-tree" aria-label="Knowledge base navigation">
            <strong>Browse {kb.title}</strong>
            <PageTree kbSlug={kb.slug} nodes={tree} />
          </aside>
          <div>
            <h2>Sections</h2>
            {topLevel.length === 0 && (
              <p className="empty">No published sections yet. Check back soon.</p>
            )}
            <div className="grid grid--two">
              {topLevel.map((page) => (
                <article className="card" key={page.id}>
                  <h3>
                    <Link href={`/kb/${kb.slug}/${page.path.join("/")}`}>{page.title}</Link>
                    {page.visibility === "staff" && <span className="badge badge--staff"> Staff</span>}
                    {page.verifiedAt && <span className="badge badge--verified"> ✓ Verified</span>}
                  </h3>
                  <p>{page.summary}</p>
                  <p className="meta">Updated on {formatDate(page.updatedDisplayDate)}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
