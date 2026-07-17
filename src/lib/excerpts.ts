import type { AdminSession } from "@/lib/auth";
import { getKbReadAccess } from "@/lib/auth";
import { getKbById, getPageByIdForAdmin, getPageByPath } from "@/lib/kb-store";
import { richTextToPlainText, textToRichText } from "@/lib/rich-text";
import type { ContentBlock, KbPage, KnowledgeBase } from "@/lib/types";

export type ExcerptBlockRef = Pick<
  Extract<ContentBlock, { type: "excerpt" }>,
  "sourcePageId" | "sourceHeadingBlockId"
>;

export type ResolvedExcerpt =
  | {
      state: "ok";
      kbTitle: string;
      sourceTitle: string;
      sourceHref: string;
      sectionTitle?: string;
      blocks: ContentBlock[];
    }
  | { state: "unavailable" };

// The reader-facing attribution: a custom label wins; otherwise KB, page, and
// section are all named so readers know the origin without following the link.
export function excerptAttributionLabel(
  resolved: Extract<ResolvedExcerpt, { state: "ok" }>,
  customLabel?: string,
): string {
  const custom = (customLabel ?? "").trim();
  if (custom) {
    return custom;
  }
  const base = `${resolved.kbTitle}: ${resolved.sourceTitle}`;
  return resolved.sectionTitle ? `${base} — ${resolved.sectionTitle}` : base;
}

const UNAVAILABLE: ResolvedExcerpt = { state: "unavailable" };

function newBlockId() {
  return `block-${crypto.randomUUID()}`;
}

function headingPlainText(block: Extract<ContentBlock, { type: "heading" }>): string {
  return (block.text || richTextToPlainText(block.html ?? "")).trim();
}

// Locate the excerpted section: from the referenced top-level heading (or
// procedure section) up to the next top-level heading of the same or higher
// level. No reference = the whole page body.
export function extractExcerptSection(
  blocks: ContentBlock[],
  sourceHeadingBlockId?: string,
): { sectionTitle?: string; blocks: ContentBlock[] } | null {
  if (!sourceHeadingBlockId) {
    return { blocks };
  }
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.blockId !== sourceHeadingBlockId) {
      continue;
    }
    if (block.type === "procedure_section") {
      return { sectionTitle: block.title, blocks: block.blocks };
    }
    if (block.type !== "heading") {
      return null;
    }
    const section: ContentBlock[] = [];
    for (let cursor = index + 1; cursor < blocks.length; cursor += 1) {
      const candidate = blocks[cursor];
      const level =
        candidate.type === "heading" || candidate.type === "procedure_section" ? candidate.level : null;
      if (level !== null && level <= block.level) {
        break;
      }
      section.push(candidate);
    }
    return { sectionTitle: headingPlainText(block), blocks: section };
  }
  return null;
}

// Excerpted content joins the target page's reading flow, so it must not
// contribute outline headings (the target's heading hierarchy, TOC, and
// publish gate only know the target's own blocks). Headings become bold
// paragraphs, procedure sections flatten, and nested excerpts are not
// resolved further — the depth cap that makes cycles impossible.
export function demoteExcerptBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const demoted: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === "heading") {
      const inner = block.html ?? "";
      demoted.push({
        blockId: block.blockId,
        type: "paragraph",
        text: block.text,
        html: `<strong>${inner || textToRichText(block.text)}</strong>`,
        align: block.align,
      });
      continue;
    }
    if (block.type === "procedure_section") {
      demoted.push({
        blockId: block.blockId,
        type: "paragraph",
        text: block.title,
        html: `<strong>${textToRichText(block.title)}</strong>`,
      });
      demoted.push(...demoteExcerptBlocks(block.blocks));
      continue;
    }
    if (block.type === "card") {
      demoted.push({ ...block, blocks: demoteExcerptBlocks(block.blocks) });
      continue;
    }
    if (block.type === "excerpt") {
      demoted.push({
        blockId: newBlockId(),
        type: "paragraph",
        text: "Content included from another page is not shown here. Read it on the source page.",
      });
      continue;
    }
    if (block.type === "sourced") {
      demoted.push({ ...block, blocks: demoteExcerptBlocks(block.blocks) });
      continue;
    }
    demoted.push(block);
  }
  return demoted;
}

