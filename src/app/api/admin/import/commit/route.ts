import { NextResponse } from "next/server";
import { commitImportWithImagePromotion } from "@/lib/import-commit";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";
import type { ContentBlock, PageVisibility } from "@/lib/types";

export const runtime = "nodejs";

interface CommitBody {
  kbId?: unknown;
  title?: unknown;
  slug?: unknown;
  parentPath?: unknown;
  summary?: unknown;
  visibility?: unknown;
  blocks?: unknown;
}

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = (await request.json().catch(() => null)) as CommitBody | null;
  if (!body) {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const kbId = typeof body.kbId === "string" ? body.kbId : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug : undefined;
  const summary = typeof body.summary === "string" ? body.summary : undefined;
  const visibility: PageVisibility = body.visibility === "staff" ? "staff" : "public";
  const parentPath = Array.isArray(body.parentPath)
    ? body.parentPath.filter((segment): segment is string => typeof segment === "string")
    : [];
  const blocks = Array.isArray(body.blocks) ? (body.blocks as ContentBlock[]) : [];

  if (!kbId || !title) {
    return NextResponse.json({ message: "Knowledge base and title are required." }, { status: 400 });
  }
  if (blocks.length === 0) {
    return NextResponse.json({ message: "There is no content to import." }, { status: 400 });
  }

  const denied = await requireKbAccess(guard.session, kbId);
  if (denied) {
    return denied;
  }

  try {
    const { page, url } = await commitImportWithImagePromotion({
      kbId,
      title,
      slug,
      summary,
      visibility,
      parentPath,
      blocks,
    });
    return NextResponse.json({ ok: true, pageId: page.id, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the page.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
