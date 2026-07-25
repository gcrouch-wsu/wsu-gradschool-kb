import { NextResponse } from "next/server";
import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";
import { getKbById, getPageByIdForAdmin } from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";

type FeedbackBody = {
  pageId?: unknown;
  helpful?: unknown;
  comment?: unknown;
};

/**
 * Public, privacy-light page feedback (FB-32). Accepted only for published public
 * pages in published public KBs. No cookies/IP/UA stored.
 */
export async function POST(request: Request) {
  const limit = await rateLimit("page-feedback", 40, 60);
  if (!limit.allowed) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as FeedbackBody | null;
  const pageId = typeof body?.pageId === "string" ? body.pageId.trim() : "";
  const helpful = body?.helpful === true ? true : body?.helpful === false ? false : null;
  const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 500) : "";

  if (!pageId || helpful === null) {
    return NextResponse.json({ message: "pageId and helpful (boolean) are required." }, { status: 400 });
  }

  try {
    const page = await getPageByIdForAdmin(pageId);
    if (!page || page.status !== "published" || page.visibility === "staff" || (page.nodeKind ?? "page") !== "page") {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }
    const kb = await getKbById(page.kbId);
    if (!kb || kb.visibility !== "public" || kb.status !== "published") {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    if (!isDatabaseEnabled()) {
      // In-memory mode accepts but does not persist (local/dev).
      return NextResponse.json({ ok: true, persisted: false });
    }

    await ensureSchema();
    const sql = getSql();
    const id = `feedback-${crypto.randomUUID()}`;
    await sql`
      INSERT INTO kb_page_feedback (id, page_id, kb_id, helpful, comment)
      VALUES (${id}, ${page.id}, ${page.kbId}, ${helpful}, ${comment})
    `;
    return NextResponse.json({ ok: true, persisted: true });
  } catch (error) {
    logError(error, { route: "/api/feedback", action: "page_feedback" });
    return NextResponse.json({ message: "Could not save feedback." }, { status: 500 });
  }
}
