import { NextResponse } from "next/server";
import { insertUser, listUserAssignments, listUsers, replaceUserAssignments } from "@/lib/db-users";
import { isDatabaseEnabled } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/security";
import type { UserRole } from "@/lib/types";

export async function GET(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  if (guard.session.role !== "owner") {
    return NextResponse.json({ message: "Only owners can view users." }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ users: [] }); 
  }

  try {
    const users = await listUsers();

    const safeUsers = await Promise.all(
      users.map(async ({ passwordHash, ...user }) => ({
        ...user,
        kbAssignments: user.role === "editor" ? await listUserAssignments(user.id) : [],
      })),
    );
    return NextResponse.json({ users: safeUsers });
  } catch (error) {
    return NextResponse.json({ message: "Failed to list users." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const adminSession = guard.session;
  if (adminSession.role !== "owner") {
    return NextResponse.json({ message: "Only owners can create users." }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ message: "Database is not enabled." }, { status: 501 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.email || !body.password) {
    return NextResponse.json({ message: "Email and password are required." }, { status: 400 });
  }

  const role: UserRole = ["owner", "admin", "editor"].includes(body.role) ? body.role : "editor";

  try {
    const passwordHash = await hashPassword(body.password);
    const userId = `user-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await insertUser({
      id: userId,
      email: body.email.trim().toLowerCase(),
      fullName: body.fullName?.trim() || "",
      passwordHash,
      role,
      createdAt: now,
      updatedAt: now,
    });

    if (Array.isArray(body.kbAssignments)) {
      await replaceUserAssignments(userId, body.kbAssignments);
    }

    return NextResponse.json({ ok: true, userId });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create user." },
      { status: 500 },
    );
  }
}
