import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import { excerptAudienceFor, excerptSourceCheckerFor } from "@/lib/excerpts";
import { authenticateKaasRequest, kaasCanAccessKb } from "@/lib/kaas-auth";
import {
  getAllPagesForAdmin,
  getAssetStatusById,
  getExcerptReferencesToPage,
  getKbBySlug,
  getPageByPath,
  permanentlyDeletePage,
  updatePage,
} from "@/lib/kb-store";
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
 * KaaS article JSON (read).
 * Auth: Authorization: Bearer <key> from KAAS_API_KEYS.
 * Scoped keys (`kb-slug:secret`) may read that published KB even when private.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ kbSlug: string; pagePath: string[] }> },
) {
  const authResult = await authenticateKaasRequest(request);
  if (!authResult.ok) {
    return authResult.response;
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
    if (!kb || !kaasCanAccessKb(authResult.auth, kb)) {
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
        visibility: kb.visibility,
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

/**
 * Limited write: update summary/blocks on a published page, or the structural position
 * (parentPath, sortOrder) of any node kind the key can access — including a group or link,
 * which have no article content to validate.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ kbSlug: string; pagePath: string[] }> },
) {
  const authResult = await authenticateKaasRequest(request);
  if (!authResult.ok) {
    return authResult.response;
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
    parentPath?: unknown;
    sortOrder?: unknown;
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
  if (
    body.parentPath !== undefined &&
    (!Array.isArray(body.parentPath) || body.parentPath.some((part) => typeof part !== "string"))
  ) {
    return NextResponse.json({ message: "parentPath must be an array of path segments." }, { status: 400 });
  }
  if (body.sortOrder !== undefined && (typeof body.sortOrder !== "number" || !Number.isFinite(body.sortOrder))) {
    return NextResponse.json({ message: "sortOrder must be a number." }, { status: 400 });
  }

  try {
    const kb = await getKbBySlug(kbSlug, false);
    if (!kb || !kaasCanAccessKb(authResult.auth, kb)) {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }
    const page = await getPageByPath(kb.id, pagePath, false);
    if (!page || page.status !== "published" || page.visibility === "staff") {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    const nodeKind = page.nodeKind ?? "page";
    let blocks = page.blocks;
    let summary = page.summary;

    if (nodeKind === "page") {
      if (body.blocks !== undefined) {
        const normalized = normalizeKaasBlocks(body.blocks, kb.slug);
        if (!normalized) {
          return NextResponse.json({ message: "Blocks include unsupported or empty content." }, { status: 400 });
        }
        blocks = normalized;
      }
      summary = body.summary === undefined ? page.summary : (body.summary as string);
      const issues = await validatePageForPublish(
        {
          ...page,
          blocks,
          summary,
        },
        getAssetStatusById,
        excerptSourceCheckerFor(excerptAudienceFor(kb, page)),
        { requireSummary: kb.requireSummary !== false },
      );
      if (issues.length > 0) {
        return NextResponse.json(
          { message: "This page cannot remain published with the proposed content.", issues },
          { status: 422 },
        );
      }
    } else if (body.blocks !== undefined || body.summary !== undefined) {
      return NextResponse.json(
        { message: `blocks and summary cannot be set on a ${nodeKind} node — it has no article content.` },
        { status: 400 },
      );
    }

    const updated = await updatePage(
      {
        pageId: page.id,
        title: page.title,
        slug: page.slug,
        parentPath: Array.isArray(body.parentPath) ? (body.parentPath as string[]) : undefined,
        sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
        blocks,
        summary,
        status: "published",
      },
      "kaas-write-api",
    );
    await recordAuditEvent({
      actor: { email: "kaas-write-api", role: "admin" },
      action: "page.updated",
      entityType: "page",
      entityId: updated.id,
      entityLabel: updated.title,
      kbId: updated.kbId,
      details: {
        source: "kaas-write-api",
        status: updated.status,
        path: updated.path.join("/"),
        summaryChanged: body.summary !== undefined,
        blocksChanged: body.blocks !== undefined,
        parentPathChanged: body.parentPath !== undefined,
        sortOrderChanged: body.sortOrder !== undefined,
      },
    });
    return NextResponse.json({
      ok: true,
      pageId: updated.id,
      path: updated.path,
      updatedDisplayDate: updated.updatedDisplayDate,
    });
  } catch (error) {
    logError(error, { route: "/api/v1/kb/[kbSlug]/pages/[...pagePath]", action: "kaas_patch_page" });
    const message = error instanceof Error ? error.message : "Failed to update page.";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ message }, { status });
  }
}

/**
 * Permanently delete a published page the key can access.
 *
 * No archive step first — unlike the admin UI's owner/admin-only two-step flow, a scoped
 * KaaS key is expected to be called deliberately by code, not clicked by a person who might
 * change their mind, so the extra confirmation step doesn't add real safety here. What does:
 * the same referential-integrity checks the admin route enforces (no child pages, no
 * relatedPageIds reference from another page, no excerpt reference) — those catch a delete
 * that would actually corrupt the KB, not just a delete someone might regret.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ kbSlug: string; pagePath: string[] }> },
) {
  const authResult = await authenticateKaasRequest(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { kbSlug, pagePath } = await context.params;
  const limit = await rateLimit(`kaas-delete:${kbSlug}`, 10, 60);
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
    const page = await getPageByPath(kb.id, pagePath, false);
    if (!page || (page.nodeKind ?? "page") !== "page" || page.status !== "published" || page.visibility === "staff") {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    const pages = await getAllPagesForAdmin(kb.id);
    const hasChildren = pages.some(
      (candidate) =>
        candidate.id !== page.id &&
        candidate.path.length > page.path.length &&
        page.path.every((segment, index) => candidate.path[index] === segment),
    );
    if (hasChildren) {
      return NextResponse.json(
        { message: "This page has child pages. Move or delete them first." },
        { status: 409 },
      );
    }
    const referencedBy = pages.find((candidate) => candidate.relatedPageIds.includes(page.id));
    if (referencedBy) {
      return NextResponse.json(
        { message: `Remove the related-page reference from "${referencedBy.title}" before deleting this page.` },
        { status: 409 },
      );
    }
    const excerptRefs = await getExcerptReferencesToPage(page.id);
    if (excerptRefs.length > 0) {
      return NextResponse.json(
        { message: `Remove the included excerpt on "${excerptRefs[0].pageTitle}" before deleting this page.` },
        { status: 409 },
      );
    }

    await permanentlyDeletePage(page.id);
    await recordAuditEvent({
      actor: { email: "kaas-write-api", role: "admin" },
      action: "page.deleted",
      entityType: "page",
      entityId: page.id,
      entityLabel: page.title,
      kbId: page.kbId,
      details: { source: "kaas-write-api", path: page.path.join("/") },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(error, { route: "/api/v1/kb/[kbSlug]/pages/[...pagePath]", action: "kaas_delete_page" });
    return NextResponse.json({ message: "Failed to delete page." }, { status: 500 });
  }
}
