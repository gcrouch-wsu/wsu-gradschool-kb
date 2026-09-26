import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import { excerptAudienceFor, excerptSourceCheckerFor } from "@/lib/excerpts";
import { authenticateKaasRequest, kaasCanAccessKb } from "@/lib/kaas-auth";
import { createPage, getAssetStatusById, getKbBySlug, getVisiblePagesForKb } from "@/lib/kb-store";
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
 * List published pages in a KB the caller may access.
 * GET /api/v1/kb/{kbSlug}/pages
 * GET /api/v1/kb/{kbSlug}/pages?allNodes=true — also include group and link nodes (tree
 * structure, not articles), each tagged with nodeKind. Every entry always carries sortOrder,
 * so tree position is diagnosable from this response alone instead of read from source.
 */
export async function GET(request: Request, context: { params: Promise<{ kbSlug: string }> }) {
  const authResult = await authenticateKaasRequest(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { kbSlug } = await context.params;
  const includeAllNodes = new URL(request.url).searchParams.get("allNodes") === "true";
  const limit = await rateLimit(`kaas-list:${kbSlug}`, 60, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const kb = await getKbBySlug(kbSlug, false);
    if (!kb || !kaasCanAccessKb(authResult.auth, kb)) {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    const pages = (await getVisiblePagesForKb(kb.id, false))
      .filter((page) => includeAllNodes || (page.nodeKind ?? "page") === "page")
      .map((page) => ({
        id: page.id,
        title: page.title,
        slug: page.slug,
        path: page.path,
        summary: page.summary,
        updatedDisplayDate: page.updatedDisplayDate,
        nodeKind: page.nodeKind ?? "page",
        sortOrder: page.sortOrder,
      }));

    return NextResponse.json({
      kb: {
        id: kb.id,
        slug: kb.slug,
        title: kb.title,
        visibility: kb.visibility,
      },
      pages,
    });
  } catch (error) {
    logError(error, { route: "/api/v1/kb/[kbSlug]/pages", action: "kaas_list_pages" });
    return NextResponse.json({ message: "Failed to list pages." }, { status: 500 });
  }
}

/**
 * Create a published page in a KB the caller may access.
 * POST /api/v1/kb/{kbSlug}/pages
 * Body: { title, summary?, blocks, slug?, parentPath?, contactEmail? }
 */
export async function POST(request: Request, context: { params: Promise<{ kbSlug: string }> }) {
  const authResult = await authenticateKaasRequest(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { kbSlug } = await context.params;
  const limit = await rateLimit(`kaas-create:${kbSlug}`, 20, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    summary?: unknown;
    blocks?: unknown;
    slug?: unknown;
    parentPath?: unknown;
    contactEmail?: unknown;
    nodeKind?: unknown;
  } | null;

  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ message: "title is required." }, { status: 400 });
  }
  if (body.summary !== undefined && typeof body.summary !== "string") {
    return NextResponse.json({ message: "summary must be a string." }, { status: 400 });
  }
  if (body.slug !== undefined && typeof body.slug !== "string") {
    return NextResponse.json({ message: "slug must be a string." }, { status: 400 });
  }
  if (body.contactEmail !== undefined && typeof body.contactEmail !== "string") {
    return NextResponse.json({ message: "contactEmail must be a string." }, { status: 400 });
  }
  if (body.parentPath !== undefined) {
    if (!Array.isArray(body.parentPath) || body.parentPath.some((part) => typeof part !== "string")) {
      return NextResponse.json({ message: "parentPath must be an array of path segments." }, { status: 400 });
    }
  }
  if (body.nodeKind !== undefined && body.nodeKind !== "page" && body.nodeKind !== "group") {
    return NextResponse.json({ message: 'nodeKind must be "page" or "group".' }, { status: 400 });
  }
  const nodeKind = body.nodeKind === "group" ? "group" : "page";

  // A group is a tree heading only — no article body, so it skips the blocks requirement and
  // the publish gate entirely (there is nothing publishable about a heading).
  const blocks = nodeKind === "group" ? [] : normalizeKaasBlocks(body.blocks, kbSlug);
  if (nodeKind === "page" && !blocks) {
    return NextResponse.json({ message: "blocks must be a non-empty array of supported content." }, { status: 400 });
  }

  try {
    const kb = await getKbBySlug(kbSlug, false);
    if (!kb || !kaasCanAccessKb(authResult.auth, kb)) {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    const summary = typeof body.summary === "string" ? body.summary : "";
    const contactEmail =
      typeof body.contactEmail === "string" && body.contactEmail.trim()
        ? body.contactEmail.trim()
        : "kaas-agent@wsu.edu";
    const parentPath = Array.isArray(body.parentPath) ? (body.parentPath as string[]) : [];
    const title = body.title.trim();
    const slugHint = typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : "new-page";

    if (nodeKind === "page") {
      const issues = await validatePageForPublish(
        {
          title,
          slug: slugHint,
          summary,
          ownerLabel: kb.title,
          contactEmail,
          lastReviewedDate: new Date().toISOString().slice(0, 10),
          blocks: blocks as ContentBlock[],
        },
        getAssetStatusById,
        excerptSourceCheckerFor(excerptAudienceFor(kb, { visibility: "public" })),
        { requireSummary: kb.requireSummary !== false },
      );
      if (issues.length > 0) {
        return NextResponse.json(
          { message: "This page cannot be published with the proposed content.", issues },
          { status: 422 },
        );
      }
    }

    const created = await createPage({
      kbId: kb.id,
      title,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      parentPath,
      summary,
      blocks: blocks as ContentBlock[],
      status: "published",
      visibility: "public",
      contactEmail,
      ownerLabel: kb.title,
      nodeKind,
      authorEmail: "kaas-write-api",
    });

    await recordAuditEvent({
      actor: { email: "kaas-write-api", role: "admin" },
      action: "page.created",
      entityType: "page",
      entityId: created.id,
      entityLabel: created.title,
      kbId: created.kbId,
      details: {
        source: "kaas-write-api",
        status: created.status,
        path: created.path.join("/"),
      },
    });

    return NextResponse.json(
      {
        ok: true,
        page: {
          id: created.id,
          title: created.title,
          slug: created.slug,
          path: created.path,
          summary: created.summary,
          updatedDisplayDate: created.updatedDisplayDate,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logError(error, { route: "/api/v1/kb/[kbSlug]/pages", action: "kaas_create_page" });
    const message = error instanceof Error ? error.message : "Failed to create page.";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ message }, { status });
  }
}
