import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminCookieOptions } from "@/lib/auth";

export async function POST(request: Request) {
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
