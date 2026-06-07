import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import { createPage } from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  if (!body || !body.kbId || !body.title) {
    return NextResponse.json({ message: "Knowledge base and title are required." }, { status: 400 });
  }

  const denied = await requireKbAccess(guard.session, body.kbId);
  if (denied) {
    return denied;
  }

  try {
    const page = await createPage({
      kbId: body.kbId,
      title: body.title,
      slug: body.slug,
      parentPath: body.parentPath,
      summary: body.summary || "",
      blocks: [{ blockId: `block-${crypto.randomUUID()}`, type: "paragraph", text: "New page content..." }],
    });
    await recordAuditEvent({
      session: guard.session,
      action: "page.created",
      entityType: "page",
      entityId: page.id,
      entityLabel: page.title,
      kbId: page.kbId,
      details: { path: page.path.join("/") },
    });

    return NextResponse.json({ ok: true, pageId: page.id });
  } catch (error) {
    logError(error, { route: "/api/admin/pages", action: "create_page", kbId: body.kbId });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create page." },
      { status: 500 }
    );
  }
}
