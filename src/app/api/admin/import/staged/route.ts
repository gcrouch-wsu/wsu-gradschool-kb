import { NextResponse } from "next/server";
import { listStagedImportsForAdmin } from "@/lib/staged-imports";
import { requireAdminMutation } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const kbId = new URL(request.url).searchParams.get("kb") ?? undefined;
  const imports = await listStagedImportsForAdmin(kbId || undefined);
  return NextResponse.json({ ok: true, imports });
}
