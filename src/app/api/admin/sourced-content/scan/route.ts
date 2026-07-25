import { NextResponse } from "next/server";
import { accessibleKbIds, getCurrentAdminSession } from "@/lib/auth";
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
    const session = await getCurrentAdminSession();
    if (!session || session.role === "viewer") {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    const allowed = await accessibleKbIds(session);
    const result = await scanSourcedContentForReview(allowed);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logError(error, { route: "/api/admin/sourced-content/scan", action: "scan" });
    const message = error instanceof Error ? error.message : "Could not scan sourced content.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
