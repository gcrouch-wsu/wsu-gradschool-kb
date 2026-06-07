import { NextResponse } from "next/server";
import { listStagedImportsForAdmin } from "@/lib/staged-imports";
import { accessibleKbIds } from "@/lib/auth";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const kbId = new URL(request.url).searchParams.get("kb") ?? undefined;
  if (kbId) {
    const denied = await requireKbAccess(guard.session, kbId);
    if (denied) {
      return denied;
    }
    const imports = await listStagedImportsForAdmin(kbId);
    return NextResponse.json({ ok: true, imports });
  }

  const allowed = await accessibleKbIds(guard.session);
  const all = await listStagedImportsForAdmin();
  const imports = allowed === null ? all : all.filter((row) => allowed.includes(row.kbId));
  return NextResponse.json({ ok: true, imports });
}
