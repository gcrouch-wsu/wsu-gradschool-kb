import { NextResponse } from "next/server";
import { getPageByIdForAdmin } from "@/lib/kb-store";
import { updatePageLifecycle } from "@/lib/db";
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
  const page = await getPageByIdForAdmin(pageId);
  if (!page) {
    return NextResponse.json({ message: "Page not found." }, { status: 404 });
  }

  const accessError = await requireKbAccess(guard.session, page.kbId);
  if (accessError) return accessError;

  const now = new Date();
  const nextReview = new Date();
  nextReview.setMonth(now.getMonth() + 6);

  const verifiedAt = now.toISOString();
  const verifiedBy = guard.email;
  const nextReviewDate = nextReview.toISOString().split("T")[0];

  await updatePageLifecycle(page.id, { verifiedAt, verifiedBy, nextReviewDate });

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
}
