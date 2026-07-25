import { NextResponse } from "next/server";
import { accessibleKbIds } from "@/lib/auth";
import { scanSourcedContentForReview } from "@/lib/sourced-review";
import { logError } from "@/lib/log";
import { requireAdminMutation } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  try {
    const allowed = await accessibleKbIds(guard.session);
    const result = await scanSourcedContentForReview(allowed);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logError(error, { route: "/api/admin/sourced-content/scan", action: "scan" });
    const message = error instanceof Error ? error.message : "Could not scan sourced content.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
