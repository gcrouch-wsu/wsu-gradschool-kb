import { parse } from "node-html-parser";
import type { ExcerptBlockRef, ExcerptSourceState } from "@/lib/excerpts";
import type { ContentBlock, PageNodeKind, PageRevision } from "@/lib/types";

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
  nodeKind?: PageNodeKind;
  linkUrl?: string;
}

export type AssetStatusResolver = (assetId: string) => Promise<string | null>;

// Injected like AssetStatusResolver so the gate stays free of data-layer
// imports; callers pass checkExcerptSourceForPublish from src/lib/excerpts.ts.
export type ExcerptSourceChecker = (ref: ExcerptBlockRef) => Promise<ExcerptSourceState>;

const EXCERPT_ISSUES: Record<Exclude<ExcerptSourceState, "ok">, string> = {
  missing: "An included excerpt references a page that no longer exists. Remove or repoint the excerpt.",
  unpublished: "An included excerpt references a page that is not published.",
  section_missing: "An included excerpt references a section that no longer exists on its source page.",
};

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
    case "card":
    case "procedure_section":
    case "sourced":
      return block.blocks.flatMap(collectHtml);
    default:
      return [];
  }
}

export async function validatePageForPublish(
  page: PublishablePage,
  resolveAssetStatus: AssetStatusResolver,
  checkExcerptSource?: ExcerptSourceChecker,
): Promise<string[]> {
  const issues: string[] = [];

  // Group headings and links are tree structure, not content: they publish on
  // a title (and a valid destination for links) alone.
  if ((page.nodeKind ?? "page") !== "page") {
    if (!page.title.trim()) {
      issues.push("Page is missing a title.");
    }
    if (page.nodeKind === "link" && !/^(https:\/\/|\/)/.test((page.linkUrl ?? "").trim())) {
      issues.push("A link item needs a destination: an https:// URL or an internal path starting with /.");
    }
    return issues;
  }

  if (!page.title.trim()) {
    issues.push("Page is missing a title.");
  }
  if (!page.summary.trim()) {
    issues.push("Page is missing a summary.");
  }
  if (!page.ownerLabel.trim()) {
    issues.push("Page is missing a responsible office label.");
  }
  if (!page.contactEmail.trim() || !EMAIL_PATTERN.test(page.contactEmail.trim())) {
    issues.push("Page needs a valid contact email.");
  }
  if (!page.lastReviewedDate.trim()) {
    issues.push("Page is missing a last reviewed date.");
  }

  let seenLevel2 = false;
  let skippedHeading = false;
  for (const block of page.blocks) {
    const level = block.type === "heading" || block.type === "procedure_section" ? block.level : null;
    if (!level) continue;
    if (level === 2) {
      seenLevel2 = true;
    } else if (level === 3 && !seenLevel2) {
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
      if (hasImage && !block.decorative && !(block.alt ?? "").trim()) {
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
    if (block.type === "excerpt" && checkExcerptSource) {
      const state = await checkExcerptSource(block);
      if (state !== "ok") {
        issues.push(EXCERPT_ISSUES[state]);
      }
    }
    if (block.type === "card" || block.type === "procedure_section" || block.type === "sourced") {
      const nestedIssues = await validatePageForPublish(
        { ...page, blocks: block.blocks },
        resolveAssetStatus,
        checkExcerptSource,
      );
      issues.push(
        ...nestedIssues.filter(
          (issue) =>
            !issue.includes("Page is missing") &&
            !issue.includes("Page needs") &&
            !issue.includes("Heading levels"),
        ),
      );
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

// Restoring a published revision re-publishes it, so it must clear the same gate
// as a normal publish. A revision valid when it was saved can still fail now —
// e.g. an image/file asset it references was archived since — so this is
// re-checked against current asset status at restore time. Draft revisions skip
// the gate (restoring them leaves the page a draft).
export async function validateRevisionForRestore(
  revision: Pick<
    PageRevision,
    | "status"
    | "title"
    | "slug"
    | "summary"
    | "ownerLabel"
    | "contactEmail"
    | "lastReviewedDate"
    | "blocks"
  >,
  resolveAssetStatus: AssetStatusResolver,
  checkExcerptSource?: ExcerptSourceChecker,
): Promise<string[]> {
  if (revision.status !== "published") {
    return [];
  }
  return validatePageForPublish(
    {
      title: revision.title,
      slug: revision.slug,
      summary: revision.summary,
      ownerLabel: revision.ownerLabel,
      contactEmail: revision.contactEmail,
      lastReviewedDate: revision.lastReviewedDate,
      blocks: revision.blocks,
    },
    resolveAssetStatus,
    checkExcerptSource,
  );
}
