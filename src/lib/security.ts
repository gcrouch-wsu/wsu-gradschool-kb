import { NextResponse } from "next/server";
import { canAccessKb, getCurrentAdminSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/origin";

export { isSameOrigin };

/**
 * KB-scope check for editor-reachable mutations. Owners/Admins are KB-wide;
 * Editors must be assigned to the target KB (kb_user_assignments). Returns a
 * ready-to-return error response when access is denied, or null when allowed.
 */
export async function requireKbAccess(
  session: { userId: string; email: string; role: string },
  kbId: string | null | undefined,
): Promise<NextResponse | null> {
  if (!kbId) {
    return NextResponse.json({ message: "Knowledge base not found." }, { status: 404 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allowed = await canAccessKb(session as any, kbId);
  if (!allowed) {
    return NextResponse.json(
      { message: "You are not assigned to this knowledge base." },
      { status: 403 },
    );
  }
  return null;
}

type AdminGuardResult =
  | { ok: true; email: string; session: any }
  | { ok: false; response: NextResponse };

/**
 * Guard for admin mutation routes: requires a valid session AND a same-origin
 * request. Returns the signed-in email or a ready-to-return error response.
 */
export async function requireAdminMutation(request: Request): Promise<AdminGuardResult> {
  const session = await getCurrentAdminSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ message: "Unauthorized." }, { status: 401 }) };
  }
  if (!isSameOrigin(request)) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Request blocked: cross-origin request rejected." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, email: session.email, session };
}
