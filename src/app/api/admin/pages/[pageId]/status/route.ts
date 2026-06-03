import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { getKbById, updatePageStatus } from "@/lib/kb-store";
import type { PageStatus } from "@/lib/types";

interface StatusBody {
  status?: unknown;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<unknown> },
) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const params = (await context.params) as { pageId?: unknown };
  const pageId = typeof params.pageId === "string" ? params.pageId : "";
  const body = (await request.json().catch(() => null)) as StatusBody | null;
  const status: PageStatus | null =
    body?.status === "published" || body?.status === "draft" ? body.status : null;

  if (!status) {
    return NextResponse.json({ message: "Status must be draft or published." }, { status: 400 });
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
