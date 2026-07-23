import { parse, type HTMLElement, type Node } from "node-html-parser";
import {
  escapeHtml,
  richTextToPlainText,
  sanitizeCalloutHtml,
  sanitizeListItemHtml,
  sanitizeRichText,
  textToRichText,
} from "@/lib/rich-text";
import type { ContentBlock, TextAlign } from "@/lib/types";

const DROP_CONTENT_TAGS = new Set(["script", "style", "template", "noscript", "iframe", "object", "embed"]);
const SAFE_IMG_SRC = /^(https?:|\/|data:image\/)/i;

const IMAGE_MIN_WIDTH = 25;
const IMAGE_MAX_WIDTH = 100;

function clampWidth(value: number | undefined): number {
  if (!Number.isFinite(value as number)) {
    return IMAGE_MAX_WIDTH;
  }
  return Math.min(IMAGE_MAX_WIDTH, Math.max(IMAGE_MIN_WIDTH, Math.round(value as number)));
}

function readTextAlign(node: HTMLElement): TextAlign | undefined {
  const styleMatch = (node.getAttribute("style") ?? "").match(/text-align\s*:\s*(left|right|center)/i);
  const raw = (styleMatch?.[1] ?? node.getAttribute("align") ?? "").toLowerCase();
  return raw === "center" || raw === "right" || raw === "left" ? (raw as TextAlign) : undefined;
}

function normalizeAlign(raw: string | undefined | null): TextAlign | undefined {
  const value = (raw ?? "").toLowerCase();
  return value === "center" || value === "right" || value === "left" ? (value as TextAlign) : undefined;
}

function alignStyleAttr(align: TextAlign | undefined): string {
  return align && align !== "left" ? ` style="text-align: ${align}"` : "";
}

function imageMargin(align: TextAlign | undefined): string {
  if (align === "center") {
    return "0 auto";
  }
  if (align === "right") {
    return "0 0 0 auto";
  }
  return "0 auto 0 0";
}

function imageControlsHtml(): string {
  return (
    `<div class="doc-image__controls" contenteditable="false">` +
    `<button type="button" class="doc-image__control doc-image__control--text" data-img-action="alt" title="Edit alt text" aria-label="Edit image alt text">Alt</button>` +
    `<span class="doc-image__control-sep" aria-hidden="true"></span>` +
    `<button type="button" class="doc-image__control" data-img-action="align-left" title="Align left" aria-label="Align image left">⤆</button>` +
    `<button type="button" class="doc-image__control" data-img-action="align-center" title="Center" aria-label="Center image">↔</button>` +
    `<button type="button" class="doc-image__control" data-img-action="align-right" title="Align right" aria-label="Align image right">⤇</button>` +
    `<span class="doc-image__control-sep" aria-hidden="true"></span>` +
    `<button type="button" class="doc-image__control" data-img-action="width-down" title="Smaller" aria-label="Shrink image">−</button>` +
    `<button type="button" class="doc-image__control" data-img-action="width-up" title="Larger" aria-label="Enlarge image">+</button>` +
    `</div>`
  );
}

function imageEditorCaption(caption: string, alt: string, decorative: boolean): string {
  const text = caption.trim();
  if (text) {
    return `<figcaption class="doc-image__caption" contenteditable="true" data-img-caption="true">${escapeHtml(text)}</figcaption>`;
  }
  if (decorative) {
    return `<figcaption class="doc-image__caption doc-image__caption--decorative" contenteditable="true" data-img-caption="true" data-placeholder="Optional visible caption">Decorative image (no alt text needed)</figcaption>`;
  }
  if (alt) {
    return `<figcaption class="doc-image__caption doc-image__caption--placeholder" contenteditable="true" data-img-caption="true" data-placeholder="Optional visible caption"></figcaption>`;
  }
  return `<figcaption class="doc-image__caption doc-image__caption--missing" contenteditable="true" data-img-caption="true" data-placeholder="Optional visible caption">No alt text - use the Alt button to add a description</figcaption>`;
}

function imageFigureHtml(input: {
  blockId: string;
  src: string;
  alt: string;
  decorative: boolean;
  width: number;
  align: TextAlign;
  assetId?: string;
  caption?: string;
}): string {
  const assetAttr = input.assetId ? ` data-asset-id="${escapeHtml(input.assetId)}"` : "";
  const decoAttr = input.decorative ? ` data-decorative="true"` : "";
  const needsAlt = !input.decorative && !input.alt ? ` data-needs-alt="true"` : "";
  const figureStyle = ` style="max-width: ${input.width}%; margin: ${imageMargin(input.align)};"`;
  return (
    `<figure class="doc-image" contenteditable="false" data-block-id="${escapeHtml(input.blockId)}" data-width="${input.width}" data-align="${input.align}"${assetAttr}${decoAttr}${needsAlt}${figureStyle}>` +
    imageControlsHtml() +
    `<img alt="${escapeHtml(input.alt)}" src="${escapeHtml(input.src)}" />` +
    imageEditorCaption(input.caption ?? "", input.alt, input.decorative) +
    `</figure>`
  );
}

