import { NextResponse } from "next/server";
import { deactivateRedirect, removeRedirect } from "@/lib/kb-store";
import { requireAdminMutation } from "@/lib/security";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ redirectId: string }> },
) {
  const guard = await requireAdminMutation(_request);
  if (!guard.ok) {
    return guard.response;
  }

  const { redirectId } = await context.params;
  try {
    await removeRedirect(redirectId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete redirect.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ redirectId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { redirectId } = await context.params;
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  if (body?.status === "inactive") {
    try {
      await deactivateRedirect(redirectId);
      return NextResponse.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update redirect.";
      return NextResponse.json({ message }, { status: 400 });
    }
  }

  return NextResponse.json({ message: "Unsupported update." }, { status: 400 });
}
