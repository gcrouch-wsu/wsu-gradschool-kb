import Link from "next/link";
import { getAssetById, getKbById } from "@/lib/demo-data";
import { formatBytes } from "@/lib/format";
import type { ContentBlock } from "@/lib/types";

function AssetLink({ assetId }: { assetId: string }) {
  const asset = getAssetById(assetId);
  if (!asset) {
    return <p className="alert">Referenced asset is unavailable.</p>;
  }

  const kb = getKbById(asset.homeKbId);
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

export function PageBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <>
      {blocks.map((block) => {
        if (block.type === "paragraph") {
          return <p key={block.blockId}>{block.text}</p>;
        }

        if (block.type === "heading") {
          return block.level === 2 ? (
            <h2 key={block.blockId}>{block.text}</h2>
          ) : (
            <h3 key={block.blockId}>{block.text}</h3>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={block.blockId}>
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "alert") {
          return (
            <div className="alert" key={block.blockId}>
              {block.text}
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
