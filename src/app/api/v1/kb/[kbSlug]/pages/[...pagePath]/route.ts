import { NextResponse } from "next/server";
import { getKbReadAccess } from "@/lib/auth";
import { isValidKaasApiKey } from "@/lib/kaas-auth";
import { getKbBySlug, getPageByPath } from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Read-only KaaS: public published article JSON for integrations.
 * Auth: Authorization: Bearer <key> where key is listed in KAAS_API_KEYS.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ kbSlug: string; pagePath: string[] }> },
) {
  if (!isValidKaasApiKey(request.headers.get("authorization"))) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { kbSlug, pagePath } = await context.params;
  const limit = await rateLimit(`kaas:${kbSlug}`, 120, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const kb = await getKbBySlug(kbSlug, false);
    if (!kb || kb.visibility !== "public" || kb.status !== "published") {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    const access = await getKbReadAccess(null, kb);
    if (!access.canRead) {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    const page = await getPageByPath(kb.id, pagePath, false);
    if (!page || (page.nodeKind ?? "page") !== "page" || page.visibility === "staff") {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    return NextResponse.json({
      kb: {
        id: kb.id,
        slug: kb.slug,
        title: kb.title,
      },
      page: {
        id: page.id,
        title: page.title,
        slug: page.slug,
        path: page.path,
        summary: page.summary,
        lastReviewedDate: page.lastReviewedDate,
        updatedDisplayDate: page.updatedDisplayDate,
        blocks: page.blocks,
      },
    });
  } catch (error) {
    logError(error, { route: "/api/v1/kb/[kbSlug]/pages/[...pagePath]", action: "kaas_get_page" });
    return NextResponse.json({ message: "Failed to load page." }, { status: 500 });
  }
}
