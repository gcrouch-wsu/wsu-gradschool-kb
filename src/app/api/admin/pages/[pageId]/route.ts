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
import { checkExcerptSourceForPublish } from "@/lib/excerpts";
import { logError } from "@/lib/log";
import { validatePageForPublish } from "@/lib/publish-gate";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";
import type { ContentBlock, PageStatus, PageVisibility } from "@/lib/types";

interface UpdateBody {
  title?: unknown;
  slug?: unknown;
  parentPath?: unknown;
  summary?: unknown;
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
  linkUrl?: unknown;
  linkNewTab?: unknown;
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
  const ownerLabel = typeof body.ownerLabel === "string" ? body.ownerLabel : undefined;
  const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail : undefined;
  const lastReviewedDate = typeof body.lastReviewedDate === "string" ? body.lastReviewedDate : undefined;
  const showToc = typeof body.showToc === "boolean" ? body.showToc : undefined;
  const tocDepth = typeof body.tocDepth === "number" ? body.tocDepth : undefined;
  const showSummary = typeof body.showSummary === "boolean" ? body.showSummary : undefined;
  const showPrintButton = typeof body.showPrintButton === "boolean" ? body.showPrintButton : undefined;
  const nextReviewDate = typeof body.nextReviewDate === "string" ? body.nextReviewDate : undefined;
  const visibility: PageVisibility = body.visibility === "staff" ? "staff" : "public";
  const status: PageStatus = body.status === "published" ? "published" : "draft";
  const sortOrder = typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? body.sortOrder : undefined;
  const parentPath = Array.isArray(body.parentPath)
    ? body.parentPath.filter((segment): segment is string => typeof segment === "string")
    : [];
  const blocks = Array.isArray(body.blocks) ? (body.blocks as ContentBlock[]) : [];

  const nodeKind = existingPage?.nodeKind ?? "page";
  const linkUrl =
    typeof body.linkUrl === "string" ? body.linkUrl.trim().slice(0, 500) : undefined;
  const linkNewTab = typeof body.linkNewTab === "boolean" ? body.linkNewTab : undefined;

  if (!title) {
    return NextResponse.json({ message: "Title is required." }, { status: 400 });
  }
  if (blocks.length === 0 && nodeKind === "page") {
    return NextResponse.json({ message: "A page must have at least one content block." }, { status: 400 });
  }

  if (status === "published") {
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
        linkUrl: linkUrl ?? existingPage?.linkUrl ?? "",
      },
      getAssetStatusById,
      checkExcerptSourceForPublish,
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
      linkUrl,
      linkNewTab,
    }, guard.session.email);
    await recordAuditEvent({
      session: guard.session,
      action: status === "published" ? "page.published" : "page.updated",
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
