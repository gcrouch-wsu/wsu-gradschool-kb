import { NextResponse } from "next/server";
import {
  discardStagedImport,
  getStagedImportDetail,
  updateStagedImport,
} from "@/lib/staged-imports";
import { requireAdminMutation } from "@/lib/security";
import type { ContentBlock, PageVisibility } from "@/lib/types";

export const runtime = "nodejs";

interface PatchBody {
  title?: unknown;
  slug?: unknown;
  summary?: unknown;
  parentPath?: unknown;
  visibility?: unknown;
  blocks?: unknown;
  media?: unknown;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ stagedImportId: string }> },
) {
  const guard = await requireAdminMutation(_request);
  if (!guard.ok) {
    return guard.response;
  }

  const { stagedImportId } = await context.params;
  const detail = await getStagedImportDetail(stagedImportId);
  if (!detail) {
    return NextResponse.json({ message: "Staged import not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ stagedImportId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { stagedImportId } = await context.params;
  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body) {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const parentPath = Array.isArray(body.parentPath)
    ? body.parentPath.filter((segment): segment is string => typeof segment === "string")
    : undefined;
  const visibility: PageVisibility | undefined =
    body.visibility === "staff" ? "staff" : body.visibility === "public" ? "public" : undefined;
  const blocks = Array.isArray(body.blocks) ? (body.blocks as ContentBlock[]) : undefined;
  const media = Array.isArray(body.media)
    ? (body.media as Array<{
        id: string;
        altText?: string;
        proposedTitle?: string;
        reviewStatus?: "pending" | "approved" | "rejected";
      }>)
    : undefined;

  try {
    const detail = await updateStagedImport(stagedImportId, {
      title: typeof body.title === "string" ? body.title : undefined,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      summary: typeof body.summary === "string" ? body.summary : undefined,
      parentPath,
      visibility,
      blocks,
      media,
    });
    return NextResponse.json({ ok: true, ...detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update staged import.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ stagedImportId: string }> },
) {
  const guard = await requireAdminMutation(_request);
  if (!guard.ok) {
    return guard.response;
  }

  const { stagedImportId } = await context.params;
  try {
    await discardStagedImport(stagedImportId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete staged import.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
