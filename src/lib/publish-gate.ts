import { parse } from "node-html-parser";
import type { ContentBlock } from "@/lib/types";

// Vague link text blocked at publish time (project_spec.md §17). In the MVP this
// list is config-managed here rather than per-KB template-editable.
const VAGUE_LINK_TEXT = new Set(["click here", "here", "more", "read more", "link", "this"]);
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface PublishablePage {
  title: string;
  slug: string;
  summary: string;
  ownerLabel: string;
  contactEmail: string;
  lastReviewedDate: string;
  blocks: ContentBlock[];
}

export type AssetStatusResolver = (assetId: string) => Promise<string | null>;

function collectHtml(block: ContentBlock): string[] {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "alert":
      return block.html ? [block.html] : [];
    case "list":
      return block.itemHtml ?? [];
    case "table":
      return (block.rowsHtml ?? []).flat();
    default:
      return [];
  }
}

/**
 * Runs the accessibility + governance publish gate described in project_spec.md
 * §17. Returns a list of human-readable blocking issues; an empty list means the
 * page may be published. Because editors publish directly (no approval workflow),
 * this gate is the primary quality control and these are treated as blockers.
 */
export async function validatePageForPublish(
  page: PublishablePage,
  resolveAssetStatus: AssetStatusResolver,
): Promise<string[]> {
  const issues: string[] = [];

  if (!page.title.trim()) {
    issues.push("Page is missing a title.");
  }
  if (!page.summary.trim()) {
    issues.push("Page is missing a summary.");
  }
  if (!page.ownerLabel.trim()) {
    issues.push("Page is missing an owner or office label.");
  }
  if (!page.contactEmail.trim() || !EMAIL_PATTERN.test(page.contactEmail.trim())) {
    issues.push("Page needs a valid contact email.");
  }
  if (!page.lastReviewedDate.trim()) {
    issues.push("Page is missing a last reviewed date.");
  }

  // Heading hierarchy: a sub-heading (H3) must not appear before its section (H2).
  let seenLevel2 = false;
  let skippedHeading = false;
  for (const block of page.blocks) {
    if (block.type !== "heading") {
      continue;
    }
    if (block.level === 2) {
      seenLevel2 = true;
    } else if (block.level === 3 && !seenLevel2) {
      skippedHeading = true;
    }
  }
  if (skippedHeading) {
    issues.push("Heading levels are skipped (a sub-heading appears before any section heading).");
  }

  for (const block of page.blocks) {
    if (block.type === "table" && !block.hasHeaderRow && !block.hasHeaderColumn) {
      issues.push(
        `A table${block.caption ? ` ("${block.caption}")` : ""} has no header row or header column.`,
      );
    }
    if (block.type === "image") {
      const hasImage = Boolean(block.assetId || block.url);
      if (hasImage && !(block.alt ?? "").trim()) {
        issues.push("An image is missing alt text. Add a description or mark it decorative.");
      }
      if (block.assetId && (await resolveAssetStatus(block.assetId)) !== "active") {
        issues.push("An image references an asset that is not active.");
      }
    }
    if (block.type === "asset_link") {
      if ((await resolveAssetStatus(block.assetId)) !== "active") {
        issues.push("A file link references an asset that is not active.");
      }
    }
  }

  let hasVagueLink = false;
  let hasEmptyLink = false;
  for (const block of page.blocks) {
    for (const html of collectHtml(block)) {
      for (const anchor of parse(html).querySelectorAll("a")) {
        const text = anchor.text.trim().toLowerCase();
        const href = (anchor.getAttribute("href") ?? "").trim();
        if (!text || VAGUE_LINK_TEXT.has(text)) {
          hasVagueLink = true;
        }
        if (!href || href === "#") {
          hasEmptyLink = true;
        }
      }
    }
  }
  if (hasVagueLink) {
    issues.push('A link uses vague text such as "click here". Use descriptive link text.');
  }
  if (hasEmptyLink) {
    issues.push("A link has no destination.");
  }

  return [...new Set(issues)];
}
