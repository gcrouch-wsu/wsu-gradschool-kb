import { HOME_KB_PAGE_SIZE, KbListPagination } from "@/components/KbListPagination";
import { HomeSearchWidget } from "@/components/KbSearchWidget";
import { PageBlocks } from "@/components/PageBlocks";
import { filterKbsForReadAccess, getCurrentAdminSession } from "@/lib/auth";
import { filterHomeKbs, paginateHomeKbs } from "@/lib/home-kb-filter";
import { getAllKbsForAdmin, getPublishedKbs } from "@/lib/kb-store";
import { loadSiteSettings } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { DEFAULT_THEME, fontStack, mergeTheme, themeToCssVars } from "@/lib/kb-theme";
import type { KnowledgeBase } from "@/lib/types";
import type { CSSProperties } from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WSU Knowledge Base",
  description:
    "Washington State University knowledge base platform. Browse published knowledge bases, including the Graduate School knowledge base.",
};

interface HomeKb extends KnowledgeBase {
  isDraft: boolean;
}

async function getHomeKbs(): Promise<HomeKb[]> {
  const session = await getCurrentAdminSession();
  const source = session ? await getAllKbsForAdmin() : await getPublishedKbs();
  const readable = await filterKbsForReadAccess(session, source);
  const list: HomeKb[] = readable.map((kb) => ({ ...kb, isDraft: kb.status !== "published" }));

  return list.sort((a, b) => b.updatedOn.localeCompare(a.updatedOn));
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ kbPage?: string; q?: string }>;
}) {
  const { kbPage, q } = await searchParams;
  const filterQuery = (q ?? "").trim();
  const [settings, kbs] = await Promise.all([loadSiteSettings(), getHomeKbs()]);
  const filteredKbs = filterHomeKbs(kbs, filterQuery);
  const requestedPage = Math.max(1, Number.parseInt(kbPage ?? "1", 10) || 1);
  const { pageItems: pageKbs, currentPage, totalPages } = paginateHomeKbs(
    filteredKbs,
    requestedPage,
    HOME_KB_PAGE_SIZE,
  );
  const globalTheme = mergeTheme(settings.globalTheme || DEFAULT_THEME);

  const themeVars: CSSProperties = {
    ...(themeToCssVars(globalTheme) as CSSProperties),
    ...(settings.contentWidth ? { "--content-width": `${settings.contentWidth}px` } : {}),
  };  

  const heroAlignClass =
    settings.heroAlignment === "center"
      ? " is-center"
      : settings.heroAlignment === "right"
        ? " is-right"
        : "";

  const hasHero = Boolean(settings.homeEyebrow || settings.homeTitle || settings.homeIntro);

  const kbListTitleStyle: CSSProperties = {
    ...(settings.kbListTitleColor ? { color: settings.kbListTitleColor } : {}),
    ...(settings.kbListTitleSize ? { fontSize: settings.kbListTitleSize } : {}),
    ...(settings.kbListTitleWeight ? { fontWeight: Number(settings.kbListTitleWeight) } : {}),
    ...(settings.kbListTitleFont ? { fontFamily: fontStack(settings.kbListTitleFont) } : {}),
  };

  return (
    <div className="kb-theme-root" style={themeVars}>
      {hasHero && (
        <section className={`hero${heroAlignClass}`}>
          <div className="site-header__inner">
            <div>
              {settings.homeEyebrow && <p className="eyebrow">{settings.homeEyebrow}</p>}
              {settings.homeTitle && <h1>{settings.homeTitle}</h1>}
              {settings.homeIntro && <p className="lead">{settings.homeIntro}</p>}
            </div>
          </div>
        </section>
      )}

      <div className="page-shell">
        {/* One flow container so the home content AND the KB-list section share the
            owner-controlled spacing (block rhythm + space-after-heading). */}
        <div className="flow">
          <PageBlocks blocks={settings.homeBlocks} />

          {settings.showHomeSearch && <HomeSearchWidget />}

          {settings.showKbList && (
            <>
              <h2 style={kbListTitleStyle}>{settings.kbListTitle}</h2>
              {kbs.length === 0 ? (
                <div className="empty">
                  <p>No knowledge bases are published yet. Check back soon for guides and resources.</p>
                </div>
              ) : (
                <>
                  <form aria-label="Filter knowledge bases" className="kb-list__filter" method="get">
                    <label className="sr-only" htmlFor="kb-list-filter">
                      Filter knowledge bases
                    </label>
                    <input
                      className="input"
                      defaultValue={filterQuery}
                      id="kb-list-filter"
                      name="q"
                      placeholder="Filter by title or description"
                      type="search"
                    />
                    <button className="button button--small" type="submit">
                      Filter
                    </button>
                    {filterQuery ? (
                      <Link className="button button--small button--ghost" href="/">
                        Clear
                      </Link>
                    ) : null}
                  </form>
                  {filteredKbs.length === 0 ? (
                    <p className="meta">No knowledge bases match “{filterQuery}”.</p>
                  ) : (
                    <>
                      <ul className="kb-list">
                        {pageKbs.map((kb) => (
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
                      <KbListPagination
                        currentPage={currentPage}
                        query={filterQuery}
                        totalItems={filteredKbs.length}
                        totalPages={totalPages}
                      />
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
