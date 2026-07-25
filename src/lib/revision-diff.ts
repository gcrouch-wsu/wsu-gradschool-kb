import type { ContentBlock, PageRevision } from "@/lib/types";

/** Flatten page body blocks into plain text for revision compare. */
export function blocksToPlainText(blocks: ContentBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
      case "alert":
        lines.push(stripHtml(block.html ?? block.text ?? ""));
        break;
      case "heading":
        lines.push(stripHtml(block.html ?? block.text ?? ""));
        break;
      case "list":
        for (let i = 0; i < block.items.length; i += 1) {
          const html = block.itemHtml?.[i];
          lines.push(`• ${stripHtml(html ?? block.items[i] ?? "")}`);
        }
        break;
      case "card":
        if (block.title) lines.push(block.title);
        lines.push(blocksToPlainText(block.blocks));
        break;
      case "procedure_section":
        lines.push(block.title);
        lines.push(blocksToPlainText(block.blocks));
        break;
      case "sourced":
        lines.push(block.headingText || block.label || block.sourceUrl);
        lines.push(blocksToPlainText(block.blocks));
        break;
      case "image":
        lines.push(`[image: ${block.alt || block.assetId || "untitled"}]`);
        break;
      case "asset_link":
        lines.push(`[file: ${block.label || block.assetId}]`);
        break;
      case "video":
        lines.push(`[video: ${block.title || block.url || block.assetId || "untitled"}]`);
        break;
      case "excerpt":
        lines.push(`[excerpt: ${block.label || block.sourcePageId}]`);
        break;
      case "table":
        for (const row of block.rows ?? []) {
          lines.push(row.map((cell) => stripHtml(cell)).join(" | "));
        }
        break;
      case "section_divider":
        lines.push("---");
        break;
      default:
        break;
    }
  }
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/(div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

export type DiffLine = { kind: "same" | "add" | "remove"; text: string };

/** LCS line diff for small revision texts. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.length ? before.split("\n") : [];
  const b = after.length ? after.split("\n") : [];
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "remove", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ kind: "remove", text: a[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ kind: "add", text: b[j] });
    j += 1;
  }
  return out;
}

export function revisionPlainDocument(revision: Pick<PageRevision, "title" | "summary" | "blocks">): string {
  const parts = [`# ${revision.title}`];
  if (revision.summary.trim()) {
    parts.push("", revision.summary.trim());
  }
  const body = blocksToPlainText(revision.blocks);
  if (body) {
    parts.push("", body);
  }
  return parts.join("\n");
}
