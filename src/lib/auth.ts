import { createHmac, timingSafeEqual, scryptSync, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { isDatabaseEnabled } from "@/lib/db";
import { ADMIN_COOKIE_NAME, IDLE_TTL_SECONDS } from "@/lib/session-constants";
import type { UserRole } from "@/lib/types";
import { loadUserByEmail, loadUserById, isUserAssignedToKb, listUserAssignments } from "@/lib/db-users";

export { ADMIN_COOKIE_NAME, IDLE_TTL_SECONDS };

const SESSION_TTL_SECONDS = 60 * 60 * 8;

export interface AdminSession {
  userId: string;
  email: string;
  role: UserRole;
  source: "env" | "managed";
  expiresAt: number;
  version: string;
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

function getBootstrapEmail() {
  return (
    readEnv("BOOTSTRAP_OWNER_EMAIL") ||
    readEnv("KB_ADMIN_EMAIL") ||
    (process.env.NODE_ENV === "production" ? undefined : "admin@example.edu")
  );
}

function getBootstrapPassword() {
  return (
    readEnv("BOOTSTRAP_OWNER_PASSWORD") ||
    readEnv("KB_ADMIN_PASSWORD") ||
    (process.env.NODE_ENV === "production" ? undefined : "ChangeMe123!")
  );
}

function getSessionSecret() {
  const email = getBootstrapEmail();
  const password = getBootstrapPassword();

  return (
    readEnv("BOOTSTRAP_OWNER_SESSION_SECRET") ||
    readEnv("KB_ADMIN_SESSION_SECRET") ||
    (email && password ? `dev-secret:${email}:${password}` : undefined) ||
    requireInProduction("KB_ADMIN_SESSION_SECRET", undefined)!
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

function bootstrapVersion(email: string, password: string) {
  return sign(`bootstrap:${email.toLowerCase()}:${password}`).slice(0, 32);
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

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64");
  const hash = scryptSync(password, salt, 64).toString("base64");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64).toString("base64");
  return safeEqual(hash, derived);
}

export async function validateAdminCredentials(email: string, password: string): Promise<AdminSession | null> {

  const bootstrapEmail = getBootstrapEmail();
  const bootstrapPassword = getBootstrapPassword();

  if (
    bootstrapEmail &&
    bootstrapPassword &&
    email.trim().toLowerCase() === bootstrapEmail.toLowerCase() &&
    safeEqual(password, bootstrapPassword)
  ) {
    return {
      userId: "bootstrap-owner",
      email: bootstrapEmail,
      role: "owner",
      source: "env",
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
      version: bootstrapVersion(bootstrapEmail, bootstrapPassword),
    };
  }

  const user = isDatabaseEnabled() ? await loadUserByEmail(email) : null;
  if (user && verifyPassword(password, user.passwordHash)) {
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      source: "managed",
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
      version: user.updatedAt,
    };
  }

  return null;
}

export function createAdminSessionToken(session: AdminSession) {
  const payload = toBase64Url(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

export async function readAdminSessionToken(token: string | undefined): Promise<AdminSession | null> {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    return null;
  }

  try {
    const session = JSON.parse(fromBase64Url(payload)) as AdminSession;
    if (!session.email || typeof session.expiresAt !== "number" || session.expiresAt <= Date.now()) {
      return null;
    }

    if (session.source === "managed") {
      const user = await loadUserById(session.userId);
      if (!user || user.updatedAt !== session.version) {
        return null;
      }
    } else {
      const bootstrapEmail = getBootstrapEmail();
      const bootstrapPassword = getBootstrapPassword();
      if (
        !bootstrapEmail ||
        !bootstrapPassword ||
        session.version !== bootstrapVersion(bootstrapEmail, bootstrapPassword)
      ) {
        return null;
      }
    }

    return session;
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

export async function canAccessKb(session: AdminSession, kbId: string): Promise<boolean> {
  if (session.role === "owner" || session.role === "admin") {
    return true;
  }
  if (session.role === "editor") {
    return isUserAssignedToKb(session.userId, kbId);
  }
  return false;
}

export async function accessibleKbIds(session: AdminSession): Promise<string[] | null> {
  if (session.role === "owner" || session.role === "admin") {
    return null;
  }
  if (session.role === "editor") {
    return listUserAssignments(session.userId);
  }
  return [];
}

export async function filterKbsForSession<T extends { id: string }>(
  session: AdminSession,
  kbs: T[],
): Promise<T[]> {
  const allowed = await accessibleKbIds(session);
  if (allowed === null) {
    return kbs;
  }
  const allowedSet = new Set(allowed);
  return kbs.filter((kb) => allowedSet.has(kb.id));
}
