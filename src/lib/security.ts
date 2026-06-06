import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/origin";

export { isSameOrigin };

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
