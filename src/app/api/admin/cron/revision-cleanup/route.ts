import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { cleanupPageRevisions } from "@/lib/kb-store";

export const runtime = "nodejs";

// Retention cleanup: keeps the newest 50 revisions per page.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const deleted = await cleanupPageRevisions();
  return NextResponse.json({ ok: true, deleted });
}
