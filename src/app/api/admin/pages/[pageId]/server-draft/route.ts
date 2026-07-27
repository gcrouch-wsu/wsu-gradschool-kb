import { NextResponse } from "next/server";
import { deletePageServerDraft, getPageServerDraft, savePageServerDraft } from "@/lib/page-server-drafts";
import { getPageByIdForAdmin } from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";
import type { PageRevisionSnapshot } from "@/lib/types";

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
  const denied = await requireKbAccess(guard.session, page?.kbId);
  if (denied) {
    return denied;
  }
  const draft = await getPageServerDraft(pageId);
  return NextResponse.json({ draft });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ pageId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }
  const { pageId } = await context.params;
  const page = await getPageByIdForAdmin(pageId);
  const denied = await requireKbAccess(guard.session, page?.kbId);
  if (denied) {
    return denied;
  }
  const body = (await request.json().catch(() => null)) as { snapshot?: PageRevisionSnapshot } | null;
  if (!body?.snapshot || typeof body.snapshot !== "object") {
    return NextResponse.json({ message: "Invalid snapshot." }, { status: 400 });
  }
  try {
    const draft = await savePageServerDraft(pageId, guard.session.userId, body.snapshot);
    return NextResponse.json({ draft });
  } catch (error) {
    logError(error, { route: "/api/admin/pages/[pageId]/server-draft", action: "save" });
    return NextResponse.json({ message: "Could not save server draft." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ pageId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }
  const { pageId } = await context.params;
  const page = await getPageByIdForAdmin(pageId);
  const denied = await requireKbAccess(guard.session, page?.kbId);
  if (denied) {
    return denied;
  }
  await deletePageServerDraft(pageId);
  return NextResponse.json({ ok: true });
}
