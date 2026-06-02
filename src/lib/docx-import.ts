import mammoth from "mammoth";
import { parse, type HTMLElement, type Node } from "node-html-parser";
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

function isElement(node: Node): node is HTMLElement {
  // node-html-parser element nodes expose a tagName; text/comment nodes do not.
  return (node as HTMLElement).tagName !== undefined && (node as HTMLElement).tagName !== null;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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
  let skippedImages = 0;

  // When a handler is provided, upload each image during conversion and inline
  // its public URL as the <img src>. Unsupported types / failures resolve to an
  // empty src, which the walker treats as "skip".
  const convertImage = hasUploader
    ? mammoth.images.imgElement(async (image) => {
        try {
          const base64 = await image.read("base64");
          const data = Buffer.from(base64, "base64");
          const url = await options.uploadImage!(data, image.contentType);
          if (url) {
            uploadedImages += 1;
            const altText = (image as { altText?: string }).altText ?? "";
            return { src: url, alt: altText };
          }
        } catch {
          // fall through to skip
        }
        skippedImages += 1;
        return { src: "" };
      })
    : undefined;

  // NOTE: mammoth's signature is convertToHtml(input, options) — image/style
  // options MUST go in the second argument or they are silently ignored.
  const { value: html, messages: mammothMessages } = await mammoth.convertToHtml(
    { buffer },
    convertImage ? { convertImage } : {},
  );
  const root = parse(html, { blockTextElements: { pre: true } });

  const blocks: ContentBlock[] = [];
  const messages: string[] = [];
  let title: string | null = null;
  let skippedTables = 0;
  let index = 0;

  const nextId = (prefix: string) => `${prefix}-${index++}`;

  const extractImages = (node: HTMLElement) => {
    const imgs = node.tagName?.toLowerCase() === "img" ? [node] : node.querySelectorAll("img");
    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      if (src.startsWith("http")) {
        const alt = collapseWhitespace(img.getAttribute("alt") ?? "");
        blocks.push({ blockId: nextId("image"), type: "image", url: src, alt: alt || undefined });
      } else if (!hasUploader) {
        // Default mammoth output embeds images as data URIs; count them as skipped.
        skippedImages += 1;
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
      const text = collapseWhitespace(node.text);
      if (!text) {
        continue;
      }
      // The first H1 becomes the page title rather than an in-body heading.
      if (tag === "h1" && title === null) {
        title = text;
        continue;
      }
      blocks.push({ blockId: nextId("heading"), type: "heading", level: 2, text });
      continue;
    }

    if (tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
      const text = collapseWhitespace(node.text);
      if (text) {
        blocks.push({ blockId: nextId("heading"), type: "heading", level: 3, text });
      }
      continue;
    }

    if (tag === "p") {
      extractImages(node);
      const text = collapseWhitespace(node.text);
      if (text) {
        blocks.push({ blockId: nextId("paragraph"), type: "paragraph", text });
      }
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const items = node
        .querySelectorAll("li")
        .map((li) => collapseWhitespace(li.text))
        .filter((item) => item.length > 0);
      if (items.length > 0) {
        blocks.push({ blockId: nextId("list"), type: "list", ordered: tag === "ol", items });
      }
      continue;
    }

    if (tag === "table") {
      skippedTables += 1;
      continue;
    }

    if (tag === "img") {
      extractImages(node);
      continue;
    }

    // Fallback: capture any other text-bearing block as a paragraph.
    extractImages(node);
    const text = collapseWhitespace(node.text);
    if (text) {
      blocks.push({ blockId: nextId("paragraph"), type: "paragraph", text });
    }
  }

  if (skippedTables > 0) {
    messages.push(
      `${skippedTables} table${skippedTables === 1 ? "" : "s"} were skipped (tables are not yet supported).`,
    );
  }
  if (uploadedImages > 0) {
    messages.push(`${uploadedImages} image${uploadedImages === 1 ? "" : "s"} imported.`);
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