function assertNever(x: never): never {
  throw new Error(`Unhandled content block type: ${JSON.stringify(x)}`);
}

function isElement(node: Node): node is HTMLElement {
  return (node as HTMLElement).tagName !== undefined && (node as HTMLElement).tagName !== null;
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const LIST_ITEM_TEXT_BREAK_TAGS = new Set(["br", "div", "li", "ol", "p", "table", "tr", "ul"]);

function listItemPlainText(html: string) {
  const root = parse(html);
  const parts: string[] = [];
  const appendBreak = () => {
    if (parts.length > 0 && parts[parts.length - 1] !== " ") {
      parts.push(" ");
    }
  };
  const visit = (node: Node) => {
    if (!isElement(node)) {
      if (node.text) {
        parts.push(node.text);
      }
      return;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === "br") {
      appendBreak();
      return;
    }
    if (tag === "ol" || tag === "ul") {
      appendBreak();
    }
    node.childNodes.forEach(visit);
    if (LIST_ITEM_TEXT_BREAK_TAGS.has(tag)) {
      appendBreak();
    }
  };
  root.childNodes.forEach(visit);
  return collapseWhitespace(parts.join(""));
}

function newBlockId() {
  return `block-${crypto.randomUUID()}`;
}

function blockIdFrom(node: HTMLElement, fallback?: string) {
  return node.getAttribute("data-block-id") ?? fallback ?? newBlockId();
}

function hasClass(node: HTMLElement, className: string) {
  return (node.getAttribute("class") ?? "").split(/\s+/).includes(className);
}

function safeImageSrc(raw: string | undefined): string | null {
  const src = (raw ?? "").trim();
  if (!src || !SAFE_IMG_SRC.test(src)) {
    return null;
  }
  return src;
}

// Headings must keep their size under theme control. Editing accidents (e.g.
// restoring a demoted heading) can leave inline font-size spans behind that
// freeze the heading at a pasted size; drop just the font-size declaration and
// unwrap spans that end up with no style left.
function stripHeadingSizeOverrides(html: string): string {
  if (!/font-size/i.test(html)) {
    return html;
  }
  const root = parse(html);
  for (const span of root.querySelectorAll("span[style]")) {
    const style = span.getAttribute("style") ?? "";
    const kept = style
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part && !/^font-size\s*:/i.test(part));
    if (kept.length > 0) {
      span.setAttribute("style", kept.join("; "));
    } else {
      span.replaceWith(span.innerHTML);
    }
  }
  return root.toString();
}

// Editing operations (e.g. splitting a list by typing a paragraph in the
// middle) can leave two blocks carrying the same data-block-id, which breaks
// anchors and makes saves flaky. Keep the first occurrence, re-mint the rest.
function dedupeBlockIds(html: string): string {
  const root = parse(html);
  const seen = new Set<string>();
  let changed = false;
  for (const node of root.querySelectorAll("[data-block-id]")) {
    const id = node.getAttribute("data-block-id") ?? "";
    if (id && !seen.has(id)) {
      seen.add(id);
      continue;
    }
    const fresh = newBlockId();
    if (node.getAttribute("id") === id) {
      node.setAttribute("id", fresh);
    }
    node.setAttribute("data-block-id", fresh);
    seen.add(fresh);
    changed = true;
  }
  return changed ? root.toString() : html;
}

function inlineFields(node: HTMLElement, listItem = false) {
  const html = listItem
    ? sanitizeListItemHtml(node.innerHTML, { keepNotes: true })
    : sanitizeRichText(node.innerHTML, { keepNotes: true });
  const text = listItem
    ? listItemPlainText(html || node.innerHTML)
    : collapseWhitespace(richTextToPlainText(html) || node.text);
  return { html, text };
}

function alertFields(node: HTMLElement) {
  const html = sanitizeCalloutHtml(node.innerHTML, { keepNotes: true });
  const text = collapseWhitespace(richTextToPlainText(html) || node.text);
  return { html, text };
}

export function blocksToDocumentHtml(blocks: ContentBlock[], kbSlug?: string): string {
  return blocks.map((block) => blockToHtml(block, kbSlug)).join("");
}

