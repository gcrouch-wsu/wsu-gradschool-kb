import { NextResponse } from "next/server";
import { tryAcquirePageLock, releasePageLock, isDatabaseEnabled } from "@/lib/db";
import { requireAdminMutation } from "@/lib/security";

export async function POST(
  request: Request,
  context: { params: Promise<{ pageId: string }> }
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ ok: true, message: "In-memory locks not supported." });
  }

  const { pageId } = await context.params;
  const userEmail = guard.session.email;

  try {
    const ok = await tryAcquirePageLock(pageId, userEmail);
    if (!ok) {
      return NextResponse.json(
        { message: "This page is currently being edited by another user." },
        { status: 409 } // Conflict
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: "Failed to acquire lock." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ pageId: string }> }
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ ok: true });
  }

  const { pageId } = await context.params;

  try {
    await releasePageLock(pageId, guard.session.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: "Failed to release lock." }, { status: 500 });
  }
}
