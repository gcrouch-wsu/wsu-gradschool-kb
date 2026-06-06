import { NextResponse } from "next/server";
import { commitStagedImport } from "@/lib/staged-imports";
import { requireAdminMutation } from "@/lib/security";

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
  try {
    const { page, url } = await commitStagedImport(stagedImportId);
    return NextResponse.json({ ok: true, pageId: page.id, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not commit the import.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
