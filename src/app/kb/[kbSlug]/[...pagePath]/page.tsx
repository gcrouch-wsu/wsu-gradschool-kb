import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { PageBlocks } from "@/components/PageBlocks";
import { PageTree } from "@/components/PageTree";
import { PrintPdfButton } from "@/components/PrintPdfButton";
import { TableOfContents, hasTocEntries } from "@/components/TableOfContents";
import { getCurrentAdminSession } from "@/lib/auth";
import {
  buildPageTree,
  getAssetById,
  getActiveRedirectTarget,
  getBreadcrumbs,
  getKbById,
  getKbBySlug,
  getPageByPath,
} from "@/lib/kb-store";
import { formatBytes, formatDate } from "@/lib/format";
import { DEFAULT_THEME, themeToCssVars } from "@/lib/kb-theme";
import type { CSSProperties } from "react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kbSlug: string; pagePath: string[] }>;
}): Promise<Metadata> {
  const { kbSlug, pagePath } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) {
    return {};
  }
  const isStaff = Boolean(await getCurrentAdminSession());
  const page = await getPageByPath(kb.id, pagePath, isStaff);
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
  const kb = await getKbBySlug(kbSlug);
  if (!kb) {
    notFound();
  }

  const isStaff = Boolean(await getCurrentAdminSession());
  let effectivePath = pagePath;
  const redirectTarget = await getActiveRedirectTarget(kb.id, pagePath);
  if (redirectTarget) {
    const pageAtOld = await getPageByPath(kb.id, pagePath, isStaff);
    if (!pageAtOld) {
      permanentRedirect(`/kb/${kb.slug}/${redirectTarget.join("/")}`);
    }
    effectivePath = redirectTarget;
  }

  const page = await getPageByPath(kb.id, effectivePath, isStaff);
  if (!page) {
    notFound();
  }

  const tree = await buildPageTree(kb.id, isStaff);
  const breadcrumbs = await getBreadcrumbs(kb.id, page.path, isStaff);
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
  const themeVars = themeToCssVars(kb.theme ?? DEFAULT_THEME) as CSSProperties;

  return (
    <div className="page-shell kb-theme-root" style={themeVars}>
      <div className={`layout${showTocRail ? " layout--with-toc" : ""}`}>
        <aside className="sidebar page-tree" aria-label="Section navigation">
          <strong>{kb.title}</strong>
          <PageTree currentPath={currentPath} kbSlug={kb.slug} nodes={tree} />
        </aside>
        <article className="article">
          <nav aria-label="Breadcrumb" className="breadcrumbs">
            <ol>
              <li>
                <Link href={`/kb/${kb.slug}`}>{kb.title}</Link>
              </li>
              {breadcrumbs.map((crumb) => {
                const crumbPath = crumb.path.join("/");
                const isCurrent = crumbPath === currentPath;
                return (
                  <li key={crumb.id}>
                    {isCurrent ? (
                      <span aria-current="page">{crumb.title}</span>
                    ) : (
                      <Link href={`/kb/${kb.slug}/${crumbPath}`}>{crumb.title}</Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          <p className="eyebrow">
            Article
            {page.status === "draft" && <span className="badge badge--draft"> Draft</span>}
            {page.visibility === "staff" && <span className="badge badge--staff"> Staff only</span>}
            {page.verifiedAt && (
              <span
                className="badge badge--verified"
                title={`Verified by ${page.verifiedBy} on ${new Date(page.verifiedAt).toLocaleDateString()}`}
              >
                ✓ Verified
              </span>
            )}
          </p>
          {isStaff && (
            <p className="admin-inline-actions">
              <Link className="button button--small" href={`/admin/pages/${page.id}`}>
                Edit page
              </Link>
            </p>
          )}
          <h1>{page.title}</h1>
          {page.showSummary !== false && page.summary && <p className="lead">{page.summary}</p>}
          <div className="article-meta-row">
            <p className="meta">Updated on {formatDate(page.updatedDisplayDate)}</p>
            <PrintPdfButton />
          </div>

          <div className="print-only" style={{ marginBottom: "2rem", borderBottom: "1px solid var(--line)", paddingBottom: "1rem" }}>
            <p className="meta"><strong>Responsible Office:</strong> {page.ownerLabel}</p>
            <p className="meta"><strong>Contact:</strong> {page.contactEmail}</p>
            {page.verifiedAt && (
              <p className="meta"><strong>Verified On:</strong> {formatDate(page.verifiedAt.split("T")[0])}</p>
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
