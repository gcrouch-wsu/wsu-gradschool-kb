import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { KbSearchWidget } from "@/components/KbSearchWidget";
import { PageBlocks } from "@/components/PageBlocks";
import { PageTree } from "@/components/PageTree";
import { PrintPdfButton } from "@/components/PrintPdfButton";
import { TableOfContents } from "@/components/TableOfContents";
import { getCurrentAdminSession, getKbReadAccess } from "@/lib/auth";
import { buildPageTree, getAssetById, getKbById, getKbBySlug, getKbHomepagePage } from "@/lib/kb-store";
import { formatBytes, formatDate, formatTimestamp } from "@/lib/format";
import { DEFAULT_THEME, mergeTheme, resolvePublicTheme, themeToCssVars } from "@/lib/kb-theme";
import { loadSiteSettings } from "@/lib/db";
import { hasTocEntries } from "@/lib/toc";
import { isPageViewPrefetch, recordPageViewLater } from "@/lib/page-views";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kbSlug: string }>;
}): Promise<Metadata> {
  const { kbSlug } = await params;
  const session = await getCurrentAdminSession();
  const kb = await getKbBySlug(kbSlug, Boolean(session));
  if (!kb) {
    notFound();
  }
  const access = await getKbReadAccess(session, kb);
  if (!access.canRead) {
    notFound();
  }
  return {
    title: `${kb.title} · WSU Knowledge Base`,
    description: kb.description || undefined,
  };
}

export default async function KbHomePage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const session = await getCurrentAdminSession();
  const kb = await getKbBySlug(kbSlug, Boolean(session));
  if (!kb) {
    notFound();
  }
  const access = await getKbReadAccess(session, kb);
  if (!access.canRead) {
    notFound();
  }
  const includeStaff = access.canReadStaffContent;

  const requestHeaders = await headers();
  const settings = await loadSiteSettings();
  const tree = await buildPageTree(kb.id, includeStaff);
  const topLevel = tree.map((node) => node.page).filter((page) => (page.nodeKind ?? "page") === "page");
  const homepagePage = await getKbHomepagePage(kb.id, includeStaff);

  const baseTheme = mergeTheme(settings.globalTheme || DEFAULT_THEME);
  const effectiveTheme = resolvePublicTheme(kb.theme, baseTheme);
  const themeVars = themeToCssVars(effectiveTheme) as CSSProperties;

  if (homepagePage) {
    if (
      !access.canReadStaffContent &&
      kb.visibility === "public" &&
      !isPageViewPrefetch(requestHeaders) &&
      homepagePage.status === "published" &&
      homepagePage.visibility === "public"
    ) {
      recordPageViewLater({ pageId: homepagePage.id, kbId: kb.id });
    }
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
            <KbSearchWidget kb={kb} />
            <strong>{kb.title}</strong>
            <PageTree
              collapsible={effectiveTheme.layout.pageTreeCollapsible}
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
            {access.canReadStaffContent && (
              <p className="admin-inline-actions">
                {/* Plain anchor: entering the admin shell needs a full page load. */}
                <a className="button button--small" href={`/admin/pages/${homepagePage.id}`}>
                  Edit homepage
                </a>
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
          </div>
        </div>
      </section>
      <div className="page-shell">
        <div className="layout">
          <aside className="sidebar page-tree" aria-label="Knowledge base navigation">
            <KbSearchWidget kb={kb} />
            <strong>Browse {kb.title}</strong>
            <PageTree
              collapsible={effectiveTheme.layout.pageTreeCollapsible}
              homepagePageId={kb.homepagePageId}
              kbSlug={kb.slug}
              nodes={tree}
            />
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
