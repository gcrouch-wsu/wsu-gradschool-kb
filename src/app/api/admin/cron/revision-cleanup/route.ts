import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { cleanupPageRevisions } from "@/lib/kb-store";
import { cleanupPageServerDrafts } from "@/lib/page-server-drafts";

export const runtime = "nodejs";

// Retention cleanup: newest 50 revisions per page, plus abandoned server drafts.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const [deletedRevisions, deletedServerDrafts] = await Promise.all([
    cleanupPageRevisions(),
    cleanupPageServerDrafts(30),
  ]);
  return NextResponse.json({
    ok: true,
    deleted: deletedRevisions,
    deletedRevisions,
    deletedServerDrafts,
  });
}
