import { NextResponse } from "next/server";
import { getPageByIdForAdmin } from "@/lib/kb-store";
import { updatePages } from "@/lib/db";
import { requireKbAccess, requireAdminMutation } from "@/lib/security";
import { recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const { pageId } = await params;
  const page = await getPageByIdForAdmin(pageId);
  if (!page) {
    return NextResponse.json({ message: "Page not found." }, { status: 404 });
  }

  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const accessError = await requireKbAccess(guard.session, page.kbId);
  if (accessError) return accessError;

  const now = new Date();
  const nextReview = new Date();
  nextReview.setMonth(now.getMonth() + 6);

  const updatedPage = {
    ...page,
    verifiedAt: now.toISOString(),
    verifiedBy: guard.email,
    nextReviewDate: nextReview.toISOString().split("T")[0],
  };

  await updatePages([updatedPage], guard.email);

  await recordAuditEvent({
    session: guard.session,
    action: "verify_page",
    entityType: "page",
    entityId: page.id,
    entityLabel: page.title,
    kbId: page.kbId,
    details: { nextReviewDate: updatedPage.nextReviewDate },
  });

  return NextResponse.json({
    ok: true,
    verifiedAt: updatedPage.verifiedAt,
    verifiedBy: updatedPage.verifiedBy,
    nextReviewDate: updatedPage.nextReviewDate,
  });
}
