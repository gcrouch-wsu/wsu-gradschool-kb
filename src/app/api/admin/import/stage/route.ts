import { NextResponse } from "next/server";
import { createStagedImportFromDocx } from "@/lib/staged-imports";
import { requireAdminMutation } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const kbId = formData?.get("kbId");
  if (!(file instanceof File) || typeof kbId !== "string" || !kbId.trim()) {
    return NextResponse.json({ message: "Knowledge base and .docx file are required." }, { status: 400 });
  }

  try {
    const detail = await createStagedImportFromDocx(kbId.trim(), file, guard.email);
    return NextResponse.json({
      ok: true,
      stagedImportId: detail.import.id,
      reviewUrl: `/admin/import/${detail.import.id}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not stage the import.";
    const status = message.includes("Macro") || message.includes("upload") ? 400 : 422;
    return NextResponse.json({ message }, { status });
  }
}
