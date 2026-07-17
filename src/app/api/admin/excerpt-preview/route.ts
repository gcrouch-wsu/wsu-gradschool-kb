import { NextResponse } from "next/server";
import { excerptAttributionLabel, resolveExcerptForRead } from "@/lib/excerpts";
import { blocksToSourceHtml } from "@/lib/page-document";
import { logError } from "@/lib/log";
import { requireAdminMutation } from "@/lib/security";

const MAX_REFS = 25;

interface PreviewRef {
  blockId?: unknown;
  sourcePageId?: unknown;
  sourceHeadingBlockId?: unknown;
  label?: unknown;
}

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as { refs?: unknown } | null;
  const refs = Array.isArray(body?.refs) ? (body.refs as PreviewRef[]).slice(0, MAX_REFS) : [];

  try {
    const results: Record<
      string,
      { state: "ok"; label: string; href: string; bodyHtml: string } | { state: "unavailable" }
    > = {};
    for (const ref of refs) {
      const blockId = typeof ref.blockId === "string" ? ref.blockId : "";
      const sourcePageId = typeof ref.sourcePageId === "string" ? ref.sourcePageId : "";
      if (!blockId) {
        continue;
      }
      const resolved = await resolveExcerptForRead(
        {
          sourcePageId,
          sourceHeadingBlockId:
            typeof ref.sourceHeadingBlockId === "string" && ref.sourceHeadingBlockId
              ? ref.sourceHeadingBlockId
              : undefined,
        },
        guard.session,
      );
      if (resolved.state !== "ok") {
        results[blockId] = { state: "unavailable" };
        continue;
      }
      results[blockId] = {
        state: "ok",
        label: excerptAttributionLabel(resolved, typeof ref.label === "string" ? ref.label : undefined),
        href: resolved.sourceHref,
        bodyHtml: blocksToSourceHtml(resolved.blocks),
      };
    }
    return NextResponse.json({ results });
  } catch (error) {
    logError(error, { route: "/api/admin/excerpt-preview", action: "resolve_excerpt_preview" });
    return NextResponse.json({ message: "Failed to resolve excerpt previews." }, { status: 500 });
  }
}