// Readable HTML for the editor's source ("HTML") view: the same structure the
// editor round-trips, minus editor-only chrome (image control buttons, empty
// placeholder captions, contenteditable flags). Re-parsing the result through
// documentHtmlToBlocks reconstructs the blocks, so the toggle is lossless for
// supported content and safe (the parser drops anything outside the allowlist).
export function blocksToSourceHtml(blocks: ContentBlock[], kbSlug?: string): string {
  const root = parse(blocksToDocumentHtml(blocks, kbSlug));
  for (const node of root.querySelectorAll(".doc-image__controls")) {
    node.remove();
  }
  for (const node of root.querySelectorAll("figcaption")) {
    const cls = node.getAttribute("class") ?? "";
    if (/doc-image__caption--(missing|decorative|placeholder)/.test(cls)) {
      node.remove();
    }
  }
  for (const node of root.querySelectorAll("[contenteditable]")) {
    node.removeAttribute("contenteditable");
  }
  for (const node of root.querySelectorAll("[data-placeholder]")) {
    node.removeAttribute("data-placeholder");
  }
  return root.childNodes
    .map((node) => node.toString())
    .filter((html) => html.trim().length > 0)
    .join("\n\n");
}

function blockToHtml(block: ContentBlock, kbSlug?: string): string {
  const id = escapeHtml(block.blockId);
  switch (block.type) {
    case "paragraph": {
      const inner = block.html ?? textToRichText(block.text);
      return `<p data-block-id="${id}"${alignStyleAttr(block.align)}>${inner || "<br>"}</p>`;
    }
    case "heading": {
      const tag = block.level === 2 ? "h2" : "h3";
      const inner = block.html ?? textToRichText(block.text);
      return `<${tag} class="anchor-heading" data-block-id="${id}" id="${id}"${alignStyleAttr(block.align)}>${inner}</${tag}>`;
    }
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const startAttr = block.ordered && block.start && block.start > 1 ? ` start="${block.start}"` : "";
      const items = block.items
        .map((item, index) => {
          const inner = block.itemHtml?.[index] ?? textToRichText(item);
          return `<li>${inner}</li>`;
        })
        .join("");
      return `<${tag}${startAttr} data-block-id="${id}">${items}</${tag}>`;
    }
    case "alert": {
      const inner = block.html ? sanitizeCalloutHtml(block.html, { keepNotes: true }) : textToRichText(block.text);
      return `<aside class="doc-alert doc-alert--info" data-block-id="${id}" data-variant="info" role="note">${inner}</aside>`;
    }
    case "image": {
      return imageFigureHtml({
        blockId: block.blockId,
        src: safeImageSrc(block.url) ?? "",
        alt: block.alt ?? "",
        decorative: Boolean(block.decorative),
        width: clampWidth(block.widthPercent),
        align: block.align ?? "left",
        assetId: block.assetId,
        caption: block.caption,
      });
    }
    case "section_divider": {
      return `<div class="doc-section-break" contenteditable="false" data-block-id="${id}" role="separator" aria-label="Section break"></div>`;
    }
    case "card": {
      const titleAttr = block.title ? ` data-title="${escapeHtml(block.title)}"` : "";
      const inner = blocksToDocumentHtml(block.blocks, kbSlug);
      return `<section class="doc-card doc-card--${block.background}" data-block-id="${id}" data-background="${block.background}"${titleAttr}>${inner}</section>`;
    }
    case "procedure_section": {
      const tag = block.level === 3 ? "h3" : "h2";
      const inner = blocksToDocumentHtml(block.blocks, kbSlug);
      return `<section class="doc-procedure-section" data-block-id="${id}" data-level="${block.level}"><${tag} class="anchor-heading doc-procedure-section__title" id="${id}" contenteditable="false">${textToRichText(block.title)}</${tag}>${inner}</section>`;
    }
    case "table": {
      return serializeTable(block);
    }
    case "asset_link": {
      return `<div class="doc-asset-link" data-block-id="${id}" data-asset-id="${escapeHtml(block.assetId)}"></div>`;
    }
    case "video": {
      const providerAttr = block.provider ? ` data-provider="${escapeHtml(block.provider)}"` : "";
      const embedIdAttr = block.embedId ? ` data-embed-id="${escapeHtml(block.embedId)}"` : "";
      const urlAttr = block.url ? ` data-url="${escapeHtml(block.url)}"` : "";
      const titleAttr = block.title ? ` data-title="${escapeHtml(block.title)}"` : "";
      return `<div class="doc-video" contenteditable="false" data-block-id="${id}"${providerAttr}${embedIdAttr}${urlAttr}${titleAttr}></div>`;
    }
    case "excerpt": {
      const headingAttr = block.sourceHeadingBlockId
        ? ` data-source-heading-id="${escapeHtml(block.sourceHeadingBlockId)}"`
        : "";
      const labelAttr = block.label ? ` data-label="${escapeHtml(block.label)}"` : "";
      const newTabAttr = block.openInNewTab ? ` data-new-tab="true"` : "";
      return `<div class="doc-excerpt" contenteditable="false" data-block-id="${id}" data-source-page-id="${escapeHtml(block.sourcePageId)}"${headingAttr}${labelAttr}${newTabAttr}></div>`;
    }
    case "sourced": {
      const anchorAttr = block.sourceAnchor ? ` data-source-anchor="${escapeHtml(block.sourceAnchor)}"` : "";
      const labelAttr = block.label ? ` data-label="${escapeHtml(block.label)}"` : "";
      const newTabAttr = block.openInNewTab ? ` data-new-tab="true"` : "";
      const headingAttr = block.headingText ? ` data-heading-text="${escapeHtml(block.headingText)}"` : "";
      const retrievedAttr = block.retrievedAt ? ` data-retrieved-at="${escapeHtml(block.retrievedAt)}"` : "";
      const hashAttr = block.contentHash ? ` data-content-hash="${escapeHtml(block.contentHash)}"` : "";
      const inner = blocksToDocumentHtml(block.blocks, kbSlug);
      return `<section class="doc-sourced" contenteditable="false" data-block-id="${id}" data-source-url="${escapeHtml(block.sourceUrl)}"${anchorAttr}${labelAttr}${newTabAttr}${headingAttr}${retrievedAttr}${hashAttr}>${inner}</section>`;
    }
    default:
      return assertNever(block);
  }
}

