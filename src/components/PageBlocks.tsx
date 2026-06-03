import Link from "next/link";
import { getAssetById, getKbById } from "@/lib/kb-store";
import { formatBytes } from "@/lib/format";
import { sanitizeRichText, textToRichText } from "@/lib/rich-text";
import type { ContentBlock } from "@/lib/types";

function RichText({ html, text }: { html?: string; text: string }) {
  return (
    <span
      dangerouslySetInnerHTML={{
        __html: sanitizeRichText(html ?? textToRichText(text)),
      }}
    />
  );
}

async function AssetLink({ assetId }: { assetId: string }) {
  const asset = await getAssetById(assetId);
  if (!asset) {
    return <p className="alert">Referenced asset is unavailable.</p>;
  }

  const kb = await getKbById(asset.homeKbId);
  const href = kb ? `/kb/${kb.slug}/files/${asset.slug}` : "#";

  return (
    <div className="asset-link">
      <div aria-hidden="true">File</div>
      <div>
        <strong>
          <Link href={href}>{asset.title}</Link>
        </strong>
        <p>{asset.description}</p>
        <p className="meta">
          {asset.mimeType.split(";")[0]} · {formatBytes(asset.fileSizeBytes)} · Updated on{" "}
          {asset.updatedDisplayDate}
        </p>
      </div>
    </div>
  );
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
    return <p className="alert">Referenced image is unavailable.</p>;
  }

  const widthPercent = Math.min(100, Math.max(25, block.widthPercent ?? 100));
  return (
    <figure className="content-image" style={{ maxWidth: `${widthPercent}%` }}>
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
        if (block.type === "paragraph") {
          return (
            <p key={block.blockId}>
              <RichText html={block.html} text={block.text} />
            </p>
          );
        }

        if (block.type === "heading") {
          return block.level === 2 ? (
            <h2 className="anchor-heading" id={block.blockId} key={block.blockId}>
              <RichText html={block.html} text={block.text} />
            </h2>
          ) : (
            <h3 className="anchor-heading" id={block.blockId} key={block.blockId}>
              <RichText html={block.html} text={block.text} />
            </h3>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={block.blockId}>
              {block.items.map((item, index) => (
                <li key={`${block.blockId}-${index}`}>
                  <RichText html={block.itemHtml?.[index]} text={item} />
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "alert") {
          return (
            <div className="alert" key={block.blockId}>
              <RichText html={block.html} text={block.text} />
            </div>
          );
        }

        if (block.type === "image") {
          return <ImageBlock block={block} key={block.blockId} />;
        }

        if (block.type === "table") {
          const [headerRow, ...bodyRows] = block.rows;
          const rows = block.hasHeaderRow ? bodyRows : block.rows;
          return (
            <div className="content-table-wrap" key={block.blockId}>
              <table className="content-table">
                {block.caption && <caption>{block.caption}</caption>}
                {block.hasHeaderRow && headerRow && (
                  <thead>
                    <tr>
                      {headerRow.map((cell, index) => (
                        <th key={`${block.blockId}-head-${index}`} scope="col">
                          <RichText html={block.rowsHtml?.[0]?.[index]} text={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={`${block.blockId}-row-${rowIndex}`}>
                      {row.map((cell, cellIndex) => {
                        const isHeaderCell = block.hasHeaderColumn && cellIndex === 0;
                        return isHeaderCell ? (
                          <th key={`${block.blockId}-${rowIndex}-${cellIndex}`} scope="row">
                            <RichText
                              html={block.rowsHtml?.[block.hasHeaderRow ? rowIndex + 1 : rowIndex]?.[cellIndex]}
                              text={cell}
                            />
                          </th>
                        ) : (
                          <td key={`${block.blockId}-${rowIndex}-${cellIndex}`}>
                            <RichText
                              html={block.rowsHtml?.[block.hasHeaderRow ? rowIndex + 1 : rowIndex]?.[cellIndex]}
                              text={cell}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "asset_link") {
          return <AssetLink assetId={block.assetId} key={block.blockId} />;
        }

        return null;
      })}
    </>
  );
}
