import { NextResponse } from "next/server";
import {
  deletePageServerDraft,
  getPageServerDraft,
  pageSavedAfterDraft,
  savePageServerDraft,
} from "@/lib/page-server-drafts";
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
  const draft = await getPageServerDraft(pageId, guard.session.userId);
  // Staleness is answered here, against the revision log, rather than by the client comparing
  // hashes of its own editor state — see pageSavedAfterDraft.
  const pageSavedSince = draft ? await pageSavedAfterDraft(pageId, draft.updatedAt) : null;
  return NextResponse.json({ draft, pageSavedSince });
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
  await deletePageServerDraft(pageId, guard.session.userId);
  return NextResponse.json({ ok: true });
}
