import Link from "next/link";
import { getAllKbsForAdmin, getPublishedKbs } from "@/lib/kb-store";
import { loadSiteSettings } from "@/lib/db";
import { accessibleKbIds, getCurrentAdminSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { KnowledgeBase } from "@/lib/types";

interface HomeKb extends KnowledgeBase {
  isDraft: boolean;
}

/**
 * The home list shows published KBs to everyone. A signed-in editor additionally
 * sees the KBs they are assigned to (including drafts), surfaced with a badge.
 */
async function getHomeKbs(): Promise<HomeKb[]> {
  const published = await getPublishedKbs();
  const list: HomeKb[] = published.map((kb) => ({ ...kb, isDraft: false }));

  const session = await getCurrentAdminSession();
  if (session?.role === "editor") {
    const allowed = await accessibleKbIds(session);
    if (allowed && allowed.length > 0) {
      const publishedIds = new Set(published.map((kb) => kb.id));
      const all = await getAllKbsForAdmin();
      for (const kb of all) {
        if (allowed.includes(kb.id) && !publishedIds.has(kb.id)) {
          list.push({ ...kb, isDraft: kb.status !== "published" });
        }
      }
    }
  }

  return list;
}

export default async function HomePage() {
  const [settings, kbs] = await Promise.all([loadSiteSettings(), getHomeKbs()]);

  return (
    <>
      <section className="hero">
        <div className="site-header__inner">
          <div>
            {settings.homeEyebrow && <p className="eyebrow">{settings.homeEyebrow}</p>}
            {settings.homeTitle && <h1>{settings.homeTitle}</h1>}
            {settings.homeIntro && <p className="lead">{settings.homeIntro}</p>}
          </div>
        </div>
      </section>
      <div className="page-shell">
        <h2>Published knowledge bases</h2>
        {kbs.length === 0 && (
          <div className="empty">
            <svg
              aria-hidden="true"
              fill="none"
              height="48"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
              width="48"
              xmlns="http://www.w3.org/2000/svg"
              style={{ margin: "0 auto" }}
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
            <p>No knowledge bases are published yet. Check back soon for guides and resources.</p>
          </div>
        )}
        {kbs.length > 0 && (
          <ul className="kb-list">
            {kbs.map((kb) => (
              <li className="kb-list__item" key={kb.id}>
                <div className="kb-list__main">
                  <h3 className="kb-list__title">
                    <Link href={`/kb/${kb.slug}`}>{kb.title}</Link>
                    {kb.isDraft && <span className="badge badge--draft">Draft</span>}
                  </h3>
                  {kb.description && <p className="kb-list__desc">{kb.description}</p>}
                </div>
                <p className="kb-list__meta meta">Updated {formatDate(kb.updatedOn)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
