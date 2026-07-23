import Link from "next/link";
import { getCurrentAdminSession } from "@/lib/auth";
import { excerptAttributionLabel, resolveExcerptForRead } from "@/lib/excerpts";
import { formatDate } from "@/lib/format";
import { getAssetById, getKbById } from "@/lib/kb-store";
import { formatBytes } from "@/lib/format";
import { sanitizeCalloutHtml, sanitizeListItemHtml, sanitizeRichText, textToRichText } from "@/lib/rich-text";
import type { ContentBlock } from "@/lib/types";

function assertNever(x: never): never {
  throw new Error(`Unhandled content block type: ${JSON.stringify(x)}`);
}

function RichText({ html, text }: { html?: string; text?: string }) {
  const clean = html ? sanitizeRichText(html) : textToRichText(text || "");
  return <span dangerouslySetInnerHTML={{ __html: clean }} />;
}

function ListItemRichText({ html, text }: { html?: string; text?: string }) {
  const clean = html ? sanitizeListItemHtml(html) : textToRichText(text || "");
  if (/<(?:ol|ul)\b/i.test(clean)) {
    return <div className="list-item-rich-text" dangerouslySetInnerHTML={{ __html: clean }} />;
  }
  return <span dangerouslySetInnerHTML={{ __html: clean }} />;
}

function CalloutRichText({ html, text }: { html?: string; text?: string }) {
  const clean = html ? sanitizeCalloutHtml(html) : textToRichText(text || "");
  return <div className="callout-rich-text" dangerouslySetInnerHTML={{ __html: clean }} />;
}

function OpensInNewTabText({ enabled }: { enabled?: boolean }) {
  return enabled ? <span className="sr-only"> (opens in a new tab)</span> : null;
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

async function ExcerptBlock({ block }: { block: Extract<ContentBlock, { type: "excerpt" }> }) {
  const session = await getCurrentAdminSession();
  const resolved = await resolveExcerptForRead(block, session);
  if (resolved.state !== "ok") {
    return (
      <aside aria-label="Included content unavailable" className="excerpt-box excerpt-box--unavailable" role="note">
        <p className="excerpt-box__source">This included content is currently unavailable.</p>
      </aside>
    );
  }
  const sourceLabel = excerptAttributionLabel(resolved, block.label);
  const newTabProps = block.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <aside aria-label={`Included from ${sourceLabel}`} className="excerpt-box" role="note">
      <p className="excerpt-box__source">
        Included from:{" "}
        <Link href={resolved.sourceHref} {...newTabProps}>
          {sourceLabel}
          <OpensInNewTabText enabled={block.openInNewTab} />
        </Link>
      </p>
      <div className="excerpt-box__blocks flow">
        <PageBlocks blocks={resolved.blocks} />
      </div>
    </aside>
  );
}

function SourcedBlock({ block }: { block: Extract<ContentBlock, { type: "sourced" }> }) {
  const href = /^https:\/\//.test(block.sourceUrl)
    ? `${block.sourceUrl}${block.sourceAnchor ? `#${block.sourceAnchor}` : ""}`
    : "";
  const label =
    (block.label ?? "").trim() ||
    (block.headingText ? `${sourceHostLabel(block.sourceUrl)} — ${block.headingText}` : sourceHostLabel(block.sourceUrl));
  const newTabProps = block.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <aside aria-label={`Source: ${label}`} className="source-box" role="note">
      <p className="source-box__source">
        Source:{" "}
        {href ? (
          <a href={href} {...newTabProps}>
            {label}
            <OpensInNewTabText enabled={block.openInNewTab} />
          </a>
        ) : (
          label
        )}
        {block.retrievedAt && (
          <span className="source-box__meta"> · retrieved {formatDate(block.retrievedAt.slice(0, 10))}</span>
        )}
      </p>
      {block.headingText && <p className="source-box__heading">{block.headingText}</p>}
      <div className="source-box__blocks flow">
        <PageBlocks blocks={block.blocks} />
      </div>
    </aside>
  );
}

function sourceHostLabel(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "External source";
  }
}

async function CardBlock({ block }: { block: Extract<ContentBlock, { type: "card" }> }) {
  const backgroundClass = `card--bg-${block.background}`;
  return (
    <section className={`card ${backgroundClass}`}>
      {block.title && <strong className="card__title">{block.title}</strong>}
      <div className="card__blocks flow">
        <PageBlocks blocks={block.blocks} />
      </div>
    </section>
  );
}

function ProcedureSectionBlock({ block }: { block: Extract<ContentBlock, { type: "procedure_section" }> }) {
  const HeadingTag = block.level === 3 ? "h3" : "h2";
  return (
    <section className="procedure-section" aria-labelledby={block.blockId}>
      <HeadingTag className="anchor-heading procedure-section__title" id={block.blockId}>
        {block.title}
      </HeadingTag>
      <div className="procedure-section__blocks flow">
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
      <img alt={block.decorative ? "" : block.alt ?? ""} loading="lazy" src={src} />
      {block.caption && <figcaption>{block.caption}</figcaption>}
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
          case "procedure_section":
            return <ProcedureSectionBlock block={block} key={block.blockId} />;
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
            const children = block.items.map((item, index) => (
              <li key={`${block.blockId}-${index}`}>
                <ListItemRichText html={block.itemHtml?.[index]} text={item} />
              </li>
            ));
            return block.ordered ? (
              <ol key={block.blockId} start={block.start}>
                {children}
              </ol>
            ) : (
              <ul key={block.blockId}>{children}</ul>
            );
          }
          case "alert": {
            return (
              <aside className="alert alert--info" key={block.blockId} role="note">
                <div aria-hidden="true" style={{ marginTop: "0.25rem" }}>
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
                </div>
                <div>
                  <CalloutRichText html={block.html} text={block.text} />
                </div>
              </aside>
            );
          }
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
                          const headerScope =
                            block.hasHeaderRow && rowIndex === 0 ? "col" : block.hasHeaderColumn ? "row" : undefined;
                          const colSpan = block.colSpans?.[rowIndex]?.[colIndex] ?? 1;
                          const rowSpan = block.rowSpans?.[rowIndex]?.[colIndex] ?? 1;
                          const align = block.cellAligns?.[rowIndex]?.[colIndex];
                          return (
                            <CellTag
                              colSpan={colSpan > 1 ? colSpan : undefined}
                              key={`${block.blockId}-${rowIndex}-${colIndex}`}
                              rowSpan={rowSpan > 1 ? rowSpan : undefined}
                              scope={headerScope}
                              style={align && align !== "left" ? { textAlign: align } : undefined}
                            >
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
          case "excerpt":
            return <ExcerptBlock block={block} key={block.blockId} />;
          case "sourced":
            return <SourcedBlock block={block} key={block.blockId} />;
          case "section_divider":
            return <hr className="content-section-break" key={block.blockId} />;
          default:
            return assertNever(block);
        }
      })}
    </>
  );
}
