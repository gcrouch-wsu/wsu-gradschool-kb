import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import { getKbById, getPageByIdForAdmin, setKbHomepagePage } from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

interface HomepageBody {
  pageId?: unknown;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ kbId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { kbId } = await context.params;
  const denied = await requireKbAccess(guard.session, kbId);
  if (denied) {
    return denied;
  }

  const body = (await request.json().catch(() => null)) as HomepageBody | null;
  if (!body || !("pageId" in body)) {
    return NextResponse.json({ message: "pageId is required. Use null to clear the homepage." }, { status: 400 });
  }

  const pageId = typeof body.pageId === "string" && body.pageId.trim() ? body.pageId.trim() : null;

  try {
    const page = pageId ? await getPageByIdForAdmin(pageId) : null;
    const kb = await setKbHomepagePage(kbId, pageId);

    await recordAuditEvent({
      session: guard.session,
      action: pageId ? "kb.homepage_set" : "kb.homepage_cleared",
      entityType: "kb",
      entityId: kb.id,
      entityLabel: kb.title,
      kbId: kb.id,
      details: page
        ? { homepagePageId: page.id, homepagePath: page.path.join("/"), homepageTitle: page.title }
        : { homepagePageId: null },
    });

    return NextResponse.json({ ok: true, homepagePageId: kb.homepagePageId ?? null });
  } catch (error) {
    logError(error, { route: "/api/admin/kbs/[kbId]/homepage", action: "update_kb_homepage", kbId, pageId });
    const message = error instanceof Error ? error.message : "Could not update knowledge base homepage.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
