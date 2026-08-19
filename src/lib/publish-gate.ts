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

export interface PublishGateOptions {
  /** When false, a blank summary does not block publish. Default true. */
  requireSummary?: boolean;
}

const EXCERPT_ISSUES: Record<Exclude<ExcerptSourceState, "ok">, string> = {
  missing: "An included excerpt references a page that no longer exists. Remove or repoint the excerpt.",
  unpublished: "An included excerpt references a page that is not published.",
  section_missing: "An included excerpt references a section that no longer exists on its source page.",
  unreachable:
    "An included excerpt points at a page this page's readers cannot open, so they would only ever see an \"unavailable\" callout. Point it at a source with the same or wider audience.",
};

// Headings reach the public outline from three places, not one: heading blocks, procedure
// section titles, and card titles (rendered at `titleLevel`, default 2). Walking them
// together in document order is what makes a card titled H3 before any H2 count as the same
// skip a bare H3 there would be. Nested blocks are walked here rather than by the recursive
// validate call below, which deliberately drops nested "Heading levels" issues so the same
// problem is not reported twice.
/**
 * Shared by the server gate and the editor's readiness panel so the two cannot drift —
 * a panel that says "ready" and then 422s on publish is worse than no panel (FB-44).
 */
export function hasHeadingOrderSkip(blocks: ContentBlock[]): boolean {
  let seenLevel2 = false;
  for (const level of collectHeadingLevels(blocks)) {
    if (level === 2) {
      seenLevel2 = true;
    } else if (level === 3 && !seenLevel2) {
      return true;
    }
  }
  return false;
}

export function collectHeadingLevels(blocks: ContentBlock[]): number[] {
  const levels: number[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        levels.push(block.level);
        break;
      case "procedure_section":
        levels.push(block.level);
        levels.push(...collectHeadingLevels(block.blocks));
        break;
      case "card":
        if ((block.title ?? "").trim()) {
          levels.push(block.titleLevel ?? 2);
        }
        levels.push(...collectHeadingLevels(block.blocks));
        break;
      case "sourced":
        levels.push(...collectHeadingLevels(block.blocks));
        break;
      default:
        break;
    }
  }
  return levels;
}

/** Sync metadata checks used by the publish gate and the Pages tree badges. */
export function collectMetadataPublishIssues(
  page: PublishablePage,
  options: PublishGateOptions = {},
): string[] {
  const issues: string[] = [];
  const requireSummary = options.requireSummary !== false;

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
  if (requireSummary && !page.summary.trim()) {
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
  return issues;
}

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

export const EMPTY_IMAGE_BOX_ISSUE =
  "An image box is empty. Paste or upload an image, or remove the box.";

/**
 * Paste-slot image boxes (`!assetId && !url`) waiting to be filled.
 *
 * Shared with `AdminPageEditorForm`'s readiness panel for the same reason
 * `hasHeadingOrderSkip` is: a client-side reimplementation is what lets a page
 * report "ready" and then 422 on publish.
 */
export function countEmptyImageBoxes(blocks: ContentBlock[]): number {
  let count = 0;
  for (const block of blocks) {
    if (block.type === "image") {
      if (!block.assetId && !block.url) {
        count += 1;
      }
    } else if (
      block.type === "card" ||
      block.type === "procedure_section" ||
      block.type === "sourced"
    ) {
      count += countEmptyImageBoxes(block.blocks);
    }
  }
  return count;
}

export async function validatePageForPublish(
  page: PublishablePage,
  resolveAssetStatus: AssetStatusResolver,
  checkExcerptSource?: ExcerptSourceChecker,
  options: PublishGateOptions = {},
): Promise<string[]> {
  const issues = collectMetadataPublishIssues(page, options);

  // Group headings and links are tree structure, not content: they publish on
  // a title (and a valid destination for links) alone.
  if ((page.nodeKind ?? "page") !== "page") {
    return issues;
  }

  if (hasHeadingOrderSkip(page.blocks)) {
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
      if (!hasImage) {
        issues.push(EMPTY_IMAGE_BOX_ISSUE);
      }
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
    | "nodeKind"
    | "linkUrl"
  >,
  resolveAssetStatus: AssetStatusResolver,
  checkExcerptSource?: ExcerptSourceChecker,
  options: PublishGateOptions = {},
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
      nodeKind: revision.nodeKind,
      linkUrl: revision.linkUrl,
    },
    resolveAssetStatus,
    checkExcerptSource,
    options,
  );
}
