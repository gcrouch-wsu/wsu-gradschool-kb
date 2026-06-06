import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  getAllPagesForAdmin,
  getAssetStatusById,
  getKbById,
  getPageByIdForAdmin,
  permanentlyDeletePage,
  updatePage,
} from "@/lib/kb-store";
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

  // Editors may only modify pages in a KB they are assigned to.
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
  const visibility: PageVisibility = body.visibility === "staff" ? "staff" : "public";
  const status: PageStatus = body.status === "published" ? "published" : "draft";
  const sortOrder = typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? body.sortOrder : undefined;
  const parentPath = Array.isArray(body.parentPath)
    ? body.parentPath.filter((segment): segment is string => typeof segment === "string")
    : [];
  const blocks = Array.isArray(body.blocks) ? (body.blocks as ContentBlock[]) : [];

  if (!title) {
    return NextResponse.json({ message: "Title is required." }, { status: 400 });
  }
  if (blocks.length === 0) {
    return NextResponse.json({ message: "A page must have at least one content block." }, { status: 400 });
  }

  // Publishing runs the accessibility + governance gate before any write so a page
  // that fails the checks is never made public (project_spec.md §17).
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
      },
      getAssetStatusById,
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
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not delete page." },
      { status: 500 },
    );
  }
}
