import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminSessionToken, readAdminSessionToken, validateAdminCredentials } from "@/lib/auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("bootstrap owner sessions", () => {
  it("rejects tokens after bootstrap password rotation", async () => {
    vi.stubEnv("KB_ADMIN_EMAIL", "owner@example.edu");
    vi.stubEnv("KB_ADMIN_PASSWORD", "first-password");
    vi.stubEnv("KB_ADMIN_SESSION_SECRET", "stable-session-secret");

    const session = await validateAdminCredentials("owner@example.edu", "first-password");
    expect(session).not.toBeNull();
    const token = createAdminSessionToken(session!);
    expect(await readAdminSessionToken(token)).not.toBeNull();

    vi.stubEnv("KB_ADMIN_PASSWORD", "second-password");
    expect(await readAdminSessionToken(token)).toBeNull();
  });

  it("returns null (not a crash) for unknown emails when no database is configured", async () => {
    vi.stubEnv("KB_ADMIN_EMAIL", "owner@example.edu");
    vi.stubEnv("KB_ADMIN_PASSWORD", "first-password");
    vi.stubEnv("KB_ADMIN_SESSION_SECRET", "stable-session-secret");
    vi.stubEnv("DATABASE_URL", "");

    expect(await validateAdminCredentials("someone-else@example.edu", "whatever")).toBeNull();
  });
});
