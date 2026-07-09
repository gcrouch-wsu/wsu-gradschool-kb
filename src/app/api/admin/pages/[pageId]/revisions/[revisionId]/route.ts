import { NextResponse } from "next/server";
import { canAccessKb, getCurrentAdminSession } from "@/lib/auth";
import { getPageByIdForAdmin, getPageRevision } from "@/lib/kb-store";
import { logError } from "@/lib/log";

// Fetch a single revision's full snapshot (including blocks) for read-only
// preview in the History panel.
export async function GET(
  request: Request,
  context: { params: Promise<{ pageId: string; revisionId: string }> },
) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { pageId, revisionId } = await context.params;
  const page = await getPageByIdForAdmin(pageId);
  if (!page) {
    return NextResponse.json({ message: "Page not found." }, { status: 404 });
  }
  if (!(await canAccessKb(session, page.kbId))) {
    return NextResponse.json({ message: "You are not assigned to this knowledge base." }, { status: 403 });
  }

  try {
    const revision = await getPageRevision(revisionId);
    if (!revision || revision.pageId !== page.id) {
      return NextResponse.json({ message: "Revision not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, revision });
  } catch (error) {
    logError(error, {
      route: "/api/admin/pages/[pageId]/revisions/[revisionId]",
      action: "get_revision",
      pageId,
      revisionId,
    });
    return NextResponse.json({ message: "Could not load revision." }, { status: 500 });
  }
}
