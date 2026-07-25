import { NextResponse } from "next/server";
import { cleanupAuditLog } from "@/lib/audit-log";
import { isCronAuthorized } from "@/lib/cron-auth";
import { foldOldPageViews } from "@/lib/page-views";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const [deleted, foldedPageViewMonths] = await Promise.all([cleanupAuditLog(), foldOldPageViews()]);
  return NextResponse.json({ ok: true, deleted, foldedPageViewMonths });
}