function resolveFromVisibleSource(
  ref: ExcerptBlockRef,
  page: { title: string; blocks: ContentBlock[]; path: string[]; id: string },
  kb: { slug: string; title: string; homepagePageId?: string | null },
): ResolvedExcerpt {
  const section = extractExcerptSection(page.blocks, ref.sourceHeadingBlockId);
  if (!section) {
    return UNAVAILABLE;
  }
  const isKbHomepage = kb.homepagePageId === page.id;
  const basePath = isKbHomepage ? `/kb/${kb.slug}` : `/kb/${kb.slug}/${page.path.join("/")}`;
  const anchor = ref.sourceHeadingBlockId ? `#${ref.sourceHeadingBlockId}` : "";
  return {
    state: "ok",
    kbTitle: kb.title,
    sourceTitle: page.title,
    sourceHref: `${basePath}${anchor}`,
    sectionTitle: section.sectionTitle,
    blocks: demoteExcerptBlocks(section.blocks),
  };
}

// Resolve an excerpt reference for the current reader. Every failure mode —
// missing page, KB the reader cannot read, unpublished or staff-only source,
// vanished heading — collapses to the same "unavailable" state so a private
// source is indistinguishable from a deleted one.
export async function resolveExcerptForRead(
  ref: ExcerptBlockRef,
  session: AdminSession | null,
): Promise<ResolvedExcerpt> {
  if (!ref.sourcePageId) {
    return UNAVAILABLE;
  }
  const page = await getPageByIdForAdmin(ref.sourcePageId);
  if (!page) {
    return UNAVAILABLE;
  }
  const kb = await getKbById(page.kbId);
  if (!kb) {
    return UNAVAILABLE;
  }
  const access = await getKbReadAccess(session, kb);
  if (!access.canRead) {
    return UNAVAILABLE;
  }
  // Path lookup applies the same status + staff-ancestor visibility rules as
  // the public article route (draft/archived and staff-only sources resolve
  // to null for readers without staff access).
  const visible = await getPageByPath(page.kbId, page.path, access.canReadStaffContent);
  if (!visible || visible.id !== page.id) {
    return UNAVAILABLE;
  }
  return resolveFromVisibleSource(ref, page, kb);
}

export async function getReadableExcerptSourcePageForPicker(
  pageId: string,
  session: AdminSession,
): Promise<{ page: KbPage; kb: KnowledgeBase } | null> {
  const page = await getPageByIdForAdmin(pageId);
  if (!page) {
    return null;
  }
  const kb = await getKbById(page.kbId);
  if (!kb) {
    return null;
  }
  const access = await getKbReadAccess(session, kb);
  if (!access.canRead) {
    return null;
  }
  const visible = await getPageByPath(page.kbId, page.path, access.canReadStaffContent);
  if (!visible || visible.id !== page.id) {
    return null;
  }
  return { page: visible, kb };
}

// Owner-only KB export inlines excerpt content without reader gating: the
// export is a full-fidelity backup and its caller is already role-checked.
export async function resolveExcerptForExport(ref: ExcerptBlockRef): Promise<ResolvedExcerpt> {
  if (!ref.sourcePageId) {
    return UNAVAILABLE;
  }
  const page = await getPageByIdForAdmin(ref.sourcePageId);
  if (!page || page.status === "archived") {
    return UNAVAILABLE;
  }
  const kb = await getKbById(page.kbId);
  if (!kb) {
    return UNAVAILABLE;
  }
  return resolveFromVisibleSource(ref, page, kb);
}

export type ExcerptSourceState = "ok" | "missing" | "unpublished" | "section_missing";

// Publish-gate helper: unlike resolveExcerptForRead this is author-facing and
// names the specific problem, because the editor needs to fix it.
export async function checkExcerptSourceForPublish(ref: ExcerptBlockRef): Promise<ExcerptSourceState> {
  if (!ref.sourcePageId) {
    return "missing";
  }
  const page = await getPageByIdForAdmin(ref.sourcePageId);
  if (!page) {
    return "missing";
  }
  if (page.status !== "published") {
    return "unpublished";
  }
  if (!extractExcerptSection(page.blocks, ref.sourceHeadingBlockId)) {
    return "section_missing";
  }
  return "ok";
}
