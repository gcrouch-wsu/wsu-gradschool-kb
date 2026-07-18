import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { KbSearchWidget } from "@/components/KbSearchWidget";
import { PageBlocks } from "@/components/PageBlocks";
import { PageTree } from "@/components/PageTree";
import { PrintPdfButton } from "@/components/PrintPdfButton";
import { TableOfContents } from "@/components/TableOfContents";
import { hasTocEntries } from "@/lib/toc";
import { getCurrentAdminSession, getKbReadAccess } from "@/lib/auth";
import {
  buildPageTree,
  getAssetById,
  getActiveRedirectTarget,
  getKbById,
  getKbBySlug,
  getPageByPath,
} from "@/lib/kb-store";
import { formatBytes, formatDate, formatTimestamp } from "@/lib/format";
import { DEFAULT_THEME, mergeTheme, themeToCssVars } from "@/lib/kb-theme";
import { loadSiteSettings } from "@/lib/db";
import type { CSSProperties } from "react";
import { isPageViewPrefetch, recordPageViewLater } from "@/lib/page-views";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kbSlug: string; pagePath: string[] }>;
}): Promise<Metadata> {
  const { kbSlug, pagePath } = await params;
  const session = await getCurrentAdminSession();
  const kb = await getKbBySlug(kbSlug, Boolean(session));
  if (!kb) {
    notFound();
  }
  const access = await getKbReadAccess(session, kb);
  if (!access.canRead) {
    notFound();
  }
  const page = await getPageByPath(kb.id, pagePath, access.canReadStaffContent);
  if (!page) {
    return {};
  }

  return {
    title: `${page.title} · ${kb.title}`,
    description: page.summary || undefined,
  };
}

export default async function KbArticlePage({
  params,
}: {
  params: Promise<{ kbSlug: string; pagePath: string[] }>;
}) {
  const { kbSlug, pagePath } = await params;
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

  let effectivePath = pagePath;
  const redirectTarget = await getActiveRedirectTarget(kb.id, pagePath);
  if (redirectTarget) {
    const targetPage = await getPageByPath(kb.id, redirectTarget, includeStaff);
    if (!targetPage) {
      notFound();
    }
    const pageAtOld = await getPageByPath(kb.id, pagePath, includeStaff);
    if (!pageAtOld) {
      permanentRedirect(`/kb/${kb.slug}/${redirectTarget.join("/")}`);
    }
    effectivePath = redirectTarget;
  }

  const page = await getPageByPath(kb.id, effectivePath, includeStaff);
  if (!page) {
    notFound();
  }
  if (kb.homepagePageId === page.id) {
    permanentRedirect(`/kb/${kb.slug}`);
  }
  const requestHeaders = await headers();
  if (
    !access.canReadStaffContent &&
    kb.visibility === "public" &&
    !isPageViewPrefetch(requestHeaders) &&
    page.status === "published" &&
    page.visibility === "public"
  ) {
    recordPageViewLater({ pageId: page.id, kbId: kb.id });
  }

  const settings = await loadSiteSettings();
  const tree = await buildPageTree(kb.id, includeStaff);
  const currentPath = page.path.join("/");
  const relatedAssets = (
    await Promise.all(page.relatedAssetIds.map((assetId) => getAssetById(assetId)))
  ).filter((asset) => asset !== null);
  const relatedFiles = await Promise.all(
    relatedAssets.map(async (asset) => {
      const homeKb = await getKbById(asset.homeKbId);
      return { asset, href: homeKb ? `/kb/${homeKb.slug}/files/${asset.slug}` : "#" };
    }),
  );

  const showTocRail = page.showToc && hasTocEntries(page.blocks, page.tocDepth);
  
  const baseTheme = mergeTheme(settings.globalTheme || DEFAULT_THEME);
  const effectiveTheme = kb.theme ? mergeTheme(kb.theme, baseTheme) : baseTheme;
  const themeVars = themeToCssVars(effectiveTheme) as CSSProperties;
  
  const verifiedLabel = page.verifiedAt
    ? `Verified${page.verifiedBy ? ` by ${page.verifiedBy}` : ""} on ${formatTimestamp(page.verifiedAt)}`       
    : "";

  return (
    <div className="page-shell kb-theme-root" style={themeVars}>
      <div className={`layout${showTocRail ? " layout--with-toc" : ""}`}>
        <aside className="sidebar page-tree" aria-label="Section navigation">
          <KbSearchWidget kb={kb} />
          <strong>{kb.title}</strong>
          <PageTree
            currentPageId={page.id}
            currentPath={currentPath}
            homepagePageId={kb.homepagePageId}
            kbSlug={kb.slug}
            nodes={tree}
          />
        </aside>
        <article className="article flow">
          <p className="eyebrow">
            Article
            {page.status === "draft" && <span className="badge badge--draft"> Draft</span>}
            {page.visibility === "staff" && <span className="badge badge--staff"> Staff only</span>}
            {page.verifiedAt && (
              <span
                className="badge badge--verified"
                aria-label={verifiedLabel}
                title={verifiedLabel}
              >
                <span aria-hidden="true">✓</span> Verified
              </span>
            )}
          </p>
          {access.canReadStaffContent && (
            <p className="admin-inline-actions">
              {/* Plain anchor: entering the admin shell needs a full page load. */}
              <a className="button button--small" href={`/admin/pages/${page.id}`}>
                Edit page
              </a>
            </p>
          )}
          <h1>{page.title}</h1>
          {page.showSummary !== false && page.summary && <p className="lead">{page.summary}</p>}
          <div className="article-meta-row">
            <p className="meta">Updated on {formatDate(page.updatedDisplayDate)}</p>
            {page.showPrintButton !== false && <PrintPdfButton />}
          </div>

          <div className="print-only" style={{ borderBottom: "1px solid var(--line)", paddingBottom: "1rem" }}>
            {page.ownerLabel && (
              <p className="meta"><strong>Responsible Office:</strong> {page.ownerLabel}</p>
            )}
            {page.contactEmail && (
              <p className="meta"><strong>Contact:</strong> {page.contactEmail}</p>
            )}
            {page.verifiedAt && (
              <p className="meta"><strong>Verified On:</strong> {formatTimestamp(page.verifiedAt)}</p>
            )}
          </div>

          <PageBlocks blocks={page.blocks} />

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
            <TableOfContents blocks={page.blocks} showToc={page.showToc} tocDepth={page.tocDepth} />
          </aside>
        )}
      </div>
    </div>
  );
}
