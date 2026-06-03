import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, IDLE_TTL_SECONDS } from "@/lib/session-constants";

export { ADMIN_COOKIE_NAME, IDLE_TTL_SECONDS };

// Absolute session lifetime, enforced inside the signed token.
const SESSION_TTL_SECONDS = 60 * 60 * 8;
// The cookie's max-age is set to IDLE_TTL_SECONDS and slid forward on each
// authenticated navigation (see src/proxy.ts), so an inactive session is dropped
// by the browser after the idle window even though the token's absolute lifetime
// is longer. project_spec.md §4 recommends 8h fixed lifetime + 60m idle.

interface AdminSession {
  email: string;
  expiresAt: number;
}

function requireInProduction(name: string, value: string | undefined) {
  if (process.env.NODE_ENV === "production" && !value) {
    throw new Error(
      `${name} must be set in production. Refusing to fall back to development defaults.`,
    );
  }
  return value;
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function getAdminEmail() {
  return (
    requireInProduction(
      "KB_ADMIN_EMAIL or BOOTSTRAP_OWNER_EMAIL",
      readEnv("KB_ADMIN_EMAIL") || readEnv("BOOTSTRAP_OWNER_EMAIL"),
    ) || "admin@example.edu"
  );
}

function getAdminPassword() {
  return (
    requireInProduction(
      "KB_ADMIN_PASSWORD or BOOTSTRAP_OWNER_PASSWORD",
      readEnv("KB_ADMIN_PASSWORD") || readEnv("BOOTSTRAP_OWNER_PASSWORD"),
    ) || "ChangeMe123!"
  );
}

function getSessionSecret() {
  return (
    requireInProduction(
      "KB_ADMIN_SESSION_SECRET or BOOTSTRAP_OWNER_SESSION_SECRET",
      readEnv("KB_ADMIN_SESSION_SECRET") || readEnv("BOOTSTRAP_OWNER_SESSION_SECRET"),
    ) ||
    `dev-secret:${getAdminEmail()}:${getAdminPassword()}`
  );
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  const maxLength = Math.max(leftBuffer.length, rightBuffer.length);
  const leftPadded = Buffer.alloc(maxLength);
  const rightPadded = Buffer.alloc(maxLength);
  leftBuffer.copy(leftPadded);
  rightBuffer.copy(rightPadded);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftPadded, rightPadded);
}

export function validateAdminCredentials(email: string, password: string) {
  const emailMatches = email.trim().toLowerCase() === getAdminEmail().toLowerCase();
  const passwordMatches = safeEqual(password, getAdminPassword());
  return emailMatches && passwordMatches;
}

export function createAdminSessionToken(email = getAdminEmail()) {
  const payload = toBase64Url(
    JSON.stringify({
      email,
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    } satisfies AdminSession),
  );
  return `${payload}.${sign(payload)}`;
}

export function readAdminSessionToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    return null;
  }

  try {
    const session = JSON.parse(fromBase64Url(payload)) as Partial<AdminSession>;
    if (!session.email || typeof session.expiresAt !== "number" || session.expiresAt <= Date.now()) {
      return null;
    }
    return session as AdminSession;
  } catch {
    return null;
  }
}

export async function getCurrentAdminSession() {
  const cookieStore = await cookies();
  return readAdminSessionToken(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

export function getAdminCookieOptions(maxAge = IDLE_TTL_SECONDS) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
