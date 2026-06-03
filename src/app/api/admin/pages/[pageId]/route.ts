import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { getKbById, updatePage } from "@/lib/kb-store";
import type { ContentBlock, PageStatus, PageVisibility } from "@/lib/types";

interface UpdateBody {
  title?: unknown;
  slug?: unknown;
  parentPath?: unknown;
  summary?: unknown;
  visibility?: unknown;
  status?: unknown;
  sortOrder?: unknown;
  blocks?: unknown;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ pageId: string }> },
) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { pageId } = await context.params;
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug : undefined;
  const summary = typeof body.summary === "string" ? body.summary : undefined;
  const visibility: PageVisibility = body.visibility === "staff" ? "staff" : "public";
  const status: PageStatus = body.status === "published" ? "published" : "draft";
  const sortOrder = typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? body.sortOrder : undefined;
  const parentPath = Array.isArray(body.parentPath)
    ? body.parentPath.filter((segment): segment is string => typeof segment === "string")
    : [];
  const blocks = Array.isArray(body.blocks) ? (body.blocks as ContentBlock[]) : [];

  if (!title) {
    return NextResponse.json({ message: "Title is required." }, { status: 400 });
  }
  if (blocks.length === 0) {
    return NextResponse.json({ message: "A page must have at least one content block." }, { status: 400 });
  }

  try {
    const page = await updatePage({
      pageId,
      title,
      slug,
      summary,
      visibility,
      parentPath,
      status,
      sortOrder,
      blocks,
    });
    const kb = await getKbById(page.kbId);
    const url = kb ? `/kb/${kb.slug}/${page.path.join("/")}` : null;
    return NextResponse.json({ ok: true, pageId: page.id, status: page.status, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the page.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
