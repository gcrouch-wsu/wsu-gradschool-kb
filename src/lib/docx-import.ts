import mammoth from "mammoth";
import { parse, type HTMLElement, type Node } from "node-html-parser";
import { richTextToPlainText, sanitizeRichText } from "@/lib/rich-text";
import type { ContentBlock } from "@/lib/types";

export interface ParsedDocx {
  /** Derived from the first H1 in the document, if present. */
  title: string | null;
  blocks: ContentBlock[];
  /** Human-readable notes about anything skipped or transformed during import. */
  messages: string[];
}

/**
 * Uploads an image extracted from the document and returns its public URL, or
 * null when the image type is unsupported. Provided by the caller (Vercel Blob)
 * so this module stays free of storage concerns.
 */
export type ImageUploader = (data: Buffer, contentType: string) => Promise<string | null>;

export interface ConvertOptions {
  uploadImage?: ImageUploader;
}

const DATA_URI_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

function isElement(node: Node): node is HTMLElement {
  // node-html-parser element nodes expose a tagName; text/comment nodes do not.
  return (node as HTMLElement).tagName !== undefined && (node as HTMLElement).tagName !== null;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function inlineHtml(node: HTMLElement) {
  return sanitizeRichText(node.innerHTML);
}

function inlineText(node: HTMLElement) {
  return collapseWhitespace(richTextToPlainText(inlineHtml(node)) || node.text);
}

/**
 * Convert a .docx file (typically a Confluence export) into the KB's
 * ContentBlock model. Headings are preserved so they can drive both the
 * on-page table of contents and the nested site navigation. When an
 * `uploadImage` handler is supplied, embedded images are uploaded and emitted
 * as image blocks; otherwise they are skipped and reported.
 */
export async function convertDocxToBlocks(
  buffer: Buffer,
  options: ConvertOptions = {},
): Promise<ParsedDocx> {
  const hasUploader = Boolean(options.uploadImage);
  let uploadedImages = 0;
  let inlinedImages = 0;
  let skippedImages = 0;

  // When a handler is provided, upload each image during conversion and inline
  // its public URL as the <img src>. If object storage is unavailable, preserve
  // web-renderable images as data URIs so imported screenshots are not stripped.
  const convertImage = mammoth.images.imgElement(async (image) => {
    const normalizedType = image.contentType.toLowerCase();
    const altText = (image as { altText?: string }).altText ?? "";
    if (!DATA_URI_IMAGE_TYPES.has(normalizedType)) {
      skippedImages += 1;
      return { src: "" };
    }

    try {
      const base64 = await image.read("base64");
      if (hasUploader) {
        try {
          const data = Buffer.from(base64, "base64");
          const url = await options.uploadImage!(data, image.contentType);
          if (url) {
            uploadedImages += 1;
            return { src: url, alt: altText };
          }
        } catch {
          // Fall back to a data URI below so a temporary Blob outage does not
          // silently strip all screenshots from the imported draft.
        }
      }
      inlinedImages += 1;
      return { src: `data:${normalizedType};base64,${base64}`, alt: altText };
    } catch {
      skippedImages += 1;
      return { src: "" };
    }
  });

  // NOTE: mammoth's signature is convertToHtml(input, options) — image/style
  // options MUST go in the second argument or they are silently ignored.
  const { value: html, messages: mammothMessages } = await mammoth.convertToHtml(
    { buffer },
    { convertImage },
  );
  const root = parse(html, { blockTextElements: { pre: true } });

  const blocks: ContentBlock[] = [];
  const messages: string[] = [];
  let title: string | null = null;
  let importedTables = 0;
  let index = 0;

  const nextId = (prefix: string) => `${prefix}-${index++}`;

  const extractImages = (node: HTMLElement) => {
    const imgs = node.tagName?.toLowerCase() === "img" ? [node] : node.querySelectorAll("img");
    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      if (src.startsWith("http") || src.startsWith("data:image/")) {
        const alt = collapseWhitespace(img.getAttribute("alt") ?? "");
        blocks.push({ blockId: nextId("image"), type: "image", url: src, alt: alt || undefined });
      }
    }
  };

  for (const node of root.childNodes) {
    if (!isElement(node)) {
      continue;
    }
    const tag = node.tagName?.toLowerCase();
    if (!tag) {
      continue;
    }

    if (tag === "h1" || tag === "h2") {
      const html = inlineHtml(node);
      const text = inlineText(node);
      if (!text) {
        continue;
      }
      // The first H1 becomes the page title rather than an in-body heading.
      if (tag === "h1" && title === null) {
        title = text;
        continue;
      }
      blocks.push({ blockId: nextId("heading"), type: "heading", level: 2, text, html });
      continue;
    }

    if (tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
      const html = inlineHtml(node);
      const text = inlineText(node);
      if (text) {
        blocks.push({ blockId: nextId("heading"), type: "heading", level: 3, text, html });
      }
      continue;
    }

    if (tag === "p") {
      extractImages(node);
      const html = inlineHtml(node);
      const text = inlineText(node);
      if (text) {
        blocks.push({ blockId: nextId("paragraph"), type: "paragraph", text, html });
      }
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const listItems = node.querySelectorAll("li").map((li) => ({
        html: inlineHtml(li),
        text: inlineText(li),
      }));
      const items = listItems.map((item) => item.text).filter((item) => item.length > 0);
      const itemHtml = listItems.filter((item) => item.text.length > 0).map((item) => item.html);
      if (items.length > 0) {
        blocks.push({ blockId: nextId("list"), type: "list", ordered: tag === "ol", items, itemHtml });
      }
      continue;
    }

    if (tag === "table") {
      const rows = node
        .querySelectorAll("tr")
        .map((row) =>
          row
            .querySelectorAll("th,td")
            .map((cell) => inlineText(cell)),
        )
        .filter((row) => row.some((cell) => cell.length > 0));
      const rowsHtml = node
        .querySelectorAll("tr")
        .map((row) =>
          row
            .querySelectorAll("th,td")
            .map((cell) => inlineHtml(cell)),
        )
        .filter((row) => row.some((cell) => richTextToPlainText(cell).length > 0));
      if (rows.length > 0) {
        const firstRowHasHeader = node.querySelector("tr th") !== null;
        blocks.push({
          blockId: nextId("table"),
          type: "table",
          caption: "",
          hasHeaderRow: firstRowHasHeader || rows.length > 1,
          hasHeaderColumn: false,
          rows,
          rowsHtml,
        });
        importedTables += 1;
      }
      continue;
    }

    if (tag === "img") {
      extractImages(node);
      continue;
    }

    // Fallback: capture any other text-bearing block as a paragraph.
    extractImages(node);
    const html = inlineHtml(node);
    const text = inlineText(node);
    if (text) {
      blocks.push({ blockId: nextId("paragraph"), type: "paragraph", text, html });
    }
  }

  if (importedTables > 0) {
    messages.push(
      `${importedTables} table${importedTables === 1 ? "" : "s"} imported. Review headers and captions before publishing.`,
    );
  }
  if (uploadedImages > 0) {
    messages.push(`${uploadedImages} image${uploadedImages === 1 ? "" : "s"} imported.`);
  }
  if (inlinedImages > 0) {
    messages.push(
      `${inlinedImages} image${inlinedImages === 1 ? "" : "s"} preserved inline because Blob storage was unavailable or upload failed.`,
    );
  }
  if (skippedImages > 0) {
    messages.push(
      hasUploader
        ? `${skippedImages} image${skippedImages === 1 ? "" : "s"} were skipped (unsupported format such as EMF/WMF).`
        : `${skippedImages} image${skippedImages === 1 ? "" : "s"} were skipped. Connect Vercel Blob (set BLOB_READ_WRITE_TOKEN) to import images.`,
    );
  }
  for (const message of mammothMessages) {
    // "Unrecognised ... style" warnings are noise from Word/Confluence style IDs
    // (they don't affect the extracted text), so they are not surfaced to editors.
    if (message.type === "warning" && !/^Unrecognised (paragraph|run|table) style/i.test(message.message)) {
      messages.push(message.message);
    }
  }

  return { title, blocks, messages };
}
