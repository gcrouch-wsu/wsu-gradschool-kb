import { NextResponse } from "next/server";
import { updateUser, deleteUser, loadUserById, replaceUserAssignments } from "@/lib/db-users";
import { isDatabaseEnabled } from "@/lib/db";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminCookieOptions,
  hashPassword,
} from "@/lib/auth";
import { logError } from "@/lib/log";
import { validatePassword } from "@/lib/password-policy";
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
    if (body.role !== undefined && ["owner", "admin", "manager", "editor", "viewer"].includes(body.role)) {
      updates.role = body.role as UserRole;
    }
    if (body.password !== undefined) {
      const target = await loadUserById(userId);
      if (!target) {
        return NextResponse.json({ message: "User not found." }, { status: 404 });
      }
      const passwordProblem = validatePassword(body.password, {
        email: updates.email ?? target.email,
        fullName: updates.fullName ?? target.fullName,
      });
      if (passwordProblem) {
        return NextResponse.json({ message: passwordProblem }, { status: 400 });
      }
      // Changing the hash bumps updated_at, which is the session version — every existing
      // session for this user is signed out, which is what an admin reset should do.
      updates.passwordHash = await hashPassword(body.password);
    }

    if (Object.keys(updates).length > 0) {
      await updateUser({ id: userId, ...updates, updatedAt: new Date().toISOString() });
    }

    if (Array.isArray(body.kbAssignments)) {
      const currentUser = updates.role ? null : await loadUserById(userId);
      const nextRole = updates.role ?? currentUser?.role;
      await replaceUserAssignments(
        userId,
        nextRole === "editor" || nextRole === "viewer" || nextRole === "manager" ? body.kbAssignments : [],
      );
    }

    const response = NextResponse.json({ ok: true });
    // Any update bumps updated_at (the session version). When an owner edits their own row —
    // most often resetting their own password here — re-issue their cookie so they are not
    // signed out mid-task. Role is still rebound from the DB on every read, so this can't widen it.
    if (Object.keys(updates).length > 0 && adminSession.source === "managed" && adminSession.userId === userId) {
      const refreshed = await loadUserById(userId);
      if (refreshed) {
        response.cookies.set({
          ...getAdminCookieOptions(),
          name: ADMIN_COOKIE_NAME,
          value: createAdminSessionToken({ ...adminSession, version: refreshed.updatedAt }),
        });
      }
    }
    return response;
  } catch (error) {
    logError(error, { route: "/api/admin/users/[userId]", action: "update_user", userId });
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
    logError(error, { route: "/api/admin/users/[userId]", action: "delete_user", userId });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to delete user." },
      { status: 500 }
    );
  }
}
