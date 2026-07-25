import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  getAllPageSummariesForAdmin,
  getKbById,
  getPageByIdForAdmin,
  relocatePage,
  type RelocateMode,
} from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ pageId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { pageId } = await context.params;
  const page = await getPageByIdForAdmin(pageId);
  const deniedSource = await requireKbAccess(guard.session, page?.kbId);
  if (deniedSource) {
    return deniedSource;
  }

  const url = new URL(request.url);
  const targetKbId = url.searchParams.get("targetKbId")?.trim() || "";
  if (!targetKbId) {
    return NextResponse.json({ message: "targetKbId is required." }, { status: 400 });
  }

  const deniedTarget = await requireKbAccess(guard.session, targetKbId);
  if (deniedTarget) {
    return deniedTarget;
  }

  const targetKb = await getKbById(targetKbId);
  if (!targetKb) {
    return NextResponse.json({ message: "Destination knowledge base not found." }, { status: 404 });
  }

  const parents = (await getAllPageSummariesForAdmin(targetKbId))
    .filter((candidate) => candidate.status !== "archived" && (candidate.nodeKind ?? "page") !== "link")
    .filter((candidate) => {
      if (candidate.kbId !== page!.kbId) return true;
      // Same-KB copy: cannot nest under self or descendants.
      return (
        candidate.id !== page!.id &&
        !(
          candidate.path.length >= page!.path.length &&
          page!.path.every((segment, index) => candidate.path[index] === segment)
        )
      );
    })
    .map((candidate) => ({
      path: candidate.path.join("/"),
      title: candidate.title,
      depth: candidate.path.length,
      status: candidate.status,
    }));

  return NextResponse.json({
    targetKb: { id: targetKb.id, title: targetKb.title, slug: targetKb.slug },
    parents,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ pageId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { pageId } = await context.params;
  const page = await getPageByIdForAdmin(pageId);
  const deniedSource = await requireKbAccess(guard.session, page?.kbId);
  if (deniedSource) {
    return deniedSource;
  }

  const body = (await request.json().catch(() => null)) as {
    mode?: unknown;
    targetKbId?: unknown;
    parentPath?: unknown;
    includeChildren?: unknown;
  } | null;

  const mode: RelocateMode | null = body?.mode === "copy" || body?.mode === "move" ? body.mode : null;
  const targetKbId = typeof body?.targetKbId === "string" ? body.targetKbId.trim() : "";
  const parentPath = Array.isArray(body?.parentPath)
    ? body.parentPath.filter((segment): segment is string => typeof segment === "string")
    : [];
  const includeChildren = body?.includeChildren !== false;

  if (!mode || !targetKbId) {
    return NextResponse.json({ message: "mode and targetKbId are required." }, { status: 400 });
  }

  const deniedTarget = await requireKbAccess(guard.session, targetKbId);
  if (deniedTarget) {
    return deniedTarget;
  }

  try {
    const result = await relocatePage({
      pageId,
      targetKbId,
      parentPath,
      mode,
      includeChildren,
      authorEmail: guard.session.email,
    });

    await recordAuditEvent({
      session: guard.session,
      action: mode === "copy" ? "page.copy_to_kb" : "page.move_to_kb",
      entityType: "page",
      entityId: result.rootPage.id,
      entityLabel: result.rootPage.title,
      kbId: result.targetKbId,
      details: {
        sourceKbId: result.sourceKbId,
        targetKbId: result.targetKbId,
        sourcePageId: pageId,
        pageCount: result.pages.length,
        parentPath,
      },
    });

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      pageId: result.rootPage.id,
      kbId: result.targetKbId,
      path: result.rootPage.path,
      pageCount: result.pages.length,
      editHref: `/admin/pages/${result.rootPage.id}`,
    });
  } catch (error) {
    logError(error, { route: `/api/admin/pages/${pageId}/relocate`, action: "relocate" });
    const message = error instanceof Error ? error.message : "Could not relocate the page.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
