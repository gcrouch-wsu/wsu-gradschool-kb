import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { updatePageLayout } from "@/lib/kb-store";

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
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
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

  try {
    await updatePageLayout(kbId, items);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update page tree.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
