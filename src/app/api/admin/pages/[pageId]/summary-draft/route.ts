import { NextResponse } from "next/server";
import { getPageByIdForAdmin } from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";
import {
  assessPageReadyForSummaryDraft,
  expandBlocksForSummary,
  formatBlocksForSummary,
  getAiGatewayConfig,
  requestSummaryDraftFromGateway,
} from "@/lib/summary-draft";
import type { ContentBlock } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  title?: unknown;
  blocks?: unknown;
};

/**
 * Draft a page summary via Vercel AI Gateway.
 * Uses the editor's current title + blocks (must be complete enough to summarize).
 * Expands live excerpts so the model sees included section text.
 * Does not persist — the client writes into the summary field for human edit + Save.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ pageId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { pageId } = await context.params;
  const existing = await getPageByIdForAdmin(pageId);
  if (!existing) {
    return NextResponse.json({ message: "Page not found." }, { status: 404 });
  }
  const denied = await requireKbAccess(guard.session, existing.kbId);
  if (denied) {
    return denied;
  }

  const limit = await rateLimit(`summary-draft:${guard.session.email}`, 8, 60);
  if (!limit.allowed) {
    return NextResponse.json({ message: "Too many summary draft requests. Try again shortly." }, { status: 429 });
  }

  const config = getAiGatewayConfig();
  if (!config) {
    return NextResponse.json(
      {
        message:
          "AI summary drafting is not configured. Set AI_PROVIDER_ENDPOINT, AI_API_KEY, and AI_MODEL on this deployment.",
      },
      { status: 501 },
    );
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const title = typeof body?.title === "string" ? body.title : existing.title;
  const blocks = Array.isArray(body?.blocks) ? (body.blocks as ContentBlock[]) : existing.blocks;

  const readiness = assessPageReadyForSummaryDraft({ title, blocks });
  if (!readiness.ok) {
    return NextResponse.json({ message: readiness.message }, { status: 422 });
  }

  try {
    const expanded = await expandBlocksForSummary(blocks);
    const bodyText = formatBlocksForSummary(expanded).trim() || readiness.bodyText;
    const summary = await requestSummaryDraftFromGateway({
      title: title.trim(),
      bodyText,
      ...config,
    });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logError(error, {
      route: "/api/admin/pages/[pageId]/summary-draft",
      action: "summary_draft",
      pageId,
    });
    const message = error instanceof Error ? error.message : "Could not draft a summary.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
