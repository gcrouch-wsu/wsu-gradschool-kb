import { getCurrentAdminSession, type AdminSession } from "@/lib/auth";
import { isTrustedAssetUrl } from "@/lib/blob";
import { excerptAttributionLabel, resolveExcerptForExport } from "@/lib/excerpts";
import {
  getAllAssetsForAdmin,
  getAllPagesForAdmin,
  getAssetAdminDetail,
  getKbById,
} from "@/lib/kb-store";
import { escapeHtml, sanitizeCalloutHtml, sanitizeListItemHtml, sanitizeRichText, textToRichText } from "@/lib/rich-text";
import { logError } from "@/lib/log";
import { collectZipArchive, zipArchiveStream, type ZipEntry } from "@/lib/zip";
import type { AssetVersion, ContentBlock, KbPage } from "@/lib/types";

export interface KbExportResult {
  filename: string;
  contentType: "application/zip";
  body: Uint8Array;
}

export interface KbExportStreamResult {
  filename: string;
  contentType: "application/zip";
  stream: ReadableStream<Uint8Array>;
}

export function canExportKb(session: Pick<AdminSession, "role"> | null) {
  return session?.role === "owner";
}

function safeSegment(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

function pageExportPath(page: KbPage) {
  return `pages/${safeSegment(page.path.join("-") || page.slug || page.id)}.html`;
}

function renderInline(html: string | undefined, text: string | undefined) {
  return html ? sanitizeRichText(html) : textToRichText(text ?? "");
}

function renderBlocks(
  blocks: ContentBlock[],
  kbSlug: string,
  assetPaths: Map<string, string>,
  excerptHtml: Map<string, string> = new Map(),
): string {
  return blocks.map((block) => renderBlock(block, kbSlug, assetPaths, excerptHtml)).join("\n");
}

// Pre-resolve top-level excerpt blocks into standalone HTML so the sync block
// renderer can inline them. Demoted excerpt content never contains further
// excerpts, so this needs no recursion.
async function buildExcerptHtml(
  blocks: ContentBlock[],
  kbSlug: string,
  assetPaths: Map<string, string>,
): Promise<Map<string, string>> {
  const excerptHtml = new Map<string, string>();
  for (const block of blocks) {
    if (block.type !== "excerpt") {
      continue;
    }
    const resolved = await resolveExcerptForExport(block);
    if (resolved.state !== "ok") {
      excerptHtml.set(block.blockId, `<aside role="note"><p>Included content unavailable.</p></aside>`);
      continue;
    }
    const label = excerptAttributionLabel(resolved, block.label);
    excerptHtml.set(
      block.blockId,
      `<aside role="note"><p>Included from: <a href="${escapeHtml(resolved.sourceHref)}">${escapeHtml(label)}</a></p>${renderBlocks(resolved.blocks, kbSlug, assetPaths)}</aside>`,
    );
  }
  return excerptHtml;
}

function renderBlock(
  block: ContentBlock,
  kbSlug: string,
  assetPaths: Map<string, string>,
  excerptHtml: Map<string, string> = new Map(),
): string {
  switch (block.type) {
    case "paragraph":
      return `<p>${renderInline(block.html, block.text) || "<br>"}</p>`;
    case "heading":
      return `<h${block.level}>${renderInline(block.html, block.text)}</h${block.level}>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const start = block.ordered && block.start && block.start > 1 ? ` start="${block.start}"` : "";
      const items = block.items
        .map((item, index) => `<li>${block.itemHtml?.[index] ? sanitizeListItemHtml(block.itemHtml[index]) : textToRichText(item)}</li>`)
        .join("");
      return `<${tag}${start}>${items}</${tag}>`;
    }
    case "alert":
      return `<aside role="note">${block.html ? sanitizeCalloutHtml(block.html) : textToRichText(block.text)}</aside>`;
    case "image": {
      const src = block.assetId ? assetPaths.get(block.assetId) : block.url;
      if (!src) return "";
      const alt = block.decorative ? "" : escapeHtml(block.alt ?? "");
      const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
      return `<figure><img src="${escapeHtml(src)}" alt="${alt}">${caption}</figure>`;
    }
    case "section_divider":
      return "<hr>";
    case "table": {
      const caption = block.caption ? `<caption>${escapeHtml(block.caption)}</caption>` : "";
      const rows = block.rows
        .map((row, rowIndex) => {
          const cells = row
            .map((cell, columnIndex) => {
              const tag =
                (block.hasHeaderRow && rowIndex === 0) || (block.hasHeaderColumn && columnIndex === 0) ? "th" : "td";
              const html = block.rowsHtml?.[rowIndex]?.[columnIndex];
              return `<${tag}>${html ? sanitizeRichText(html) : textToRichText(cell)}</${tag}>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<table>${caption}<tbody>${rows}</tbody></table>`;
    }
    case "asset_link":
      return `<p><a href="${escapeHtml(assetPaths.get(block.assetId) ?? "#")}">${escapeHtml(block.label ?? "Download file")}</a></p>`;
    case "card":
      return `<section><h2>${escapeHtml(block.title ?? "Card")}</h2>${renderBlocks(block.blocks, kbSlug, assetPaths, excerptHtml)}</section>`;
    case "procedure_section":
      return `<section><h${block.level}>${escapeHtml(block.title)}</h${block.level}>${renderBlocks(block.blocks, kbSlug, assetPaths, excerptHtml)}</section>`;
    case "video": {
      const src = block.assetId ? assetPaths.get(block.assetId) : block.url;
      const title = escapeHtml(block.title ?? "Video");
      return src ? `<figure><video controls src="${escapeHtml(src)}"></video><figcaption>${title}</figcaption></figure>` : "";
    }
    case "excerpt":
      return excerptHtml.get(block.blockId) ?? "";
    case "sourced": {
      const label = escapeHtml(
        (block.label ?? "").trim() || block.headingText || block.sourceUrl,
      );
      const href = /^https:\/\//.test(block.sourceUrl)
        ? escapeHtml(`${block.sourceUrl}${block.sourceAnchor ? `#${block.sourceAnchor}` : ""}`)
        : "";
      const attribution = href ? `<a href="${href}">${label}</a>` : label;
      return `<aside role="note"><p>Source: ${attribution}</p>${renderBlocks(block.blocks, kbSlug, assetPaths, excerptHtml)}</aside>`;
    }
  }
}

function renderStandalonePage(
  page: KbPage,
  kbSlug: string,
  assetPaths: Map<string, string>,
  excerptHtml: Map<string, string>,
) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(page.title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <main>
    <h1>${escapeHtml(page.title)}</h1>
    ${page.summary ? `<p>${escapeHtml(page.summary)}</p>` : ""}
    ${renderBlocks(page.blocks, kbSlug, assetPaths, excerptHtml)}
  </main>
</body>
</html>
`;
}

function decodeDataUrl(body: string): Uint8Array | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(body);
  if (!match) return null;
  const payload = decodeURIComponent(match[3] ?? "");
  if (match[2]) {
    return Uint8Array.from(Buffer.from(payload, "base64"));
  }
  return new TextEncoder().encode(payload);
}

async function bytesFromBody(body: string): Promise<Uint8Array> {
  const trimmed = body.trim();
  const dataUrl = decodeDataUrl(trimmed);
  if (dataUrl) {
    return dataUrl;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    if (!isTrustedAssetUrl(trimmed)) {
      return new TextEncoder().encode(trimmed);
    }
    const response = await fetch(trimmed);
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer());
    }
  }
  return new TextEncoder().encode(trimmed);
}

function assetEntry(assetId: string, version: AssetVersion): {
  assetId: string;
  entry: ZipEntry;
  pagePath: string;
} {
  const extension = version.originalFilename.includes(".")
    ? ""
    : version.mimeType === "application/pdf"
      ? ".pdf"
      : version.mimeType.startsWith("image/")
        ? `.${version.mimeType.slice("image/".length)}`
        : "";
  const name = `${safeSegment(assetId)}-${version.versionNumber}-${safeSegment(version.originalFilename)}${extension}`;
  return {
    assetId,
    entry: {
      path: `assets/${name}`,
      data: async () => {
        try {
          return await bytesFromBody(version.body);
        } catch (error) {
          logError(error, { route: "kb-export", action: "asset_bytes", assetId, versionId: version.id });
          throw error;
        }
      },
      modifiedAt: new Date(version.uploadedAt),
    },
    pagePath: `../assets/${name}`,
  };
}

async function prepareKbExport(kbId: string): Promise<{ filename: string; entries: ZipEntry[] } | null> {
  const kb = await getKbById(kbId);
  if (!kb) {
    return null;
  }

  const [pages, assets] = await Promise.all([getAllPagesForAdmin(kbId), getAllAssetsForAdmin(kbId)]);
  const assetDetails = await Promise.all(assets.map((asset) => getAssetAdminDetail(asset.id)));
  const activeVersions = assetDetails.flatMap((detail) => {
    if (!detail) {
      return [];
    }
    const active = detail.versions.filter((version) => version.status === "active");
    if (active.length > 0 || !detail.asset.body.trim()) {
      return active;
    }
    return [
      {
        id: detail.asset.versionId || `${detail.asset.id}-active`,
        assetId: detail.asset.id,
        versionNumber: 1,
        status: "active" as const,
        body: detail.asset.body,
        mimeType: detail.asset.mimeType,
        fileSizeBytes: detail.asset.fileSizeBytes,
        originalFilename: detail.asset.slug,
        uploadedAt: `${detail.asset.updatedDisplayDate}T00:00:00.000Z`,
      },
    ];
  });
  const assetEntries = activeVersions.map((version) => assetEntry(version.assetId, version));
  const assetPaths = new Map(assetEntries.map((asset) => [asset.assetId, asset.pagePath]));

  const metadata = {
    exportedAt: new Date().toISOString(),
    knowledgeBase: kb,
    pages: pages.map((page) => ({
      ...page,
      blocks: page.blocks,
    })),
    assets: assetDetails
      .filter((detail): detail is NonNullable<typeof detail> => Boolean(detail))
      .map((detail) => ({
        asset: detail.asset,
        versions: detail.versions.map(({ body: _body, ...version }) => version),
      })),
  };

  const entries: ZipEntry[] = [
    {
      path: "kb.json",
      data: `${JSON.stringify(metadata, null, 2)}\n`,
    },
    ...(await Promise.all(
      pages.map(async (page) => ({
        path: pageExportPath(page),
        data: renderStandalonePage(
          page,
          kb.slug,
          assetPaths,
          await buildExcerptHtml(page.blocks, kb.slug, assetPaths),
        ),
        modifiedAt: new Date(`${page.updatedDisplayDate}T00:00:00.000Z`),
      })),
    )),
    ...assetEntries.map((asset) => asset.entry),
  ];

  return { filename: `${safeSegment(kb.slug)}-export.zip`, entries };
}

export async function buildKbExportStream(kbId: string): Promise<KbExportStreamResult | null> {
  const prepared = await prepareKbExport(kbId);
  if (!prepared) {
    return null;
  }
  return {
    filename: prepared.filename,
    contentType: "application/zip",
    stream: zipArchiveStream(prepared.entries),
  };
}

export async function buildKbExport(kbId: string): Promise<KbExportResult | null> {
  const prepared = await prepareKbExport(kbId);
  if (!prepared) {
    return null;
  }
  return {
    filename: prepared.filename,
    contentType: "application/zip",
    body: await collectZipArchive(prepared.entries),
  };
}

export async function getExportingSession() {
  return getCurrentAdminSession();
}
