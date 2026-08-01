import { loadSiteSettings } from "@/lib/db";
import { recordAiUsageLater } from "@/lib/ai-usage";
import { logError } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";
import { resolveAiPrompt } from "@/lib/ai-prompts";
import { AiGatewayError, getAiGatewayConfig, hasBilledTokens } from "@/lib/ai-gateway";
import { DEFAULT_AI_PAGE_SYSTEM_PROMPT } from "@/lib/page-review-core";
import { requestPageReviewFromGateway } from "@/lib/page-review-gateway";
import type { ContentBlock } from "@/lib/types";
import { NextResponse } from "next/server";
import { getKbById, getPageByIdForAdmin } from "@/lib/kb-store";

export const runtime = "nodejs";
export const maxDuration = 90;

type Body = {
  title?: unknown;
  blocks?: unknown;
};

/**
 * AI page review: style / readability / grammar / alt suggestions.
 * Does not persist — client applies accepted suggestions into the editor draft.
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

  const limit = await rateLimit(`page-review:${guard.session.email}`, 6, 60);
  if (!limit.allowed) {
    return NextResponse.json({ message: "Too many page review requests. Try again shortly." }, { status: 429 });
  }

  const config = getAiGatewayConfig();
  if (!config) {
    return NextResponse.json(
      {
        message:
          "AI page review is not configured. Set AI_PROVIDER_ENDPOINT, AI_API_KEY, and AI_MODEL on this deployment.",
      },
      { status: 501 },
    );
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const title = typeof body?.title === "string" ? body.title : existing.title;
  const blocks = Array.isArray(body?.blocks) ? (body.blocks as ContentBlock[]) : existing.blocks;

  if (!title.trim()) {
    return NextResponse.json({ message: "Add a page title before running an AI page review." }, { status: 422 });
  }
  if (blocks.length === 0) {
    return NextResponse.json({ message: "Add page content before running an AI page review." }, { status: 422 });
  }

  try {
    const [siteSettings, kb] = await Promise.all([loadSiteSettings(), getKbById(existing.kbId)]);
    const systemPrompt = resolveAiPrompt(
      kb?.aiPagePrompt,
      siteSettings.aiPagePrompt,
      DEFAULT_AI_PAGE_SYSTEM_PROMPT,
    );
    const review = await requestPageReviewFromGateway({
      title: title.trim(),
      blocks,
      systemPrompt,
      ...config,
    });
    recordAiUsageLater({
      feature: "page_review",
      model: config.model,
      kbId: existing.kbId,
      usage: review.usage,
    });
    return NextResponse.json({
      ok: true,
      overview: review.overview,
      suggestions: review.suggestions,
    });
  } catch (error) {
    // Meter a call the provider billed before our parsing rejected it (FB-42).
    if (error instanceof AiGatewayError && hasBilledTokens(error.usage)) {
      recordAiUsageLater({
        feature: "page_review",
        model: config.model,
        kbId: existing.kbId,
        usage: error.usage,
      });
    }
    logError(error, {
      route: "/api/admin/pages/[pageId]/page-review",
      action: "page_review",
      pageId,
    });
    const message = error instanceof Error ? error.message : "Could not review the page.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
