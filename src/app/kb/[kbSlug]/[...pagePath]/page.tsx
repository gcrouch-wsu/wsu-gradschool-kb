import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBlocks } from "@/components/PageBlocks";
import {
  getAssetById,
  getKbById,
  getKbBySlug,
  getPageByPath,
  getPublishedPagesForKb,
} from "@/lib/demo-data";
import { formatBytes, formatDate } from "@/lib/format";

export default async function KbArticlePage({
  params,
}: {
  params: Promise<{ kbSlug: string; pagePath: string[] }>;
}) {
  const { kbSlug, pagePath } = await params;
  const kb = getKbBySlug(kbSlug);
  if (!kb) {
    notFound();
  }

  const page = getPageByPath(kb.id, pagePath);
  if (!page) {
    notFound();
  }

  const pages = getPublishedPagesForKb(kb.id);
  const relatedAssets = page.relatedAssetIds
    .map((assetId) => getAssetById(assetId))
    .filter((asset) => asset !== null);

  return (
    <div className="page-shell">
      <div className="layout">
        <aside className="sidebar" aria-label="Section navigation">
          <strong>{kb.title}</strong>
          <ul>
            {pages.map((navPage) => (
              <li key={navPage.id}>
                <Link href={`/kb/${kb.slug}/${navPage.path.join("/")}`}>{navPage.title}</Link>
              </li>
            ))}
          </ul>
        </aside>
        <article className="article">
          <p className="eyebrow">Article</p>
          <h1>{page.title}</h1>
          <p className="lead">{page.summary}</p>
          <p className="meta">Updated on {formatDate(page.updatedDisplayDate)}</p>
          <PageBlocks blocks={page.blocks} />

          {relatedAssets.length > 0 && (
            <>
              <h2>Related Files</h2>
              <div className="grid">
                {relatedAssets.map((asset) => {
                  const homeKb = getKbById(asset.homeKbId);
                  const href = homeKb
                    ? `/kb/${homeKb.slug}/files/${asset.slug}`
                    : "#";
                  return (
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
                  );
                })}
              </div>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
