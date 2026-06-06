import Link from "next/link";
import { getAssetById, getKbById } from "@/lib/kb-store";
import { formatBytes } from "@/lib/format";
import { sanitizeListItemHtml, sanitizeRichText, textToRichText } from "@/lib/rich-text";
import type { ContentBlock } from "@/lib/types";

/** @internal Exhaustiveness check. */
function assertNever(x: never): never {
  throw new Error(`Unhandled content block type: ${JSON.stringify(x)}`);
}

function RichText({ html, text }: { html?: string; text?: string }) {
  const clean = html ? sanitizeRichText(html) : textToRichText(text || "");
  return <span dangerouslySetInnerHTML={{ __html: clean }} />;
}

function ListItemRichText({ html, text }: { html?: string; text?: string }) {
  const clean = html ? sanitizeListItemHtml(html) : textToRichText(text || "");
  return <span dangerouslySetInnerHTML={{ __html: clean }} />;
}

async function AssetLink({ assetId }: { assetId: string }) {
  const asset = await getAssetById(assetId);
  if (!asset) {
    return <p className="alert alert--error">Referenced asset is unavailable.</p>;
  }

  const kb = await getKbById(asset.homeKbId);
  const href = kb ? `/kb/${kb.slug}/files/${asset.slug}` : "#";

  return (
    <Link className="asset-link" href={href}>
      <div aria-hidden="true" className="asset-link__icon">
        <svg
          fill="none"
          height="24"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </div>
      <div className="asset-link__content">
        <strong className="asset-link__title">{asset.title}</strong>
        <p className="asset-link__description">{asset.description}</p>
        <div className="asset-link__meta">
          {asset.mimeType.split(";")[0].split("/")[1]?.toUpperCase() || "FILE"} · {formatBytes(asset.fileSizeBytes)} ·
          Updated {asset.updatedDisplayDate}
        </div>
      </div>
    </Link>
  );
}

async function CardBlock({ block }: { block: Extract<ContentBlock, { type: "card" }> }) {
  const backgroundClass = `card--bg-${block.background}`;
  return (
    <section className={`card ${backgroundClass}`}>
      {block.title && <strong className="card__title">{block.title}</strong>}
      <div className="card__blocks">
        <PageBlocks blocks={block.blocks} />
      </div>
    </section>
  );
}

function VideoBlock({ block }: { block: Extract<ContentBlock, { type: "video" }> }) {
  if (block.provider === "youtube" && block.embedId) {
    return (
      <div className="content-video">
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          frameBorder="0"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          src={`https://www.youtube.com/embed/${block.embedId}`}
          title={block.title || "YouTube video player"}
        />
      </div>
    );
  }
  if (block.provider === "vimeo" && block.embedId) {
    return (
      <div className="content-video">
        <iframe
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          frameBorder="0"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          src={`https://player.vimeo.com/video/${block.embedId}`}
          title={block.title || "Vimeo video player"}
        />
      </div>
    );
  }
  if (block.url) {
    return (
      <div className="content-video">
        <video controls src={block.url} title={block.title || "Video player"} />
      </div>
    );
  }
  return <p className="alert alert--error">Video content is unavailable.</p>;
}

