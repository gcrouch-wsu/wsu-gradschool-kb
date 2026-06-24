import { NextResponse } from "next/server";
import { canAccessKb, getCurrentAdminSession, type AdminSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/origin";

export { isSameOrigin };

export async function requireKbAccess(
  session: AdminSession,
  kbId: string | null | undefined,
): Promise<NextResponse | null> {
  if (!kbId) {
    return NextResponse.json({ message: "Knowledge base not found." }, { status: 404 });
  }

  const allowed = await canAccessKb(session, kbId);
  if (!allowed) {
    return NextResponse.json(
      { message: "You are not assigned to this knowledge base." },
      { status: 403 },
    );
  }
  return null;
}

type AdminGuardResult =
  | { ok: true; email: string; session: AdminSession }
  | { ok: false; response: NextResponse };

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
