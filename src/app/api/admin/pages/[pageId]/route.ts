import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  getAllPagesForAdmin,
  getAssetStatusById,
  getExcerptReferencesToPage,
  getKbById,
  getPageByIdForAdmin,
  permanentlyDeletePage,
  updatePage,
} from "@/lib/kb-store";
import {
  checkExcerptSourceForPublish,
  excerptAudienceFor,
  excerptSourceCheckerFor,
} from "@/lib/excerpts";
import { logError } from "@/lib/log";
import { dedupeContentBlockIds } from "@/lib/page-document";
import { normalizePageTags } from "@/lib/page-tags";
import { validatePageForPublish } from "@/lib/publish-gate";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";
import { canPublishInKb } from "@/lib/auth-roles";
import type { ContentBlock, PageStatus, PageVisibility } from "@/lib/types";

interface UpdateBody {
  title?: unknown;
  slug?: unknown;
  parentPath?: unknown;
  summary?: unknown;
  tags?: unknown;
  visibility?: unknown;
  status?: unknown;
  sortOrder?: unknown;
  blocks?: unknown;
  ownerLabel?: unknown;
  contactEmail?: unknown;
  lastReviewedDate?: unknown;
  showToc?: unknown;
  tocDepth?: unknown;
  showSummary?: unknown;
  showPrintButton?: unknown;
  nextReviewDate?: unknown;
  reviewAssigneeEmail?: unknown;
  reviewSlaDays?: unknown;
  publishAt?: unknown;
  linkUrl?: unknown;
  linkNewTab?: unknown;
  relatedPageIds?: unknown;
  nextStepsHeading?: unknown;
  nextStepsIntro?: unknown;
}

