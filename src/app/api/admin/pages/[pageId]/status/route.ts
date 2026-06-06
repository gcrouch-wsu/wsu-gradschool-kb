import { NextResponse } from "next/server";
import { getAssetStatusById, getKbById, getPageByIdForAdmin, updatePageStatus } from "@/lib/kb-store";
import { validatePageForPublish } from "@/lib/publish-gate";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";
import type { PageStatus } from "@/lib/types";

interface StatusBody {
  status?: unknown;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<unknown> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const params = (await context.params) as { pageId?: unknown };
  const pageId = typeof params.pageId === "string" ? params.pageId : "";

  const existingPage = await getPageByIdForAdmin(pageId);
  const denied = await requireKbAccess(guard.session, existingPage?.kbId);
  if (denied) {
    return denied;
  }

  const body = (await request.json().catch(() => null)) as StatusBody | null;
  const status: PageStatus | null =
    body?.status === "published" ||
    body?.status === "draft" ||
    body?.status === "archived"
      ? body.status
      : null;

  if (!status) {
    return NextResponse.json(
      { message: "Status must be draft, published, or archived." },
      { status: 400 },
    );
  }

  // Publishing from the tree runs the same gate against the page's stored content.
  if (status === "published") {
    const existing = await getPageByIdForAdmin(pageId);
    if (!existing) {
      return NextResponse.json({ message: "Page not found." }, { status: 404 });
    }
    const issues = await validatePageForPublish(existing, getAssetStatusById);
    if (issues.length > 0) {
      return NextResponse.json(
        {
          message: "This page cannot be published yet. Open the editor to resolve the issues below.",
          issues,
        },
        { status: 422 },
      );
    }
  }

  try {
    const page = await updatePageStatus(pageId, status);
    const kb = await getKbById(page.kbId);
    const url = kb ? `/kb/${kb.slug}/${page.path.join("/")}` : null;
    return NextResponse.json({ ok: true, pageId: page.id, status: page.status, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update page status.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
