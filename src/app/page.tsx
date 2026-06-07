import type { Metadata } from "next";
import Link from "next/link";
import { PageBlocks } from "@/components/PageBlocks";
import { getCurrentAdminSession } from "@/lib/auth";
import { getPublishedKbs } from "@/lib/kb-store";
import { loadSiteSettings } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";
import { DEFAULT_THEME, themeToCssVars } from "@/lib/kb-theme";
import type { KnowledgeBase } from "@/lib/types";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "WSU Knowledge Base",
  description:
    "Washington State University knowledge base platform. Browse published knowledge bases, including the Graduate School knowledge base.",
};

interface HomeKb extends KnowledgeBase {
  isDraft: boolean;
}

async function getHomeKbs(): Promise<HomeKb[]> {
  const published = await getPublishedKbs();
  const list: HomeKb[] = published.map((kb) => ({ ...kb, isDraft: false }));

  const session = await getCurrentAdminSession();
  if (session?.role === "editor") {
    const { accessibleKbIds } = await import("@/lib/auth");
    const { getAllKbsForAdmin } = await import("@/lib/kb-store");
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
  const homeTitle = settings.homeTitle || DEFAULT_SITE_SETTINGS.homeTitle;

  const themeVars = themeToCssVars(settings.globalTheme || DEFAULT_THEME) as CSSProperties;

  return (
    <div className="kb-theme-root" style={themeVars}>
      <section className="hero">
        <div className="site-header__inner">
          <div>
            {settings.homeEyebrow && <p className="eyebrow">{settings.homeEyebrow}</p>}
            <h1>{homeTitle}</h1>
            {settings.homeIntro && <p className="lead">{settings.homeIntro}</p>}
          </div>
        </div>
      </section>

      <div className="page-shell">
        <PageBlocks blocks={settings.homeBlocks} />

        {settings.showKbList && (
          <div style={{ marginTop: "3rem" }}>
            <h2>{settings.kbListTitle}</h2>
            {kbs.length === 0 && (
              <div className="empty">
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
        )}
      </div>
    </div>
  );
}