function isValidTreeLinkDestination(value: string) {
  return /^(https:\/\/|\/)/.test(value.trim());
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ pageId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { pageId } = await context.params;

  const existingPage = await getPageByIdForAdmin(pageId);
  const denied = await requireKbAccess(guard.session, existingPage?.kbId);
  if (denied) {
    return denied;
  }

  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug : undefined;
  const summary = typeof body.summary === "string" ? body.summary : undefined;
  const tags = body.tags === undefined ? undefined : normalizePageTags(body.tags);
  const ownerLabel = typeof body.ownerLabel === "string" ? body.ownerLabel : undefined;
  const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail : undefined;
  const lastReviewedDate = typeof body.lastReviewedDate === "string" ? body.lastReviewedDate : undefined;
  const showToc = typeof body.showToc === "boolean" ? body.showToc : undefined;
  const tocDepth = typeof body.tocDepth === "number" ? body.tocDepth : undefined;
  const showSummary = typeof body.showSummary === "boolean" ? body.showSummary : undefined;
  const showPrintButton = typeof body.showPrintButton === "boolean" ? body.showPrintButton : undefined;
  const nextReviewDate = typeof body.nextReviewDate === "string" ? body.nextReviewDate : undefined;
  const reviewAssigneeEmail =
    typeof body.reviewAssigneeEmail === "string" ? body.reviewAssigneeEmail.trim().slice(0, 200) : undefined;
  const reviewSlaDays =
    typeof body.reviewSlaDays === "number" && Number.isFinite(body.reviewSlaDays)
      ? Math.min(365, Math.max(1, Math.round(body.reviewSlaDays)))
      : body.reviewSlaDays === null
        ? null
        : undefined;
  const publishAt =
    body.publishAt === null
      ? null
      : typeof body.publishAt === "string"
        ? body.publishAt.trim() || null
        : undefined;
  const visibility: PageVisibility = body.visibility === "staff" ? "staff" : "public";
  const status: PageStatus =
    body.status === "published" ? "published" : body.status === "proposed" ? "proposed" : "draft";
  const sortOrder = typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? body.sortOrder : undefined;
  const parentPath = Array.isArray(body.parentPath)
    ? body.parentPath.filter((segment): segment is string => typeof segment === "string")
    : [];
  const blocks = Array.isArray(body.blocks) ? dedupeContentBlockIds(body.blocks as ContentBlock[]) : [];

  const nodeKind = existingPage?.nodeKind ?? "page";
  const linkUrl =
    typeof body.linkUrl === "string" ? body.linkUrl.trim().slice(0, 500) : undefined;
  const linkNewTab = typeof body.linkNewTab === "boolean" ? body.linkNewTab : undefined;
  const relatedPageIds = Array.isArray(body.relatedPageIds)
    ? body.relatedPageIds.filter((id): id is string => typeof id === "string")
    : undefined;
  const nextStepsHeading =
    typeof body.nextStepsHeading === "string" ? body.nextStepsHeading.trim().slice(0, 120) : undefined;
  const nextStepsIntro =
    typeof body.nextStepsIntro === "string" ? body.nextStepsIntro.trim().slice(0, 240) : undefined;
  const nextLinkUrl = linkUrl ?? existingPage?.linkUrl ?? "";
  const canPublish = await canPublishInKb(guard.session, existingPage!.kbId);

  if (!title) {
    return NextResponse.json({ message: "Title is required." }, { status: 400 });
  }
  if (blocks.length === 0 && nodeKind === "page") {
    return NextResponse.json({ message: "A page must have at least one content block." }, { status: 400 });
  }
  if (nodeKind === "link" && !isValidTreeLinkDestination(nextLinkUrl)) {
    return NextResponse.json(
      { message: "A link item needs a destination: an https:// URL or an internal path starting with /." },
      { status: 400 },
    );
  }

  if (body.publishAt !== undefined && !canPublish) {
    return NextResponse.json(
      { message: "Only an owner, admin, or KB manager can schedule publishing." },
      { status: 403 },
    );
  }

  if (status === "published" && !canPublish) {
    return NextResponse.json(
      { message: "Only an owner, admin, or KB manager can publish pages. Submit the page for review instead." },
      { status: 403 },
    );
  }

  if (status === "published") {
    const kb = await getKbById(existingPage!.kbId);
    const issues = await validatePageForPublish(
      {
        title,
        slug: slug ?? "",
        summary: summary ?? "",
        ownerLabel: ownerLabel ?? "",
        contactEmail: contactEmail ?? "",
        lastReviewedDate: lastReviewedDate ?? "",
        blocks,
        nodeKind,
        linkUrl: nextLinkUrl,
      },
      getAssetStatusById,
      kb
        ? excerptSourceCheckerFor(excerptAudienceFor(kb, { visibility }))
        : checkExcerptSourceForPublish,
      { requireSummary: kb?.requireSummary !== false },
    );
    if (issues.length > 0) {
      return NextResponse.json(
        { message: "This page cannot be published yet. Resolve the issues below and try again.", issues },
        { status: 422 },
      );
    }
  }

  try {
    const page = await updatePage({
      pageId,
      title,
      slug,
      summary,
      tags,
      visibility,
      parentPath,
      status,
      sortOrder,
      blocks,
      ownerLabel,
      contactEmail,
      lastReviewedDate,
      showToc,
      tocDepth,
      showSummary,
      showPrintButton,
      nextReviewDate,
      reviewAssigneeEmail,
      reviewSlaDays,
      publishAt,
      linkUrl,
      linkNewTab,
      relatedPageIds,
      nextStepsHeading,
      nextStepsIntro,
    }, guard.session.email);
    await recordAuditEvent({
      session: guard.session,
      action:
        status === "published"
          ? "page.published"
          : status === "proposed"
            ? "page.proposed"
            : "page.updated",
      entityType: "page",
      entityId: page.id,
      entityLabel: page.title,
      kbId: page.kbId,
      details: { status: page.status, path: page.path.join("/") },
    });
    const kb = await getKbById(page.kbId);
    const url = kb ? `/kb/${kb.slug}/${page.path.join("/")}` : null;
    return NextResponse.json({ ok: true, pageId: page.id, status: page.status, url });
  } catch (error) {
    logError(error, { route: "/api/admin/pages/[pageId]", action: "update_page", pageId });
    const message = error instanceof Error ? error.message : "Could not update the page.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ pageId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const { pageId } = await context.params;

  try {
    if (guard.session.role !== "owner" && guard.session.role !== "admin") {
      return NextResponse.json({ message: "Only owners and admins can permanently delete pages." }, { status: 403 });
    }
    const page = await getPageByIdForAdmin(pageId);
    if (!page) {
      return NextResponse.json({ message: "Page not found." }, { status: 404 });
    }
    const denied = await requireKbAccess(guard.session, page.kbId);
    if (denied) {
      return denied;
    }
    if (page.status !== "archived") {
      return NextResponse.json({ message: "Archive this page before permanently deleting it." }, { status: 409 });
    }
    const pages = await getAllPagesForAdmin(page.kbId);
    const hasChildren = pages.some(
      (candidate) =>
        candidate.id !== page.id &&
        candidate.path.length > page.path.length &&
        page.path.every((segment, index) => candidate.path[index] === segment),
    );
    if (hasChildren) {
      return NextResponse.json({ message: "Move or delete child pages before deleting this page." }, { status: 409 });
    }
    const referencedBy = pages.find((candidate) => candidate.relatedPageIds.includes(page.id));
    if (referencedBy) {
      return NextResponse.json(
        { message: `Remove the related-page reference from "${referencedBy.title}" before deleting this page.` },
        { status: 409 },
      );
    }
    const excerptRefs = await getExcerptReferencesToPage(page.id);
    if (excerptRefs.length > 0) {
      return NextResponse.json(
        { message: `Remove the included excerpt on "${excerptRefs[0].pageTitle}" before deleting this page.` },
        { status: 409 },
      );
    }
    await permanentlyDeletePage(pageId);
    await recordAuditEvent({
      session: guard.session,
      action: "page.deleted",
      entityType: "page",
      entityId: page.id,
      entityLabel: page.title,
      kbId: page.kbId,
      details: { path: page.path.join("/") },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(error, { route: "/api/admin/pages/[pageId]", action: "delete_page", pageId });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not delete page." },
      { status: 500 },
    );
  }
}
