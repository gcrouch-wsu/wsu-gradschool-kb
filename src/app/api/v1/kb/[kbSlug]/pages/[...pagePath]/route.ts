import { NextResponse } from "next/server";
import { getKbReadAccess } from "@/lib/auth";
import { checkExcerptSourceForPublish } from "@/lib/excerpts";
import { isValidKaasApiKey } from "@/lib/kaas-auth";
import { getAssetStatusById, getKbBySlug, getPageByPath, updatePage } from "@/lib/kb-store";
import type { ContentBlock } from "@/lib/types";
import { logError } from "@/lib/log";
import { blocksToDocumentHtml, documentHtmlToBlocks } from "@/lib/page-document";
import { validatePageForPublish } from "@/lib/publish-gate";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function normalizeKaasBlocks(input: unknown, kbSlug: string): ContentBlock[] | null {
  if (!Array.isArray(input) || input.length === 0) {
    return null;
  }
  try {
    const html = blocksToDocumentHtml(input as ContentBlock[], kbSlug);
    const blocks = documentHtmlToBlocks(html);
    return blocks.length > 0 ? blocks : null;
  } catch {
    return null;
  }
}

/**
 * KaaS: public published article JSON for integrations (read + limited write).
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

/** Limited write: update summary and/or blocks on a published public page. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ kbSlug: string; pagePath: string[] }> },
) {
  if (!isValidKaasApiKey(request.headers.get("authorization"))) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { kbSlug, pagePath } = await context.params;
  const limit = await rateLimit(`kaas-write:${kbSlug}`, 30, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    summary?: unknown;
    blocks?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }
  if (body.summary !== undefined && typeof body.summary !== "string") {
    return NextResponse.json({ message: "Summary must be a string." }, { status: 400 });
  }
  if (body.blocks !== undefined && !Array.isArray(body.blocks)) {
    return NextResponse.json({ message: "Blocks must be an array." }, { status: 400 });
  }

  try {
    const kb = await getKbBySlug(kbSlug, false);
    if (!kb || kb.visibility !== "public" || kb.status !== "published") {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }
    const page = await getPageByPath(kb.id, pagePath, false);
    if (!page || (page.nodeKind ?? "page") !== "page" || page.status !== "published" || page.visibility === "staff") {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }
    const blocks =
      body.blocks === undefined ? page.blocks : normalizeKaasBlocks(body.blocks, kb.slug);
    if (!blocks) {
      return NextResponse.json({ message: "Blocks include unsupported or empty content." }, { status: 400 });
    }
    const summary = body.summary === undefined ? page.summary : body.summary;
    const issues = await validatePageForPublish(
      {
        ...page,
        blocks,
        summary,
      },
      getAssetStatusById,
      checkExcerptSourceForPublish,
      { requireSummary: kb.requireSummary !== false },
    );
    if (issues.length > 0) {
      return NextResponse.json(
        { message: "This page cannot remain published with the proposed content.", issues },
        { status: 422 },
      );
    }
    const updated = await updatePage(
      {
        pageId: page.id,
        title: page.title,
        blocks,
        summary,
        status: "published",
      },
      "kaas-write-api",
    );
    return NextResponse.json({
      ok: true,
      pageId: updated.id,
      updatedDisplayDate: updated.updatedDisplayDate,
    });
  } catch (error) {
    logError(error, { route: "/api/v1/kb/[kbSlug]/pages/[...pagePath]", action: "kaas_patch_page" });
    return NextResponse.json({ message: "Failed to update page." }, { status: 500 });
  }
}
