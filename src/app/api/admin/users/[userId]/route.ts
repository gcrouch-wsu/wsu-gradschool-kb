import { NextResponse } from "next/server";
import { updateUser, deleteUser, replaceUserAssignments } from "@/lib/db-users";
import { isDatabaseEnabled } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/security";
import type { User, UserRole } from "@/lib/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const adminSession = guard.session;
  if (adminSession.role !== "owner") {
    return NextResponse.json({ message: "Only owners can update users." }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ message: "Database is not enabled." }, { status: 501 });
  }

  const { userId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  try {
    const updates: Partial<User> = {};
    if (body.fullName !== undefined) updates.fullName = body.fullName.trim();
    if (body.email !== undefined) updates.email = body.email.trim().toLowerCase();
    if (body.role !== undefined) updates.role = body.role as UserRole;
    if (body.password) {
      updates.passwordHash = await hashPassword(body.password);
    }

    if (Object.keys(updates).length > 0) {
      await updateUser({ id: userId, ...updates, updatedAt: new Date().toISOString() });
    }

    if (Array.isArray(body.kbAssignments)) {
      await replaceUserAssignments(userId, body.kbAssignments);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update user." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const adminSession = guard.session;
  if (adminSession.role !== "owner") {
    return NextResponse.json({ message: "Only owners can delete users." }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ message: "Database is not enabled." }, { status: 501 });
  }

  const { userId } = await context.params;

  try {
    await deleteUser(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to delete user." },
      { status: 500 }
    );
  }
}
