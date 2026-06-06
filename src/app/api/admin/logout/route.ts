import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminCookieOptions } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { message: "Request blocked: cross-origin request rejected." },
      { status: 403 },
    );
  }

  const response = NextResponse.redirect(new URL("/admin/sign-in", request.url), {
    status: 303,
  });
  response.cookies.set({
    ...getAdminCookieOptions(0),
    name: ADMIN_COOKIE_NAME,
    value: "",
  });
  return response;
}
