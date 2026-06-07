import { NextResponse } from "next/server";
import { commitStagedImport, getStagedImportDetail } from "@/lib/staged-imports";
import { logError } from "@/lib/log";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ stagedImportId: string }> },
) {
  const guard = await requireAdminMutation(_request);
  if (!guard.ok) {
    return guard.response;
  }

  const { stagedImportId } = await context.params;

  const detail = await getStagedImportDetail(stagedImportId);
  if (!detail) {
    return NextResponse.json({ message: "Staged import not found." }, { status: 404 });
  }
  const denied = await requireKbAccess(guard.session, detail.import.kbId);
  if (denied) return denied;

  try {
    const { page, url } = await commitStagedImport(stagedImportId);
    return NextResponse.json({ ok: true, pageId: page.id, url });
  } catch (error) {
    logError(error, { route: "/api/admin/import/staged/[stagedImportId]/commit", action: "commit_staged_import", stagedImportId });
    const message = error instanceof Error ? error.message : "Could not commit the import.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
