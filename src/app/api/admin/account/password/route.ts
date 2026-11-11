import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminCookieOptions,
  getCurrentAdminSession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { isDatabaseEnabled } from "@/lib/db";
import { loadUserById, updateUser } from "@/lib/db-users";
import { logError } from "@/lib/log";
import { validatePassword } from "@/lib/password-policy";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security";

const CHANGE_LIMIT = 10;
const CHANGE_WINDOW_SECONDS = 15 * 60;

/**
 * Self-service password change for the signed-in user.
 *
 * Deliberately not behind requireAdminMutation: that guard rejects viewers, and viewers are
 * exactly the users who most need to change a password an owner handed them. Any signed-in
 * managed user may change their own password — and only their own, since the target is the
 * session's user id, never a request field.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Request blocked: cross-origin request rejected." }, { status: 403 });
  }

  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }
  if (session.source !== "managed") {
    return NextResponse.json(
      {
        message:
          "This account's password is set by the deployment environment (BOOTSTRAP_OWNER_PASSWORD) and cannot be changed here.",
      },
      { status: 400 },
    );
  }
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ message: "Database is not enabled." }, { status: 501 });
  }

  const body = (await request.json().catch(() => null)) as
    | { currentPassword?: unknown; newPassword?: unknown }
    | null;
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ message: "Current and new passwords are required." }, { status: 400 });
  }

  // Same budget as sign-in: a stolen session cookie must not become an unlimited oracle for
  // guessing the account's current password.
  const clientKey = clientKeyFromHeaders(request.headers);
  const limit = await rateLimit(`password-change:${clientKey}:${session.userId}`, CHANGE_LIMIT, CHANGE_WINDOW_SECONDS);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Too many attempts. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const user = await loadUserById(session.userId);
    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return NextResponse.json({ message: "Current password is incorrect." }, { status: 400 });
    }
    if (newPassword === currentPassword) {
      return NextResponse.json({ message: "New password must be different from the current one." }, { status: 400 });
    }
    const problem = validatePassword(newPassword, { email: user.email, fullName: user.fullName });
    if (problem) {
      return NextResponse.json({ message: problem }, { status: 400 });
    }

    await updateUser({
      id: user.id,
      passwordHash: await hashPassword(newPassword),
      updatedAt: new Date().toISOString(),
    });

    // updated_at is the session version, so the update above signs out every session for this
    // user — including this one. Re-issue this browser's cookie against the new version so the
    // person who just changed their password stays signed in while any other sessions end.
    const refreshed = await loadUserById(user.id);
    const response = NextResponse.json({ ok: true });
    if (refreshed) {
      response.cookies.set({
        ...getAdminCookieOptions(),
        name: ADMIN_COOKIE_NAME,
        value: createAdminSessionToken({ ...session, version: refreshed.updatedAt }),
      });
    }
    return response;
  } catch (error) {
    logError(error, { route: "/api/admin/account/password", action: "change_password" });
    return NextResponse.json({ message: "Failed to change password." }, { status: 500 });
  }
}