function serializeTable(block: Extract<ContentBlock, { type: "table" }>): string {
  const id = escapeHtml(block.blockId);
  const captionHtml = block.caption ? `<caption>${escapeHtml(block.caption)}</caption>` : "";
  const body = block.rows
    .map((row, rowIndex) => {
      const cellHtml = row
        .map((cell, colIndex) => {
          const isHeader = (block.hasHeaderRow && rowIndex === 0) || (block.hasHeaderColumn && colIndex === 0);
          const tag = isHeader ? "th" : "td";
          const inner = block.rowsHtml?.[rowIndex]?.[colIndex] ?? textToRichText(cell);
          const colSpan = block.colSpans?.[rowIndex]?.[colIndex] ?? 1;
          const rowSpan = block.rowSpans?.[rowIndex]?.[colIndex] ?? 1;
          const colSpanAttr = colSpan > 1 ? ` colspan="${colSpan}"` : "";
          const rowSpanAttr = rowSpan > 1 ? ` rowspan="${rowSpan}"` : "";
          return `<${tag}${colSpanAttr}${rowSpanAttr}>${inner}</${tag}>`;
        })
        .join("");
      return `<tr>${cellHtml}</tr>`;
    })
    .join("");
  return `<table class="doc-table" contenteditable="false" data-block-id="${id}" data-header-row="${block.hasHeaderRow}" data-header-column="${block.hasHeaderColumn}">${captionHtml}<tbody>${body}</tbody></table>`;
}

