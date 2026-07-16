import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  getAssetStatusById,
  getKbById,
  getPageByIdForAdmin,
  getPageRevision,
  restorePageRevision,
} from "@/lib/kb-store";
import { checkExcerptSourceForPublish } from "@/lib/excerpts";
import { logError } from "@/lib/log";
import { validateRevisionForRestore } from "@/lib/publish-gate";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

// Restore a page to a past revision. This creates a NEW save (and a new
// "restore" revision) rather than rewriting history, and goes through the normal
// page-write path so edit-lock semantics are preserved.
export async function POST(
  request: Request,
  context: { params: Promise<{ pageId: string; revisionId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { pageId, revisionId } = await context.params;

  const page = await getPageByIdForAdmin(pageId);
  const denied = await requireKbAccess(guard.session, page?.kbId);
  if (denied) {
    return denied;
  }

  const revision = await getPageRevision(revisionId);
  if (!page || !revision || revision.pageId !== page.id) {
    return NextResponse.json({ message: "Revision not found." }, { status: 404 });
  }

  // Restoring a published revision re-publishes it, so it must clear the publish
  // gate — mirror the normal save route's 422-with-issues response.
  const issues = await validateRevisionForRestore(revision, getAssetStatusById, checkExcerptSourceForPublish);
  if (issues.length > 0) {
    return NextResponse.json(
      {
        message: "This revision cannot be restored while published. Resolve the issues below and try again.",
        issues,
      },
      { status: 422 },
    );
  }

  try {
    const restored = await restorePageRevision(revisionId, guard.session.email);
    await recordAuditEvent({
      session: guard.session,
      action: "page.restored",
      entityType: "page",
      entityId: restored.id,
      entityLabel: restored.title,
      kbId: restored.kbId,
      details: {
        restoredFromRevision: revision.revisionNumber,
        status: restored.status,
        path: restored.path.join("/"),
      },
    });
    const kb = await getKbById(restored.kbId);
    const url = kb ? `/kb/${kb.slug}/${restored.path.join("/")}` : null;
    return NextResponse.json({ ok: true, pageId: restored.id, status: restored.status, url });
  } catch (error) {
    logError(error, {
      route: "/api/admin/pages/[pageId]/revisions/[revisionId]/restore",
      action: "restore_revision",
      pageId,
      revisionId,
    });
    const message = error instanceof Error ? error.message : "Could not restore revision.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
