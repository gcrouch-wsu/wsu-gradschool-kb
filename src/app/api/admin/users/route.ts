import { NextResponse } from "next/server";
import { insertUser, listUsers, replaceUserAssignments } from "@/lib/db-users";
import { isDatabaseEnabled } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/security";
import type { UserRole } from "@/lib/types";

export async function GET(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  // We should enforce owner-only or allow admins to list users.
  // For MVP, admins can list but perhaps only owners can create.
  // We'll rely on the UI and role checks inside the endpoint.

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ users: [] }); // In-memory doesn't support full user CRUD
  }

  try {
    const users = await listUsers();
    // Scrub password hashes before sending to client
    const safeUsers = users.map(({ passwordHash, ...user }) => user);
    return NextResponse.json({ users: safeUsers });
  } catch (error) {
    return NextResponse.json({ message: "Failed to list users." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  // Only Owners can create users.
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

    // Add KB assignments
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

