import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { logError } from "@/lib/log";
import { scanSourcedContentForReview } from "@/lib/sourced-review";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily scan of sourced-content blocks for staleness (FB-34 remainder).
 * Reuses the Review dashboard scan path (hash compare against live allowlisted sources).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await scanSourcedContentForReview(null);
    return NextResponse.json({
      ok: true,
      checked: result.checked,
      findingsCount: result.findings.length,
      findings: result.findings.slice(0, 100),
    });
  } catch (error) {
    logError(error, { route: "/api/admin/cron/sourced-staleness", action: "sourced_staleness_cron" });
    return NextResponse.json({ message: "Sourced staleness scan failed." }, { status: 500 });
  }
}
