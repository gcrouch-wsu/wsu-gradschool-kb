import { NextResponse } from "next/server";
import { updatePageLayout } from "@/lib/kb-store";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

interface LayoutBody {
  kbId?: unknown;
  items?: unknown;
}

interface LayoutItemBody {
  pageId?: unknown;
  parentPath?: unknown;
  sortOrder?: unknown;
}

export async function PATCH(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = (await request.json().catch(() => null)) as LayoutBody | null;
  const kbId = typeof body?.kbId === "string" ? body.kbId : "";
  const rawItems = Array.isArray(body?.items) ? (body.items as LayoutItemBody[]) : [];
  const items = rawItems
    .map((item) => ({
      pageId: typeof item.pageId === "string" ? item.pageId : "",
      parentPath: Array.isArray(item.parentPath)
        ? item.parentPath.filter((segment): segment is string => typeof segment === "string")
        : [],
      sortOrder: typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder) ? item.sortOrder : 0,
    }))
    .filter((item) => item.pageId);

  if (!kbId || items.length === 0) {
    return NextResponse.json({ message: "Knowledge base and layout items are required." }, { status: 400 });
  }

  const denied = await requireKbAccess(guard.session, kbId);
  if (denied) {
    return denied;
  }

  try {
    await updatePageLayout(kbId, items, guard.session.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update page tree.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