async function ImageBlock({ block }: { block: Extract<ContentBlock, { type: "image" }> }) {
  let src = block.url ?? "";
  if (block.assetId) {
    const asset = await getAssetById(block.assetId);
    const kb = asset ? await getKbById(asset.homeKbId) : null;
    if (asset && kb) {
      src = `/kb/${kb.slug}/files/${asset.slug}`;
    }
  }
  if (!src) {
    return <p className="alert alert--error">Referenced image is unavailable.</p>;
  }

  const widthPercent = Math.min(100, Math.max(25, block.widthPercent ?? 100));
  // Only set the horizontal margins so the stylesheet's vertical spacing is kept.
  const horizontalMargin =
    block.align === "center"
      ? { marginLeft: "auto", marginRight: "auto" }
      : block.align === "right"
        ? { marginLeft: "auto", marginRight: 0 }
        : { marginLeft: 0, marginRight: "auto" };
  return (
    <figure
      className={`content-image content-image--align-${block.align ?? "left"}`}
      style={{ maxWidth: `${widthPercent}%`, ...horizontalMargin }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={block.alt ?? ""} loading="lazy" src={src} />
      {block.alt && <figcaption>{block.alt}</figcaption>}
    </figure>
  );
}

export function PageBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <>
      {blocks.map((block) => {
        switch (block.type) {
          case "card":
            return <CardBlock block={block} key={block.blockId} />;
          case "video":
            return <VideoBlock block={block} key={block.blockId} />;
          case "paragraph":
            return (
              <p key={block.blockId} style={block.align ? { textAlign: block.align } : undefined}>
                <RichText html={block.html} text={block.text} />
              </p>
            );
          case "heading":
            return block.level === 2 ? (
              <h2
                className="anchor-heading"
                id={block.blockId}
                key={block.blockId}
                style={block.align ? { textAlign: block.align } : undefined}
              >
                <RichText html={block.html} text={block.text} />
              </h2>
            ) : (
              <h3
                className="anchor-heading"
                id={block.blockId}
                key={block.blockId}
                style={block.align ? { textAlign: block.align } : undefined}
              >
                <RichText html={block.html} text={block.text} />
              </h3>
            );
          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag key={block.blockId}>
                {block.items.map((item, index) => (
                  <li key={`${block.blockId}-${index}`}>
                    <ListItemRichText html={block.itemHtml?.[index]} text={item} />
                  </li>
                ))}
              </ListTag>
            );
          }
          case "alert": {
            const variantClass = block.variant === "warning" ? "alert--warning" : "alert--info";
            return (
              <div className={`alert ${variantClass}`} key={block.blockId}>
                <div aria-hidden="true" style={{ marginTop: "0.25rem" }}>
                  {block.variant === "warning" ? (
                    <svg
                      fill="none"
                      height="20"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      viewBox="0 0 24 24"
                      width="20"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="m12 9 0 4" />
                      <path d="m12 17.01 0.01 0" />
                      <path d="M10.07 3.11c.91-1.48 2.94-1.48 3.86 0l8.13 13.25c.82 1.34-.14 3.06-1.74 3.06H3.68c-1.6 0-2.56-1.72-1.74-3.06l8.13-13.25z" />
                    </svg>
                  ) : (
                    <svg
                      fill="none"
                      height="20"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      viewBox="0 0 24 24"
                      width="20"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                  )}
                </div>
                <div>
                  <RichText html={block.html} text={block.text} />
                </div>
              </div>
            );
          }
          case "editor_note":
            // Internal-only note: never rendered on the published page.
            return null;
          case "image":
            return <ImageBlock block={block} key={block.blockId} />;
          case "table":
            return (
              <div className="content-table-wrap" key={block.blockId}>
                <table className="content-table">
                  {block.caption && <caption>{block.caption}</caption>}
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={`${block.blockId}-${rowIndex}`}>
                        {row.map((cell, colIndex) => {
                          const isHeader =
                            (block.hasHeaderRow && rowIndex === 0) || (block.hasHeaderColumn && colIndex === 0);
                          const CellTag = isHeader ? "th" : "td";
                          return (
                            <CellTag key={`${block.blockId}-${rowIndex}-${colIndex}`}>
                              <RichText html={block.rowsHtml?.[rowIndex]?.[colIndex]} text={cell} />
                            </CellTag>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "asset_link":
            return <AssetLink assetId={block.assetId} key={block.blockId} />;
          case "section_divider":
            return <hr className="content-section-break" key={block.blockId} />;
          default:
            return assertNever(block);
        }
      })}
    </>
  );
}
