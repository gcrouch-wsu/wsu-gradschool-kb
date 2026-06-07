import { NextResponse } from "next/server";
import { getPageByIdForAdmin, verifyPage } from "@/lib/kb-store";
import { requireKbAccess, requireAdminMutation } from "@/lib/security";
import { recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const { pageId } = await params;

  try {
    const page = await getPageByIdForAdmin(pageId);
    if (!page) {
      return NextResponse.json({ message: "Page not found." }, { status: 404 });
    }

    const accessError = await requireKbAccess(guard.session, page.kbId);
    if (accessError) return accessError;

    const { verifiedAt, verifiedBy, nextReviewDate } = await verifyPage(page, guard.email);

    await recordAuditEvent({
      session: guard.session,
      action: "verify_page",
      entityType: "page",
      entityId: page.id,
      entityLabel: page.title,
      kbId: page.kbId,
      details: { nextReviewDate },
    });

    return NextResponse.json({ ok: true, verifiedAt, verifiedBy, nextReviewDate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify page.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
