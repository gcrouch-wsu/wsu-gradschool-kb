import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminCookieOptions,
  validateAdminCredentials,
} from "@/lib/auth";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security";

// Login attempts allowed per client+account before a temporary lockout.
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { message: "Request blocked: cross-origin request rejected." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null;

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ message: "Email and password are required." }, { status: 400 });
  }

  // Rate-limit by client key + account so failed attempts cannot be brute-forced.
  const clientKey = clientKeyFromHeaders(request.headers);
  const limit = rateLimit(`login:${clientKey}:${email.toLowerCase()}`, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Too many sign-in attempts. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  if (!validateAdminCredentials(email, password)) {
    return NextResponse.json({ message: "Invalid email or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    ...getAdminCookieOptions(),
    name: ADMIN_COOKIE_NAME,
    value: createAdminSessionToken(email),
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    ...getAdminCookieOptions(0),
    name: ADMIN_COOKIE_NAME,
    value: "",
  });
  return response;
}