function serializeDocumentNode(node: Node): string {
  if (!isElement(node)) {
    return escapeHtml(node.text ?? "");
  }

  const tag = node.tagName?.toLowerCase();
  if (!tag) {
    return escapeHtml(node.text ?? "");
  }

  if (DROP_CONTENT_TAGS.has(tag)) {
    return "";
  }

  const blockId = blockIdFrom(node);

  if (tag === "section" && hasClass(node, "doc-card")) {
    const background =
      (node.getAttribute("data-background") as Extract<ContentBlock, { type: "card" }>["background"]) || "paper";
    const title = node.getAttribute("data-title") || "";
    const inner = node.childNodes.map(serializeDocumentNode).join("");
    return `<section class="doc-card doc-card--${background}" data-block-id="${escapeHtml(blockId)}" data-background="${background}" data-title="${escapeHtml(title)}">${inner}</section>`;
  }

  if (tag === "section" && hasClass(node, "doc-procedure-section")) {
    const rawLevel = Number(node.getAttribute("data-level"));
    const level = rawLevel === 3 ? 3 : 2;
    const heading = node.querySelector(":scope > h2, :scope > h3");
    const title = collapseWhitespace(heading?.text ?? "") || "Procedure section";
    const children = node.childNodes
      .filter((child) => child !== heading)
      .map(serializeDocumentNode)
      .join("");
    return `<section class="doc-procedure-section" data-block-id="${escapeHtml(blockId)}" data-level="${level}"><h${level} class="anchor-heading doc-procedure-section__title" id="${escapeHtml(blockId)}" contenteditable="false">${escapeHtml(title)}</h${level}>${children}</section>`;
  }

  if (tag === "figure" && hasClass(node, "doc-image")) {
    const assetId = node.getAttribute("data-asset-id");
    const width = clampWidth(Number(node.getAttribute("data-width")));
    const align = normalizeAlign(node.getAttribute("data-align")) ?? "left";
    const decorative = node.getAttribute("data-decorative") === "true";
    const img = node.querySelector("img");
    const src = safeImageSrc(img?.getAttribute("src") ?? undefined) ?? "";
    const captionNode = node.querySelector("figcaption[data-img-caption], figcaption.doc-image__caption, figcaption");
    const captionClass = captionNode?.getAttribute("class") ?? "";
    const caption = /\bdoc-image__caption--(missing|decorative|placeholder)\b/.test(captionClass)
      ? ""
      : collapseWhitespace(captionNode?.text ?? "");

    const alt = decorative ? "" : escapeHtml(collapseWhitespace(img?.getAttribute("alt") ?? ""));
    const assetAttr = assetId ? ` data-asset-id="${escapeHtml(assetId)}"` : "";
    const decoAttr = decorative ? ` data-decorative="true"` : "";
    const captionHtml = caption
      ? `<figcaption class="doc-image__caption" data-img-caption="true">${escapeHtml(caption)}</figcaption>`
      : "";

    return (
      `<figure class="doc-image" contenteditable="false" data-block-id="${escapeHtml(blockId)}" data-width="${width}" data-align="${align}"${assetAttr}${decoAttr}>` +
      `<img alt="${alt}" src="${escapeHtml(src)}" />` +
      `${captionHtml}</figure>`
    );
  }

  if (tag === "aside" && hasClass(node, "doc-alert")) {
    const inner = sanitizeCalloutHtml(node.innerHTML, { keepNotes: true });
    return `<aside class="doc-alert doc-alert--info" data-block-id="${escapeHtml(blockId)}" data-variant="info" role="note">${inner}</aside>`;
  }

  if (tag === "table" && hasClass(node, "doc-table")) {

    return node.outerHTML;
  }

  if (tag === "div" && hasClass(node, "doc-asset-link")) {
    const assetId = node.getAttribute("data-asset-id") || "";
    return `<div class="doc-asset-link" data-block-id="${escapeHtml(blockId)}" data-asset-id="${escapeHtml(assetId)}"></div>`;
  }

  if (tag === "div" && hasClass(node, "doc-video")) {
    const provider = node.getAttribute("data-provider") || "";
    const embedId = node.getAttribute("data-embed-id") || "";
    const url = node.getAttribute("data-url") || "";
    const title = node.getAttribute("data-title") || "";
    return `<div class="doc-video" contenteditable="false" data-block-id="${escapeHtml(blockId)}" data-provider="${escapeHtml(provider)}" data-embed-id="${escapeHtml(embedId)}" data-url="${escapeHtml(url)}" data-title="${escapeHtml(title)}"></div>`;
  }

  if (tag === "div" && hasClass(node, "doc-excerpt")) {
    const sourcePageId = node.getAttribute("data-source-page-id") || "";
    const sourceHeadingId = node.getAttribute("data-source-heading-id") || "";
    const label = node.getAttribute("data-label") || "";
    const newTab = node.getAttribute("data-new-tab") === "true";
    const headingAttr = sourceHeadingId ? ` data-source-heading-id="${escapeHtml(sourceHeadingId)}"` : "";
    const labelAttr = label ? ` data-label="${escapeHtml(label)}"` : "";
    const newTabAttr = newTab ? ` data-new-tab="true"` : "";
    return `<div class="doc-excerpt" contenteditable="false" data-block-id="${escapeHtml(blockId)}" data-source-page-id="${escapeHtml(sourcePageId)}"${headingAttr}${labelAttr}${newTabAttr}></div>`;
  }

  if (tag === "section" && hasClass(node, "doc-sourced")) {
    const attrs = ["data-source-url", "data-source-anchor", "data-label", "data-new-tab", "data-heading-text", "data-retrieved-at", "data-content-hash"]
      .map((name) => {
        const value = node.getAttribute(name) || "";
        return value ? ` ${name}="${escapeHtml(value)}"` : "";
      })
      .join("");
    const inner = node.childNodes.map(serializeDocumentNode).join("");
    return `<section class="doc-sourced" contenteditable="false" data-block-id="${escapeHtml(blockId)}"${attrs}>${inner}</section>`;
  }

  if ((tag === "div" && hasClass(node, "doc-section-break")) || (tag === "hr" && hasClass(node, "doc-section-break"))) {
    return `<div class="doc-section-break" contenteditable="false" data-block-id="${escapeHtml(blockId)}" role="separator" aria-label="Section break"></div>`;
  }

  if (tag === "p") {
    // Chromium's insertOrderedList/insertUnorderedList can leave the new list
    // wrapped inside the paragraph it converted (`<p><ol>…</ol></p>`). A plain
    // paragraph serialize would flatten that list via inline sanitization, so
    // split the paragraph: emit any block-level list at the top level and wrap
    // surrounding inline content in its own paragraph(s).
    const hasBlockList = node.childNodes.some(
      (child) => isElement(child) && ["ol", "ul"].includes(child.tagName?.toLowerCase() ?? ""),
    );
    if (hasBlockList) {
      const out: string[] = [];
      let inlineBuffer = "";
      const flushInline = () => {
        const inner = sanitizeRichText(inlineBuffer, { keepNotes: true });
        if (inner.trim()) {
          out.push(`<p data-block-id="${newBlockId()}"${alignStyleAttr(readTextAlign(node))}>${inner}</p>`);
        }
        inlineBuffer = "";
      };
      for (const child of node.childNodes) {
        const childTag = isElement(child) ? child.tagName?.toLowerCase() : null;
        if (childTag === "ol" || childTag === "ul") {
          flushInline();
          out.push(serializeDocumentNode(child));
        } else {
          inlineBuffer += isElement(child) ? child.toString() : escapeHtml(child.text ?? "");
        }
      }
      flushInline();
      return out.join("");
    }
    const inner = sanitizeRichText(node.innerHTML, { keepNotes: true });
    return `<p data-block-id="${escapeHtml(blockId)}"${alignStyleAttr(readTextAlign(node))}>${inner || "<br>"}</p>`;
  }

  if (/^h[1-6]$/.test(tag)) {
    // The page model supports two heading levels. Map pasted H1s to H2 and
    // H4-H6 to H3 instead of silently demoting them to paragraphs.
    const mapped = tag === "h1" || tag === "h2" ? "h2" : "h3";
    const inner = stripHeadingSizeOverrides(sanitizeRichText(node.innerHTML, { keepNotes: true }));
    return `<${mapped} class="anchor-heading" data-block-id="${escapeHtml(blockId)}" id="${escapeHtml(blockId)}"${alignStyleAttr(readTextAlign(node))}>${inner}</${mapped}>`;
  }

  if (tag === "ul" || tag === "ol") {
    const items = node.querySelectorAll(":scope > li");
    const start = tag === "ol" ? Number(node.getAttribute("start")) : 0;
    const startAttr = Number.isFinite(start) && start > 1 ? ` start="${Math.floor(start)}"` : "";
    const itemHtml = items
      .map((li) => `<li>${sanitizeListItemHtml(li.innerHTML, { keepNotes: true }) || "<br>"}</li>`)
      .join("");
    return `<${tag}${startAttr} data-block-id="${escapeHtml(blockId)}">${itemHtml}</${tag}>`;
  }

  if (tag === "div" && node.getAttribute("data-block-id")) {
    const inner = node.childNodes.map(serializeDocumentNode).join("");
    return inner;
  }

  const text = collapseWhitespace(node.text ?? "");
  if (!text && tag !== "br") {
    return node.childNodes.map(serializeDocumentNode).join("");
  }
  const inner = tag === "br" ? "<br>" : sanitizeRichText(node.innerHTML || text, { keepNotes: true });
  return `<p data-block-id="${newBlockId()}">${inner}</p>`;
}

