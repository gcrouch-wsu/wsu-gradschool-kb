import { NextResponse } from "next/server";
import { isDatabaseEnabled, updateKbTheme } from "@/lib/db";
import { mergeTheme } from "@/lib/kb-theme";
import { logError } from "@/lib/log";
import { requireAdminMutation } from "@/lib/security";

export async function PATCH(request: Request, context: { params: Promise<{ kbId: string }> }) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (guard.session.role !== "owner") {
    return NextResponse.json({ message: "Only owners can manage styles." }, { status: 403 });
  }
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ message: "Database is not enabled; styles cannot be saved." }, { status: 501 });
  }

  const { kbId } = await context.params;
  const body = (await request.json().catch(() => null)) as { theme?: unknown } | null;
  if (!body) {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const theme = mergeTheme(body.theme ?? body);
  try {
    await updateKbTheme(kbId, theme);
    return NextResponse.json({ ok: true, theme });
  } catch (error) {
    logError(error, { route: "/api/admin/kbs/[kbId]/theme", action: "update_kb_theme", kbId });
    const message = error instanceof Error ? error.message : "Could not save styles.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
