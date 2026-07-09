import { NextResponse } from "next/server";
import { canAccessKb, getCurrentAdminSession } from "@/lib/auth";
import { getPageByIdForAdmin, listPageRevisions } from "@/lib/kb-store";
import { logError } from "@/lib/log";

// List the saved revisions for a page (newest first, metadata only).
export async function GET(request: Request, context: { params: Promise<{ pageId: string }> }) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { pageId } = await context.params;
  const page = await getPageByIdForAdmin(pageId);
  if (!page) {
    return NextResponse.json({ message: "Page not found." }, { status: 404 });
  }
  if (!(await canAccessKb(session, page.kbId))) {
    return NextResponse.json({ message: "You are not assigned to this knowledge base." }, { status: 403 });
  }

  try {
    const revisions = await listPageRevisions(page.id);
    return NextResponse.json({ ok: true, revisions });
  } catch (error) {
    logError(error, { route: "/api/admin/pages/[pageId]/revisions", action: "list_revisions", pageId });
    return NextResponse.json({ message: "Could not load revision history." }, { status: 500 });
  }
}
