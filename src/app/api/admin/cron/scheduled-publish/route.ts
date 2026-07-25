import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { publishDueDraftPages } from "@/lib/kb-store";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await publishDueDraftPages();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logError(error, { route: "/api/admin/cron/scheduled-publish", action: "scheduled_publish" });
    return NextResponse.json({ message: "Scheduled publish failed." }, { status: 500 });
  }
}