export function sanitizePageDocument(html: string) {
  if (!html.trim()) {
    return `<p data-block-id="${newBlockId()}"><br></p>`;
  }
  const root = parse(html);
  const clean = root.childNodes.map(serializeDocumentNode).join("");
  return clean ? dedupeBlockIds(clean) : `<p data-block-id="${newBlockId()}"><br></p>`;
}

const MAX_NESTING_DEPTH = 3;

export function documentHtmlToBlocks(html: string, depth = 0): ContentBlock[] {
  if (depth > MAX_NESTING_DEPTH) {
    return []; 
  }

  const clean = sanitizePageDocument(html);
  const root = parse(clean);
  const blocks: ContentBlock[] = [];

  for (const node of root.childNodes) {
    if (!isElement(node)) {
      continue;
    }
    const tag = node.tagName?.toLowerCase();
    if (!tag) {
      continue;
    }

    if (tag === "section" && hasClass(node, "doc-card")) {
      if (depth + 1 > MAX_NESTING_DEPTH) {

        blocks.push(...documentHtmlToBlocks(node.innerHTML, depth));
        continue;
      }
      blocks.push({
        blockId: blockIdFrom(node),
        type: "card",
        title: node.getAttribute("data-title") || undefined,
        background:
          (node.getAttribute("data-background") as Extract<ContentBlock, { type: "card" }>["background"]) || "paper",
        blocks: documentHtmlToBlocks(node.innerHTML, depth + 1),
      });
      continue;
    }

    if (tag === "section" && hasClass(node, "doc-procedure-section")) {
      if (depth > 0) {
        blocks.push(...documentHtmlToBlocks(node.innerHTML, depth));
        continue;
      }
      const rawLevel = Number(node.getAttribute("data-level"));
      const heading = node.querySelector(":scope > h2, :scope > h3");
      const level = rawLevel === 3 || heading?.tagName?.toLowerCase() === "h3" ? 3 : 2;
      const title = collapseWhitespace(heading?.text ?? "") || "Procedure section";
      const inner = node.childNodes
        .filter((child) => child !== heading)
        .map((child) => (isElement(child) ? child.outerHTML : escapeHtml(child.text ?? "")))
        .join("");
      blocks.push({
        blockId: blockIdFrom(node),
        type: "procedure_section",
        title,
        level,
        blocks: documentHtmlToBlocks(inner || `<p data-block-id="${newBlockId()}"><br></p>`, depth + 1),
      });
      continue;
    }

    if (tag === "p") {
      const { html: blockHtml, text } = inlineFields(node);
      if (text || blockHtml.includes("<")) {
        blocks.push({ blockId: blockIdFrom(node), type: "paragraph", text, html: blockHtml, align: readTextAlign(node) });
      }
      continue;
    }

    if (tag === "h2" || tag === "h3") {
      const { html: blockHtml, text } = inlineFields(node);
      if (text || blockHtml.includes("<")) {
        blocks.push({
          blockId: blockIdFrom(node, node.getAttribute("id") ?? undefined),
          type: "heading",
          level: tag === "h2" ? 2 : 3,
          text,
          html: blockHtml,
          align: readTextAlign(node),
        });
      }
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const listItems = node.querySelectorAll(":scope > li").map((li) => inlineFields(li, true));
      const items = listItems.map((item) => item.text).filter((item) => item.length > 0);
      const itemHtml = listItems.filter((item) => item.text.length > 0).map((item) => item.html);
      if (items.length > 0) {
        const start = tag === "ol" ? Number(node.getAttribute("start")) : 0;
        blocks.push({
          blockId: blockIdFrom(node),
          type: "list",
          ordered: tag === "ol",
          start: Number.isFinite(start) && start > 1 ? Math.floor(start) : undefined,
          items,
          itemHtml,
        });
      }
      continue;
    }

    if (tag === "aside" && hasClass(node, "doc-alert")) {
      const { html: blockHtml, text } = alertFields(node);
      if (text || blockHtml.includes("<")) {

        blocks.push({
          blockId: blockIdFrom(node),
          type: "alert",
          variant: "info",
          text,
          html: blockHtml,
        });
      }
      continue;
    }

    if ((tag === "div" && hasClass(node, "doc-section-break")) || (tag === "hr" && hasClass(node, "doc-section-break"))) {
      blocks.push({ blockId: blockIdFrom(node), type: "section_divider" });
      continue;
    }

    if (tag === "figure" && hasClass(node, "doc-image")) {
      const img = node.querySelector("img");
      const assetId = node.getAttribute("data-asset-id") ?? undefined;
      const url = safeImageSrc(img?.getAttribute("src") ?? undefined) ?? undefined;
      const decorative = node.getAttribute("data-decorative") === "true";

      const alt = decorative ? "" : collapseWhitespace(img?.getAttribute("alt") ?? "");
      const captionNode = node.querySelector("figcaption[data-img-caption], figcaption.doc-image__caption, figcaption");
      const captionClass = captionNode?.getAttribute("class") ?? "";
      const caption = /\bdoc-image__caption--(missing|decorative|placeholder)\b/.test(captionClass)
        ? ""
        : collapseWhitespace(captionNode?.text ?? "");
      const widthPercent = clampWidth(Number(node.getAttribute("data-width")));
      blocks.push({
        blockId: blockIdFrom(node),
        type: "image",
        assetId,
        url,
        alt: alt || undefined,
        decorative: decorative || undefined,
        widthPercent,
        align: normalizeAlign(node.getAttribute("data-align")),
        caption: caption || undefined,
      });
      continue;
    }

    if (tag === "table" && hasClass(node, "doc-table")) {
      const caption = node.querySelector("caption")?.text.trim() ?? "";
      const hasHeaderRow = node.getAttribute("data-header-row") === "true";
      const hasHeaderColumn = node.getAttribute("data-header-column") === "true";
      const rows: string[][] = [];
      const rowsHtml: string[][] = [];
      const colSpans: number[][] = [];
      const rowSpans: number[][] = [];
      let hasNonDefaultSpan = false;
      for (const rowNode of node.querySelectorAll("tr")) {
        const row: string[] = [];
        const rowHtml: string[] = [];
        const rowColSpans: number[] = [];
        const rowRowSpans: number[] = [];
        // Only direct cell children — nested tables (if any) must not leak cells.
        for (const cellNode of rowNode.childNodes) {
          if (!isElement(cellNode)) {
            continue;
          }
          const cellTag = cellNode.tagName?.toLowerCase();
          if (cellTag !== "th" && cellTag !== "td") {
            continue;
          }
          const { html: cellHtml, text } = inlineFields(cellNode);
          const colSpan = Math.max(1, Number(cellNode.getAttribute("colspan") || "1") || 1);
          const rowSpan = Math.max(1, Number(cellNode.getAttribute("rowspan") || "1") || 1);
          if (colSpan > 1 || rowSpan > 1) {
            hasNonDefaultSpan = true;
          }
          row.push(text);
          rowHtml.push(cellHtml);
          rowColSpans.push(colSpan);
          rowRowSpans.push(rowSpan);
        }
        if (row.length > 0) {
          rows.push(row);
          rowsHtml.push(rowHtml);
          colSpans.push(rowColSpans);
          rowSpans.push(rowRowSpans);
        }
      }
      blocks.push({
        blockId: blockIdFrom(node),
        type: "table",
        caption: caption || undefined,
        hasHeaderRow,
        hasHeaderColumn,
        rows,
        rowsHtml,
        ...(hasNonDefaultSpan ? { colSpans, rowSpans } : {}),
      });
      continue;
    }

    if (tag === "div" && hasClass(node, "doc-asset-link")) {
      blocks.push({
        blockId: blockIdFrom(node),
        type: "asset_link",
        assetId: node.getAttribute("data-asset-id") || "",
      });
      continue;
    }

    if (tag === "div" && hasClass(node, "doc-video")) {
      blocks.push({
        blockId: blockIdFrom(node),
        type: "video",
        provider:
          (node.getAttribute("data-provider") as Extract<ContentBlock, { type: "video" }>["provider"]) || undefined,
        embedId: node.getAttribute("data-embed-id") || undefined,
        url: node.getAttribute("data-url") || undefined,
        title: node.getAttribute("data-title") || undefined,
      });
      continue;
    }

    if (tag === "div" && hasClass(node, "doc-excerpt")) {
      // Excerpts are top-level blocks only; one dropped inside a card or
      // procedure section would resolve recursively at render time.
      if (depth === 0) {
        blocks.push({
          blockId: blockIdFrom(node),
          type: "excerpt",
          sourcePageId: node.getAttribute("data-source-page-id") || "",
          sourceHeadingBlockId: node.getAttribute("data-source-heading-id") || undefined,
          label: node.getAttribute("data-label") || undefined,
          openInNewTab: node.getAttribute("data-new-tab") === "true" || undefined,
        });
      }
      continue;
    }

    if (tag === "section" && hasClass(node, "doc-sourced")) {
      if (depth === 0) {
        blocks.push({
          blockId: blockIdFrom(node),
          type: "sourced",
          sourceUrl: node.getAttribute("data-source-url") || "",
          sourceAnchor: node.getAttribute("data-source-anchor") || undefined,
          label: node.getAttribute("data-label") || undefined,
          openInNewTab: node.getAttribute("data-new-tab") === "true" || undefined,
          headingText: node.getAttribute("data-heading-text") || undefined,
          retrievedAt: node.getAttribute("data-retrieved-at") || undefined,
          contentHash: node.getAttribute("data-content-hash") || undefined,
          blocks: documentHtmlToBlocks(node.innerHTML, depth + 1),
        });
      } else {
        blocks.push(...documentHtmlToBlocks(node.innerHTML, depth));
      }
      continue;
    }
  }

  if (blocks.length === 0) {
    blocks.push({ blockId: newBlockId(), type: "paragraph", text: "" });
  }
  return blocks;
}

export function mergeDocumentAndExtraBlocks(flow: ContentBlock[], extra: ContentBlock[]) {
  return [...flow, ...extra];
}
