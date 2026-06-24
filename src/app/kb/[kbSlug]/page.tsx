import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { PageBlocks } from "@/components/PageBlocks";
import { PageTree } from "@/components/PageTree";
import { PrintPdfButton } from "@/components/PrintPdfButton";
import { TableOfContents } from "@/components/TableOfContents";
import { getCurrentAdminSession } from "@/lib/auth";
import { buildPageTree, getAssetById, getKbById, getKbBySlug, getKbHomepagePage } from "@/lib/kb-store";
import { formatBytes, formatDate, formatTimestamp } from "@/lib/format";
import { DEFAULT_THEME, mergeTheme, themeToCssVars } from "@/lib/kb-theme";
import { loadSiteSettings } from "@/lib/db";
import { hasTocEntries } from "@/lib/toc";

export default async function KbHomePage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const isStaff = Boolean(await getCurrentAdminSession());
  const kb = await getKbBySlug(kbSlug, isStaff);
  if (!kb) {
    notFound();
  }

  const settings = await loadSiteSettings();
  const tree = await buildPageTree(kb.id, isStaff);
  const topLevel = tree.map((node) => node.page);
  const homepagePage = await getKbHomepagePage(kb.id, isStaff);

  const baseTheme = mergeTheme(settings.globalTheme || DEFAULT_THEME);
  const effectiveTheme = kb.theme ? mergeTheme(kb.theme, baseTheme) : baseTheme;
  const themeVars = themeToCssVars(effectiveTheme) as CSSProperties;

  if (homepagePage) {
    const relatedAssets = (
      await Promise.all(homepagePage.relatedAssetIds.map((assetId) => getAssetById(assetId)))
    ).filter((asset) => asset !== null);
    const relatedFiles = await Promise.all(
      relatedAssets.map(async (asset) => {
        const homeKb = await getKbById(asset.homeKbId);
        return { asset, href: homeKb ? `/kb/${homeKb.slug}/files/${asset.slug}` : "#" };
      }),
    );
    const showTocRail = homepagePage.showToc && hasTocEntries(homepagePage.blocks, homepagePage.tocDepth);
    const verifiedLabel = homepagePage.verifiedAt
      ? `Verified${homepagePage.verifiedBy ? ` by ${homepagePage.verifiedBy}` : ""} on ${formatTimestamp(homepagePage.verifiedAt)}`
      : "";

    return (
      <div className="page-shell kb-theme-root" style={themeVars}>
        <div className={`layout${showTocRail ? " layout--with-toc" : ""}`}>
          <aside className="sidebar page-tree" aria-label="Knowledge base navigation">
            <strong>{kb.title}</strong>
            <PageTree
              currentPageId={homepagePage.id}
              homepagePageId={kb.homepagePageId}
              kbSlug={kb.slug}
              nodes={tree}
            />
          </aside>
          <article className="article flow">
            <p className="eyebrow">
              Knowledge Base
              {homepagePage.status === "draft" && <span className="badge badge--draft"> Draft</span>}
              {homepagePage.visibility === "staff" && <span className="badge badge--staff"> Staff only</span>}
              {homepagePage.verifiedAt && (
                <span className="badge badge--verified" aria-label={verifiedLabel} title={verifiedLabel}>
                  <span aria-hidden="true">✓</span> Verified
                </span>
              )}
            </p>
            {isStaff && (
              <p className="admin-inline-actions">
                <Link className="button button--small" href={`/admin/pages/${homepagePage.id}`}>
                  Edit homepage
                </Link>
              </p>
            )}
            <h1>{homepagePage.title}</h1>
            {homepagePage.showSummary !== false && homepagePage.summary && <p className="lead">{homepagePage.summary}</p>}
            <div className="article-meta-row">
              <p className="meta">Updated on {formatDate(homepagePage.updatedDisplayDate)}</p>
              {homepagePage.showPrintButton !== false && <PrintPdfButton />}
            </div>

            <PageBlocks blocks={homepagePage.blocks} />

            {relatedFiles.length > 0 && (
              <>
                <h2>Related Files</h2>
                <div className="grid">
                  {relatedFiles.map(({ asset, href }) => (
                    <div className="asset-link" key={asset.id}>
                      <div aria-hidden="true">File</div>
                      <div>
                        <strong>
                          <Link href={href}>{asset.title}</Link>
                        </strong>
                        <p>{asset.description}</p>
                        <p className="meta">
                          {asset.mimeType.split(";")[0]} · {formatBytes(asset.fileSizeBytes)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>
          {showTocRail && (
            <aside className="toc-rail">
              <TableOfContents blocks={homepagePage.blocks} showToc={homepagePage.showToc} tocDepth={homepagePage.tocDepth} />
            </aside>
          )}
        </div>
      </div>
    );
  }

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
            <PageTree homepagePageId={kb.homepagePageId} kbSlug={kb.slug} nodes={tree} />
          </aside>
          <div className="flow">
            {/* <h2>Sections</h2> */}
            {topLevel.length === 0 && (
              <p className="empty">No published sections yet. Check back soon.</p>
            )}
            <div className="grid grid--two">
              {topLevel.map((page) => (
                <article className="card" key={page.id}>
                  <h2>
                    <Link href={`/kb/${kb.slug}/${page.path.join("/")}`}>{page.title}</Link>
                    {page.visibility === "staff" && <span className="badge badge--staff"> Staff</span>}
                    {page.verifiedAt && <span className="badge badge--verified"> ✓ Verified</span>}
                  </h2>
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
